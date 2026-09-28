import { Buffer } from "buffer";
import bs58 from "bs58";
import { PermissionsAndroid, Platform } from "react-native";
import {
  SeedVault,
  SeedVaultPermissionAndroid,
} from "@solana-mobile/seed-vault-lib";
import type { SolanaWalletAdapter, SolanaWalletConfig } from "../model/types";

type SeedVaultAuthToken = string | number;

type SeedVaultSeed = {
  authToken: SeedVaultAuthToken;
};

type SeedVaultAccount = {
  derivationPath: string;
  publicKeyEncoded: string;
};

type SeedVaultSigningResult = {
  signatures?: string[];
};

type SeedVaultNative = {
  isSeedVaultAvailable(allowSimulated: boolean): Promise<boolean>;
  getAuthorizedSeeds(): Promise<SeedVaultSeed[]>;
  authorizeNewSeed(): Promise<{ authToken: SeedVaultAuthToken }>;
  getUserWallets(authToken: SeedVaultAuthToken): Promise<SeedVaultAccount[]>;
  getAccounts(
    authToken: SeedVaultAuthToken,
    filterOnColumn?: string,
    value?: string,
  ): Promise<SeedVaultAccount[]>;
  deauthorizeSeed(authToken: SeedVaultAuthToken): void;
  signTransaction(
    authToken: SeedVaultAuthToken,
    derivationPath: string,
    transaction: string,
  ): Promise<SeedVaultSigningResult>;
  signMessage(
    authToken: SeedVaultAuthToken,
    derivationPath: string,
    message: string,
  ): Promise<SeedVaultSigningResult>;
};

const seedVault = SeedVault as unknown as SeedVaultNative;
const PUBLIC_KEY_LENGTH = 32;
const SIGNATURE_LENGTH = 64;

async function ensureSeedVaultPermission(): Promise<void> {
  if (Platform.OS !== "android") return;

  const granted = await PermissionsAndroid.check(SeedVaultPermissionAndroid);
  if (granted) return;

  const result = await PermissionsAndroid.request(SeedVaultPermissionAndroid, {
    title: "Seed Vault Permission",
    message: "Yield AI needs permission to access Seed Vault.",
    buttonNegative: "Cancel",
    buttonPositive: "OK",
  });

  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Seed Vault permission was denied");
  }
}

function readShortVec(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let offset = start;

  while (offset < bytes.length) {
    const byte = bytes[offset];
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return { value, next: offset };
    shift += 7;
  }

  throw new Error("Invalid Solana shortvec encoding");
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function decodeBase64PublicKey(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1) {
    return null;
  }

  const bytes = Buffer.from(value, "base64");
  const roundTrip = bytes.toString("base64").replace(/=+$/, "");
  if (bytes.length !== PUBLIC_KEY_LENGTH || roundTrip !== value.replace(/=+$/, "")) {
    return null;
  }
  return bytes;
}

function decodePublicKey(value: string): Uint8Array {
  const base64 = decodeBase64PublicKey(value);
  if (base64) return base64;

  const base58 = bs58.decode(value);
  if (base58.length !== PUBLIC_KEY_LENGTH) {
    throw new Error("Invalid Seed Vault public key");
  }
  return base58;
}

function signatureFromResult(result: SeedVaultSigningResult): Uint8Array {
  const signature = result.signatures?.[0];
  if (!signature) throw new Error("Seed Vault returned no signature");

  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== SIGNATURE_LENGTH) {
    throw new Error("Seed Vault returned an invalid signature");
  }
  return bytes;
}

function extractTransactionMessage(transaction: Uint8Array): Uint8Array {
  const signatureCount = readShortVec(transaction, 0);
  const messageOffset = signatureCount.next + signatureCount.value * SIGNATURE_LENGTH;
  if (messageOffset >= transaction.length) {
    throw new Error("Invalid Solana transaction");
  }
  return transaction.slice(messageOffset);
}

function findSignatureIndex(transaction: Uint8Array, publicKey: Uint8Array): number {
  const signatureCount = readShortVec(transaction, 0);
  const messageOffset = signatureCount.next + signatureCount.value * SIGNATURE_LENGTH;
  if (messageOffset + 3 > transaction.length) {
    throw new Error("Invalid Solana transaction");
  }

  const messagePrefix = transaction[messageOffset];
  const headerOffset = (messagePrefix & 0x80) !== 0 ? messageOffset + 1 : messageOffset;
  if (headerOffset + 3 > transaction.length) {
    throw new Error("Invalid Solana transaction");
  }

  const requiredSignatures = transaction[headerOffset];
  const accountCount = readShortVec(transaction, headerOffset + 3);
  const accountKeysOffset = accountCount.next;

  for (let index = 0; index < Math.min(requiredSignatures, accountCount.value); index += 1) {
    const keyOffset = accountKeysOffset + index * PUBLIC_KEY_LENGTH;
    const key = transaction.slice(keyOffset, keyOffset + PUBLIC_KEY_LENGTH);
    if (key.length === PUBLIC_KEY_LENGTH && bytesEqual(key, publicKey)) {
      return index;
    }
  }

  throw new Error("Seed Vault signer is not required by transaction");
}

