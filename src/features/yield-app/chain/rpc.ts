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
  throw new Error(code === undefined ? `Solana RPC: ${message}` : `Solana RPC ${code}: ${message}`);
}

export function sendRaw(txBase64: string, opts: { skipPreflight?: boolean } = {}): Promise<string> {
  // The Mainnet transport always runs preflight and rejects extra options.
  const skip = opts.skipPreflight && !NET.rpcUrl.endsWith("/rpc");
  return call<string>("sendTransaction", [txBase64, { encoding: "base64", ...(skip ? { skipPreflight: true } : { preflightCommitment: "confirmed" }) }]);
}

export function blockHeight(): Promise<number> {
  return call<number>("getBlockHeight", [{ commitment: "confirmed" }], NET.heightRpcUrl);
}
