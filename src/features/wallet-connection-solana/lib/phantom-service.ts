import nacl from "tweetnacl";
import bs58 from "bs58";
import { Buffer } from "buffer";
import * as ExpoLinking from "expo-linking";
import { Platform } from "react-native";
import { WALLET_CALLBACK_QUERY_PARAM } from "@/core/wallet";

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
} from "./phantom-types";
import type { SolanaWalletConfig } from "../model/types";

const PHANTOM_ANDROID_DEEPLINK_BASE = "phantom://v1";
const PHANTOM_UNIVERSAL_LINK_BASE = "https://phantom.app/ul/v1";

function getPhantomDeeplinkBase(): string {
  // Keep the package-targeted Android flow on Phantom's protocol handler so it
  // bypasses Android app-link resolution, as the original implementation did.
  return Platform.OS === "android"
    ? PHANTOM_ANDROID_DEEPLINK_BASE
    : PHANTOM_UNIVERSAL_LINK_BASE;
}

export function generateDAppKeyPair(): DAppKeyPair {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  };
}

export function deriveSharedSecret(
  dAppSecretKey: Uint8Array,
  phantomPublicKey: Uint8Array,
): Uint8Array {
  return nacl.box.before(phantomPublicKey, dAppSecretKey);
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
    throw new Error("Failed to decrypt payload from Phantom");
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
  return `${getPhantomDeeplinkBase()}/connect?${params.toString()}`;
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
  return `${getPhantomDeeplinkBase()}/disconnect?${params.toString()}`;
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
  return `${getPhantomDeeplinkBase()}/signAndSendTransaction?${params.toString()}`;
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
  return `${getPhantomDeeplinkBase()}/signTransaction?${params.toString()}`;
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
  return `${getPhantomDeeplinkBase()}/signMessage?${params.toString()}`;
}

// ─── Response Parsers ─────────────────────────────────────────────────────────

export function parseConnectResponse(
  params: ConnectResponseParams,
  dAppSecretKey: Uint8Array,
): { payload: ConnectPayload; phantomEncryptionPublicKey: Uint8Array; sharedSecret: Uint8Array } {
  const phantomEncryptionPublicKey = bs58.decode(params.phantom_encryption_public_key);
  const sharedSecret = deriveSharedSecret(dAppSecretKey, phantomEncryptionPublicKey);
  const payload = decryptPayload<ConnectPayload>(params.data, params.nonce, sharedSecret);
  return { payload, phantomEncryptionPublicKey, sharedSecret };
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

export function isPhantomErrorResponse(params: Record<string, string>): boolean {
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