function attachSignature(
  transaction: Uint8Array,
  publicKey: Uint8Array,
  signature: Uint8Array,
): string {
  const signatureCount = readShortVec(transaction, 0);
  const signatureIndex = findSignatureIndex(transaction, publicKey);
  if (signatureIndex >= signatureCount.value) {
    throw new Error("Seed Vault signer is not required by transaction");
  }

  const signed = new Uint8Array(transaction);
  const signatureOffset = signatureCount.next + signatureIndex * SIGNATURE_LENGTH;
  signed.set(signature, signatureOffset);
  return Buffer.from(signed).toString("base64");
}

export class SeedVaultAdapter implements SolanaWalletAdapter {
  readonly name = "Seed Vault";

  private authToken: SeedVaultAuthToken | null = null;
  private derivationPath: string | null = null;
  private publicKey: Uint8Array | null = null;

  constructor(private config: SolanaWalletConfig) {}

  async connect(): Promise<{ address: string; chain: string }> {
    const isAvailable = await seedVault.isSeedVaultAvailable(__DEV__);
    if (!isAvailable) throw new Error("Seed Vault is not available on this device");

    await ensureSeedVaultPermission();

    const { authToken, account } = await this.resolveAccount();
    const publicKey = decodePublicKey(account.publicKeyEncoded);

    this.authToken = authToken;
    this.derivationPath = account.derivationPath;
    this.publicKey = publicKey;

    if (__DEV__) {
      console.log("[SeedVault] connected", {
        walletId: this.config.walletId,
        derivationPath: this.derivationPath,
      });
    }

    return { address: bs58.encode(publicKey), chain: "solana" };
  }

  async disconnect(): Promise<void> {
    if (this.authToken != null) {
      seedVault.deauthorizeSeed(this.authToken);
    }
    this.authToken = null;
    this.derivationPath = null;
    this.publicKey = null;
  }

  async signAndSendTransaction(): Promise<string> {
    throw new Error("Seed Vault signAndSendTransaction is not supported");
  }

  async signTransaction(transaction: Uint8Array): Promise<string> {
    const session = this.requireSession();
    const message = extractTransactionMessage(transaction);
    const result = await seedVault.signTransaction(
      session.authToken,
      session.derivationPath,
      Buffer.from(message).toString("base64"),
    );
    return attachSignature(
      transaction,
      session.publicKey,
      signatureFromResult(result),
    );
  }

  async signMessage(message: Uint8Array): Promise<string> {
    const session = this.requireSession();
    const result = await seedVault.signMessage(
      session.authToken,
      session.derivationPath,
      Buffer.from(message).toString("base64"),
    );
    return Buffer.from(signatureFromResult(result)).toString("base64");
  }

  dispose(): void {
    this.authToken = null;
    this.derivationPath = null;
    this.publicKey = null;
  }

  private async resolveAccount(): Promise<{
    authToken: SeedVaultAuthToken;
    account: SeedVaultAccount;
  }> {
    const authorizedSeeds = await this.getAuthorizedSeeds();
    for (const { authToken } of authorizedSeeds) {
      const account = await this.firstAccountForSeed(authToken);
      if (account) return { authToken, account };
    }

    const { authToken } = await seedVault.authorizeNewSeed();
    try {
      const account = await this.firstAccountForSeed(authToken);
      if (!account) throw new Error("Seed Vault returned no wallet accounts");
      return { authToken, account };
    } catch (error) {
      try {
        seedVault.deauthorizeSeed(authToken);
      } catch (cleanupError) {
        if (__DEV__) {
          console.warn("[SeedVault] failed to roll back seed authorization", cleanupError);
        }
      }
      throw error;
    }
  }

  private async getAuthorizedSeeds(): Promise<SeedVaultSeed[]> {
    try {
      return await seedVault.getAuthorizedSeeds();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /Permission Denial|ACCESS_SEED_VAULT_PRIVILEGED|grantUriPermission/i.test(
          message,
        )
      ) {
        return [];
      }
      throw error;
    }
  }

  private async firstAccountForSeed(
    authToken: SeedVaultAuthToken,
  ): Promise<SeedVaultAccount | null> {
    const userWallets = await seedVault.getUserWallets(authToken);
    if (userWallets[0]) return userWallets[0];

    const accounts = await seedVault.getAccounts(authToken, undefined, undefined);
    return accounts[0] ?? null;
  }

  private requireSession(): {
    authToken: SeedVaultAuthToken;
    derivationPath: string;
    publicKey: Uint8Array;
  } {
    if (this.authToken == null || !this.derivationPath || !this.publicKey) {
      throw new Error("Wallet not connected");
    }

    return {
      authToken: this.authToken,
      derivationPath: this.derivationPath,
      publicKey: this.publicKey,
    };
  }
}
