import { Buffer } from "buffer";
import bs58 from "bs58";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol";
import type {
  SolanaCluster,
  SolanaWalletAdapter,
  SolanaWalletConfig,
} from "../model/types";

type MwaChain = "solana:mainnet" | "solana:testnet" | "solana:devnet";

const APP_IDENTITY_URI = "https://yieldai.app";

function chainForCluster(cluster: SolanaCluster): MwaChain {
  switch (cluster) {
    case "mainnet-beta":
      return "solana:mainnet";
    case "testnet":
      return "solana:testnet";
    case "devnet":
      return "solana:devnet";
  }
}

function debugErrorPayload(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };
  const details = error as Error & {
    code?: unknown;
    data?: unknown;
    jsonRpcMessageId?: unknown;
    userInfo?: unknown;
  };
  return {
    name: details.name,
    message: details.message,
    code: details.code,
    data: details.data,
    jsonRpcMessageId: details.jsonRpcMessageId,
    userInfo: details.userInfo,
  };
}

export class MwaAdapter implements SolanaWalletAdapter {
  readonly name = "Mobile Wallet Adapter";

  private authToken: string | null = null;
  private connectedAddress: string | null = null;
  private connectedAddressBase64: string | null = null;
  private walletUriBase: string | null = null;

  constructor(private config: SolanaWalletConfig) {}

  private get authorizeParams(): Record<string, unknown> {
    return {
      identity: {
        name: this.config.appName,
        uri: APP_IDENTITY_URI,
      },
      chain: chainForCluster(this.config.cluster),
      auth_token: this.authToken ?? undefined,
    };
  }

  private async transact<T>(
    operation: string,
    callback: (wallet: any) => Promise<T>,
  ): Promise<T> {
    try {
      if (__DEV__) {
        console.log("[MWA] start transact", {
          operation,
          usingWalletUriBase: Boolean(this.walletUriBase),
          walletUriBase: this.walletUriBase,
        });
      }
      return this.walletUriBase
        ? await transact(callback, { baseUri: this.walletUriBase })
        : await transact(callback);
    } catch (error) {
      if (__DEV__) {
        console.warn("[MWA] operation failed", {
          operation,
          error: debugErrorPayload(error),
        });
      }
      throw error;
    }
  }

  async connect(): Promise<{ address: string; chain: string }> {
    const result = await this.transact("connect.authorize", async (wallet: any) => {
      const auth = await wallet.authorize(this.authorizeParams);
      if (__DEV__) {
        console.log("[MWA] authorize result", {
          walletUriBase: auth.wallet_uri_base,
          walletIconPresent: Boolean(auth.wallet_icon),
          accounts: auth.accounts?.map((account: any) => ({
            label: account.label,
            iconPresent: Boolean(account.icon),
            chains: account.chains,
            features: account.features,
            addressType: typeof account.address,
          })),
        });
      }
      this.authToken = auth.auth_token;
      this.walletUriBase =
        typeof auth.wallet_uri_base === "string" && auth.wallet_uri_base.length > 0
          ? auth.wallet_uri_base
          : this.walletUriBase;
      if (__DEV__) {
        console.log("[MWA] saved wallet_uri_base", {
          receivedWalletUriBase: auth.wallet_uri_base,
          savedWalletUriBase: this.walletUriBase,
        });
      }
      return auth;
    });

    const raw = result.accounts?.[0]?.address;
    const rawBase64 =
      typeof raw === "string" ? raw : Buffer.from(raw).toString("base64");
    const address =
      typeof raw === "string"
        ? bs58.encode(Buffer.from(raw, "base64"))
        : bs58.encode(raw);

    this.connectedAddress = address;
    this.connectedAddressBase64 = rawBase64;
    return { address, chain: "solana" };
  }

  async disconnect(): Promise<void> {
    if (!this.authToken) return;
    try {
      await this.transact("disconnect.deauthorize", async (wallet: any) => {
        await wallet.deauthorize({ auth_token: this.authToken });
      });
    } finally {
      if (__DEV__) {
        console.log("[MWA] clearing wallet session", {
          walletUriBase: this.walletUriBase,
          hadAuthToken: Boolean(this.authToken),
        });
      }
      this.authToken = null;
      this.connectedAddress = null;
      this.connectedAddressBase64 = null;
      this.walletUriBase = null;
    }
  }

  async signAndSendTransaction(transaction: Uint8Array): Promise<string> {
    if (!this.authToken) throw new Error("Wallet not connected");

    const result = await this.transact("signAndSendTransaction", async (wallet: any) => {
      await wallet.authorize(this.authorizeParams);
      return await wallet.signAndSendTransactions({
        payloads: [Buffer.from(transaction).toString("base64")],
      });
    });

    const signature = result.signatures?.[0];
    if (!signature) throw new Error("No signature returned");
    return typeof signature === "string"
      ? signature
      : Buffer.from(signature).toString("base64");
  }

  async signTransaction(transaction: Uint8Array): Promise<string> {
    if (!this.authToken) throw new Error("Wallet not connected");

    const result = await this.transact("signTransaction", async (wallet: any) => {
      await wallet.authorize(this.authorizeParams);
      return await wallet.signTransactions({
        payloads: [Buffer.from(transaction).toString("base64")],
      });
    });

    const signedTx = result.signed_payloads?.[0];
    if (!signedTx) throw new Error("No signed transaction returned");
    return typeof signedTx === "string"
      ? signedTx
      : Buffer.from(signedTx).toString("base64");
  }

  async signMessage(message: Uint8Array): Promise<string> {
    if (!this.authToken) throw new Error("Wallet not connected");
    if (!this.connectedAddressBase64) throw new Error("Wallet address not available");

    const result = await this.transact("signMessage", async (wallet: any) => {
      await wallet.authorize(this.authorizeParams);
      return await wallet.signMessages({
        addresses: [this.connectedAddressBase64],
        payloads: [Buffer.from(message).toString("base64")],
      });
    });

    const sig = result.signed_payloads?.[0];
    if (!sig) throw new Error("No signature returned");
    return typeof sig === "string" ? sig : Buffer.from(sig).toString("base64");
  }

  dispose(): void {
    if (__DEV__) {
      console.log("[MWA] dispose wallet session", {
        walletUriBase: this.walletUriBase,
        hadAuthToken: Boolean(this.authToken),
      });
    }
    this.authToken = null;
    this.connectedAddress = null;
    this.connectedAddressBase64 = null;
    this.walletUriBase = null;
  }
}
