import nacl from "tweetnacl";
import bs58 from "bs58";
import { Buffer } from "buffer";
import * as ExpoLinking from "expo-linking";

import type {
  DAppKeyPair,
  ConnectResponseParams,
  ConnectPayload,
  SignAndSendTransactionResponseParams,
  SignAndSendTransactionPayload,
  SignTransactionResponseParams,
  SignTransactionPayload,
  SignMessageResponseParams,
  SignMessagePayload,
} from "./backpack-types";
import type { SolanaWalletConfig } from "../model/types";
import { WALLET_CALLBACK_QUERY_PARAM } from "@/core/wallet";

// Backpack only documents universal links — custom scheme `backpack://v1/...`
// opens the app but its internal router ignores the path, so requests silently
// land on the home screen. Use the universal link on both platforms.
const BACKPACK_DEEPLINK_BASE = "https://backpack.app/ul/v1";

export function generateDAppKeyPair(): DAppKeyPair {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  };
}

export function deriveSharedSecret(
  dAppSecretKey: Uint8Array,
  walletPublicKey: Uint8Array,
): Uint8Array {
  return nacl.box.before(walletPublicKey, dAppSecretKey);
}

export function encryptPayload(
  payload: object,
  sharedSecret: Uint8Array,
): { data: string; nonce: string } {
  const nonce = nacl.randomBytes(24);
  const message = Buffer.from(JSON.stringify(payload));
  const encrypted = nacl.box.after(message, nonce, sharedSecret);
  if (!encrypted) {
    throw new Error("Failed to encrypt payload");
  }
  return {
    data: bs58.encode(encrypted),
    nonce: bs58.encode(nonce),
  };
}

export function decryptPayload<T = unknown>(
  data: string,
  nonce: string,
  sharedSecret: Uint8Array,
): T {
  const decodedData = bs58.decode(data);
  const decodedNonce = bs58.decode(nonce);
  const decrypted = nacl.box.open.after(decodedData, decodedNonce, sharedSecret);
  if (!decrypted) {
    throw new Error("Failed to decrypt payload from Backpack");
  }
  return JSON.parse(Buffer.from(decrypted).toString("utf8")) as T;
}

function buildRedirectLink(appScheme: string, callback: string): string {
  return ExpoLinking.createURL("/", {
    scheme: appScheme,
    queryParams: { [WALLET_CALLBACK_QUERY_PARAM]: callback },
  });
}

export function buildConnectURL(
  config: SolanaWalletConfig,
  dAppPublicKey: Uint8Array,
): string {
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dAppPublicKey),
    cluster: config.cluster,
    app_url: `https://${config.appScheme}.app`,
    redirect_link: buildRedirectLink(config.appScheme, "onConnect"),
  });
  return `${BACKPACK_DEEPLINK_BASE}/connect?${params.toString()}`;
}

export function buildDisconnectURL(
  config: SolanaWalletConfig,
  dAppPublicKey: Uint8Array,
  session: string,
  sharedSecret: Uint8Array,
): string {
  const { data, nonce } = encryptPayload({ session }, sharedSecret);
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dAppPublicKey),
    nonce,
    payload: data,
    redirect_link: buildRedirectLink(config.appScheme, "onDisconnect"),
  });
  return `${BACKPACK_DEEPLINK_BASE}/disconnect?${params.toString()}`;
}

export function buildSignAndSendTransactionURL(
  config: SolanaWalletConfig,
  dAppPublicKey: Uint8Array,
  session: string,
  sharedSecret: Uint8Array,
  serializedTransaction: Uint8Array,
): string {
  const payload = { session, transaction: bs58.encode(serializedTransaction) };
  const { data, nonce } = encryptPayload(payload, sharedSecret);
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dAppPublicKey),
    nonce,
    payload: data,
    redirect_link: buildRedirectLink(config.appScheme, "onSignAndSendTransaction"),
  });
  return `${BACKPACK_DEEPLINK_BASE}/signAndSendTransaction?${params.toString()}`;
}

export function buildSignTransactionURL(
  config: SolanaWalletConfig,
  dAppPublicKey: Uint8Array,
  session: string,
  sharedSecret: Uint8Array,
  serializedTransaction: Uint8Array,
): string {
  const payload = { session, transaction: bs58.encode(serializedTransaction) };
  const { data, nonce } = encryptPayload(payload, sharedSecret);
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dAppPublicKey),
    nonce,
    payload: data,
    redirect_link: buildRedirectLink(config.appScheme, "onSignTransaction"),
  });
  return `${BACKPACK_DEEPLINK_BASE}/signTransaction?${params.toString()}`;
}

export function buildSignMessageURL(
  config: SolanaWalletConfig,
  dAppPublicKey: Uint8Array,
  session: string,
  sharedSecret: Uint8Array,
  message: Uint8Array,
): string {
  const payload = { session, message: bs58.encode(message) };
  const { data, nonce } = encryptPayload(payload, sharedSecret);
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dAppPublicKey),
    nonce,
    payload: data,
    redirect_link: buildRedirectLink(config.appScheme, "onSignMessage"),
  });
  return `${BACKPACK_DEEPLINK_BASE}/signMessage?${params.toString()}`;
}

// ─── Response Parsers ─────────────────────────────────────────────────────────

export function parseConnectResponse(
  params: ConnectResponseParams,
  dAppSecretKey: Uint8Array,
): { payload: ConnectPayload; walletEncryptionPublicKey: Uint8Array; sharedSecret: Uint8Array } {
  const walletEncryptionPublicKey = bs58.decode(params.wallet_encryption_public_key);
  const sharedSecret = deriveSharedSecret(dAppSecretKey, walletEncryptionPublicKey);
  const payload = decryptPayload<ConnectPayload>(params.data, params.nonce, sharedSecret);
  return { payload, walletEncryptionPublicKey, sharedSecret };
}

export function parseSignAndSendTransactionResponse(
  params: SignAndSendTransactionResponseParams,
  sharedSecret: Uint8Array,
): SignAndSendTransactionPayload {
  return decryptPayload<SignAndSendTransactionPayload>(params.data, params.nonce, sharedSecret);
}

export function parseSignTransactionResponse(
  params: SignTransactionResponseParams,
  sharedSecret: Uint8Array,
): SignTransactionPayload {
  return decryptPayload<SignTransactionPayload>(params.data, params.nonce, sharedSecret);
}

export function parseSignMessageResponse(
  params: SignMessageResponseParams,
  sharedSecret: Uint8Array,
): SignMessagePayload {
  return decryptPayload<SignMessagePayload>(params.data, params.nonce, sharedSecret);
}

export function isBackpackErrorResponse(params: Record<string, string>): boolean {
  return "errorCode" in params && "errorMessage" in params;
}

export function extractQueryParams(url: string): Record<string, string> {
  const urlObj = new URL(url);
  const params: Record<string, string> = {};
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}
