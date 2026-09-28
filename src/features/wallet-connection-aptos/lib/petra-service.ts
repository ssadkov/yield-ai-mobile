import nacl from "tweetnacl";
import { Buffer } from "buffer";

import type {
  DAppKeyPair,
  PetraConnectApprovedResponse,
  PetraConnectRequest,
  PetraEncryptedRequest,
} from "./petra-types";
import type { AptosWalletConfig } from "../model/types";

// Petra's deeplink protocol per https://github.com/aptos-labs/mobile2mobile-example
// Key facts that bit us in earlier attempts:
//  - Triple-slash base `petra:///api/v1` (the `/api/` segment matters; without
//    it Petra's router treats the URL as "open the app, ignore the path").
//  - Single `data=<base64-JSON>` envelope with camelCase fields.
//  - All cryptographic values are hex-encoded, not base58.
const PETRA_LINK_BASE = "petra:///api/v1";

// ─── Crypto helpers ──────────────────────────────────────────────────────────

export function generateDAppKeyPair(): DAppKeyPair {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  };
}

export function deriveSharedSecret(
  dAppSecretKey: Uint8Array,
  petraPublicKeyHex: string,
): Uint8Array {
  // petraPublicEncryptedKey arrives as `0x<hex>` — strip the prefix.
  const hex = petraPublicKeyHex.startsWith("0x")
    ? petraPublicKeyHex.slice(2)
    : petraPublicKeyHex;
  const petraPublicKey = Buffer.from(hex, "hex");
  return nacl.box.before(petraPublicKey, dAppSecretKey);
}

// Encrypts a JSON-serialisable payload with the shared secret. Mirrors the
// reference example which double-encodes (base64 inside, then nacl-encrypts
// the JSON of that string).
export function encryptPayload(
  payload: object,
  sharedSecret: Uint8Array,
): { payloadHex: string; nonceHex: string } {
  const inner = Buffer.from(JSON.stringify(payload)).toString("base64");
  const nonce = nacl.randomBytes(24);
  const message = Buffer.from(JSON.stringify(inner));
  const encrypted = nacl.box.after(message, nonce, sharedSecret);
  if (!encrypted) {
    throw new Error("Failed to encrypt payload for Petra");
  }
  return {
    payloadHex: Buffer.from(encrypted).toString("hex"),
    nonceHex: Buffer.from(nonce).toString("hex"),
  };
}

// Decrypts a hex-encoded encrypted payload returned by Petra in a sign
// response. Returns the parsed object.
export function decryptPayload<T = unknown>(
  payloadHex: string,
  nonceHex: string,
  sharedSecret: Uint8Array,
): T {
  const ciphertext = Buffer.from(payloadHex, "hex");
  const nonce = Buffer.from(nonceHex, "hex");
  const decrypted = nacl.box.open.after(ciphertext, nonce, sharedSecret);
  if (!decrypted) {
    throw new Error("Failed to decrypt payload from Petra");
  }
  // Reverse the double-encoding from encryptPayload: outer JSON is a string
  // that's a base64 encoding of the actual JSON.
  const outer = JSON.parse(Buffer.from(decrypted).toString("utf8"));
  if (typeof outer !== "string") return outer as T;
  const inner = Buffer.from(outer, "base64").toString("utf8");
  return JSON.parse(inner) as T;
}

// ─── URL builders ────────────────────────────────────────────────────────────

function dappLinkBase(appScheme: string): string {
  return `${appScheme}:///api/v1`;
}

function buildAppInfo(config: AptosWalletConfig) {
  return {
    domain: `https://${config.appScheme}.app`,
    name: config.appName,
  };
}

function encodeData(data: object): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

export function buildConnectURL(
  config: AptosWalletConfig,
  dAppPublicKey: Uint8Array,
): string {
  const data: PetraConnectRequest = {
    appInfo: buildAppInfo(config),
    redirectLink: `${dappLinkBase(config.appScheme)}/connect`,
    dappEncryptionPublicKey: Buffer.from(dAppPublicKey).toString("hex"),
  };
  return `${PETRA_LINK_BASE}/connect?data=${encodeData(data)}`;
}

export function buildDisconnectURL(
  config: AptosWalletConfig,
  dAppPublicKey: Uint8Array,
): string {
  const data: PetraConnectRequest = {
    appInfo: buildAppInfo(config),
    redirectLink: `${dappLinkBase(config.appScheme)}/disconnect`,
    dappEncryptionPublicKey: Buffer.from(dAppPublicKey).toString("hex"),
  };
  return `${PETRA_LINK_BASE}/disconnect?data=${encodeData(data)}`;
}

/** Normalizes web/mobile payload to Petra's documented entry_function_payload shape. */
export function normalizePetraEntryFunctionPayload(raw: object): Record<string, unknown> {
  const obj = raw as Record<string, unknown>;
  const fn = obj.function;
  const typeArgs = obj.type_arguments ?? obj.typeArguments;
  const args = obj.arguments ?? obj.functionArguments;
  return {
    type: "entry_function_payload",
    function: typeof fn === "string" ? fn : "",
    type_arguments: Array.isArray(typeArgs) ? typeArgs.map(String) : [],
    arguments: Array.isArray(args) ? args : [],
  };
}

