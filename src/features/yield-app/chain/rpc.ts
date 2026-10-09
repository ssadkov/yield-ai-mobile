import { NET } from "./config";

/**
 * Minimal JSON-RPC for the network's send path: the public Devnet RPC, or on Mainnet the
 * API's /rpc transport (same RPC that built the plan, mandatory preflight, no signer).
 * Errors read "Solana RPC <code>: <message>" like the wallet layer's submitSignedTransaction.
 */
async function call<T>(method: string, params: unknown[], url = NET.rpcUrl): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON error page.
  }
  if (json && "result" in json) return json.result as T;
  // JSON-RPC error, or the API transport's own envelope {error:{code,message}}.
  const code = json?.error?.code;
  const message = json?.error?.message ?? `HTTP ${res.status}`;
  throw new RpcError(code === undefined ? `Solana RPC: ${message}` : `Solana RPC ${code}: ${message}`, res.status, code, json?.error);
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: number | string,
    /** The error object as the RPC returned it (the API transport adds CU price, limit and fee). */
    readonly body?: unknown,
  ) {
    super(message);
  }
}

/**
 * The API transport refused the transaction itself (4xx with its own string code, e.g.
 * INVALID_TRANSACTION or a failed preflight), so it never reached the network.
 */
export function isTransportRejection(e: unknown): boolean {
  return e instanceof RpcError && typeof e.code === "string" && e.httpStatus >= 400 && e.httpStatus < 500;
}

export function sendRaw(txBase64: string, opts: { skipPreflight?: boolean } = {}): Promise<string> {
  // The Mainnet transport always runs preflight and rejects extra options.
  const skip = opts.skipPreflight && !NET.rpcUrl.endsWith("/rpc");
  return call<string>("sendTransaction", [txBase64, { encoding: "base64", ...(skip ? { skipPreflight: true } : { preflightCommitment: "confirmed" }) }]);
}

export function blockHeight(): Promise<number> {
  return call<number>("getBlockHeight", [{ commitment: "confirmed" }], NET.heightRpcUrl);
}
