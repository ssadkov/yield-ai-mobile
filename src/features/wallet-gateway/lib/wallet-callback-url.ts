import { WALLET_CALLBACK_QUERY_PARAM } from "@/core/wallet";

type WalletCallbackChain = "aptos" | "solana";

const SOLANA_DEEPLINK_PATHS = new Set([
  "onConnect",
  "onDisconnect",
  "onSignAndSendTransaction",
  "onSignTransaction",
  "onSignMessage",
]);

const APTOS_DEEPLINK_PATHS = new Set([
  "onAptosConnect",
  "onAptosDisconnect",
  "onAptosSignAndSendTransaction",
  "onAptosSignTransaction",
  "onAptosSignMessage",
]);

// Petra's mobile2mobile protocol redirects to `<scheme>:///api/v1/<endpoint>`.
const APTOS_DEEPLINK_PATH_PREFIX = "/api/v1/";

function getSearchParams(urlOrPath: string): URLSearchParams | null {
  try {
    return new URL(urlOrPath).searchParams;
  } catch {
    const query = urlOrPath.split("?")[1];
    return query ? new URLSearchParams(query) : null;
  }
}

function getCallbackName(urlOrPath: string): string | null {
  const callback = getSearchParams(urlOrPath)?.get(WALLET_CALLBACK_QUERY_PARAM);
  if (callback) return callback;

  try {
    const withoutScheme = urlOrPath.replace(/^[^:]+:\/\/\/?/, "");
    return withoutScheme.split("?")[0] || null;
  } catch {
    return null;
  }
}

function getUrlPath(urlOrPath: string): string | null {
  try {
    return new URL(urlOrPath).pathname || null;
  } catch {
    const path = urlOrPath.split("?")[0];
    return path.startsWith("/") ? path : null;
  }
}

function normalizeAptosPath(path: string): string {
  if (path.startsWith("/v1/")) {
    return `/api${path}`;
  }
  return path;
}

export function resolveWalletCallbackChain(urlOrPath: string): WalletCallbackChain | null {
  const path = getUrlPath(urlOrPath);
  if (path && normalizeAptosPath(path).startsWith(APTOS_DEEPLINK_PATH_PREFIX)) {
    return "aptos";
  }

  const callback = getCallbackName(urlOrPath);
  if (callback && SOLANA_DEEPLINK_PATHS.has(callback)) return "solana";
  if (callback && APTOS_DEEPLINK_PATHS.has(callback)) return "aptos";

  return null;
}

export function isWalletCallbackUrl(urlOrPath: string): boolean {
  return resolveWalletCallbackChain(urlOrPath) !== null;
}