export function buildSignAndSubmitURL(
  config: AptosWalletConfig,
  dAppPublicKey: Uint8Array,
  sharedSecret: Uint8Array,
  txPayload: object,
): string {
  const entryPayload = normalizePetraEntryFunctionPayload(txPayload);
  const { payloadHex, nonceHex } = encryptPayload(entryPayload, sharedSecret);
  const data: PetraEncryptedRequest = {
    appInfo: buildAppInfo(config),
    payload: payloadHex,
    redirectLink: `${dappLinkBase(config.appScheme)}/response`,
    dappEncryptionPublicKey: Buffer.from(dAppPublicKey).toString("hex"),
    nonce: nonceHex,
  };
  return `${PETRA_LINK_BASE}/signAndSubmit?data=${encodeData(data)}`;
}

function encryptPlaintextPayload(
  plaintext: string,
  sharedSecret: Uint8Array,
): { payloadHex: string; nonceHex: string } {
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box.after(Buffer.from(plaintext), nonce, sharedSecret);
  if (!encrypted) {
    throw new Error("Failed to encrypt payload for Petra");
  }
  return {
    payloadHex: Buffer.from(encrypted).toString("hex"),
    nonceHex: Buffer.from(nonce).toString("hex"),
  };
}

export function buildSignMessageURL(
  config: AptosWalletConfig,
  dAppPublicKey: Uint8Array,
  sharedSecret: Uint8Array,
  message: string,
): string {
  const { payloadHex, nonceHex } = encryptPlaintextPayload(message, sharedSecret);
  const data: PetraEncryptedRequest = {
    appInfo: buildAppInfo(config),
    payload: payloadHex,
    redirectLink: `${dappLinkBase(config.appScheme)}/response`,
    dappEncryptionPublicKey: Buffer.from(dAppPublicKey).toString("hex"),
    nonce: nonceHex,
  };
  return `${PETRA_LINK_BASE}/signMessage?data=${encodeData(data)}`;
}

// ─── Response parsers ────────────────────────────────────────────────────────

export interface PetraResponse {
  approved: boolean;
  data: string | null;
}

// Reads `response=approved|rejected` and `data=<base64-JSON>` from a redirect
// URL emitted by Petra.
export function parsePetraResponse(url: string): PetraResponse {
  const parsed = new URL(url);
  const params = parsed.searchParams;
  return {
    approved: params.get("response") === "approved",
    data: params.get("data"),
  };
}

export function parseConnectApproved(
  encodedData: string,
): PetraConnectApprovedResponse {
  return JSON.parse(Buffer.from(encodedData, "base64").toString("utf8"));
}

function decodePetraDataParam(encodedData: string): unknown {
  return JSON.parse(Buffer.from(encodedData, "base64").toString("utf8"));
}

function isPetraEncryptedEnvelope(
  value: unknown,
): value is { payload: string; nonce: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { payload?: unknown }).payload === "string" &&
    typeof (value as { nonce?: unknown }).nonce === "string"
  );
}

/** Petra may return sign results as plain JSON or as an encrypted payload envelope. */
function isPetraPlainSignResponse(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.hash === "string" ||
    typeof obj.transactionHash === "string" ||
    typeof obj.signature === "string" ||
    typeof obj.fullMessage === "string"
  );
}

export function parsePetraSignResponseBody(
  encodedData: string,
  sharedSecret?: Uint8Array,
): Record<string, unknown> {
  const parsed = decodePetraDataParam(encodedData);

  if (isPetraPlainSignResponse(parsed)) {
    return parsed;
  }

  if (!sharedSecret) {
    throw new Error("No active Petra session");
  }

  if (isPetraEncryptedEnvelope(parsed)) {
    return decryptPayload<Record<string, unknown>>(
      parsed.payload,
      parsed.nonce,
      sharedSecret,
    );
  }

  throw new Error("Unsupported Petra sign response format");
}

/** Normalizes `scheme://api/v1/...` (host=api) to `/api/v1/...`. */
export function normalizePetraCallbackPath(urlOrPath: string): string | null {
  let path: string | null = null;
  try {
    path = new URL(urlOrPath).pathname || null;
  } catch {
    const withoutQuery = urlOrPath.split("?")[0];
    const match = withoutQuery.match(/\/api\/v1\/[^?#]*/);
    if (match) {
      path = match[0];
    } else if (withoutQuery.startsWith("/api/v1/")) {
      path = withoutQuery;
    }
  }

  if (!path) return null;
  if (path.startsWith("/v1/")) {
    return `/api${path}`;
  }
  return path;
}

export function parseAptosTransactionPayload(transaction: Uint8Array): object {
  const text = Buffer.from(transaction).toString("utf8").trim();
  if (!text) {
    throw new Error("Empty Aptos transaction payload");
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    return JSON.parse(text) as object;
  }
  throw new Error(
    "Aptos transaction must be a JSON entry_function_payload string",
  );
}

// Path of the incoming deeplink, e.g. "/api/v1/connect" or "/api/v1/response".
export function getPetraResponsePath(url: string): string | null {
  return normalizePetraCallbackPath(url);
}
