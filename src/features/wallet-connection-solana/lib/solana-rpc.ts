import type { SolanaCluster } from "../model/types";

const CLUSTER_RPC_URLS: Record<SolanaCluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

function envRpcUrl(cluster: SolanaCluster): string | undefined {
  const clusterUrl =
    cluster === "mainnet-beta"
      ? process.env.EXPO_PUBLIC_SOLANA_RPC_URL_MAINNET_BETA
      : cluster === "devnet"
        ? process.env.EXPO_PUBLIC_SOLANA_RPC_URL_DEVNET
        : process.env.EXPO_PUBLIC_SOLANA_RPC_URL_TESTNET;

  const configuredUrl =
    clusterUrl?.trim() || process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim();

  return configuredUrl || undefined;
}

function getRpcUrl(cluster: SolanaCluster): string {
  return envRpcUrl(cluster) || CLUSTER_RPC_URLS[cluster];
}

interface JsonRpcSuccess {
  result: string;
}

interface JsonRpcFailure {
  error?: {
    code?: number;
    message?: string;
  };
}

function isJsonRpcSuccess(value: JsonRpcSuccess | JsonRpcFailure): value is JsonRpcSuccess {
  return "result" in value && typeof value.result === "string";
}

export async function submitSignedTransaction(
  signedTransactionBase64: string,
  cluster: SolanaCluster,
  opts: { skipPreflight?: boolean } = {},
): Promise<string> {
  const response = await fetch(getRpcUrl(cluster), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        signedTransactionBase64,
        {
          encoding: "base64",
          skipPreflight: opts.skipPreflight ?? false,
          preflightCommitment: "processed",
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JsonRpcSuccess | JsonRpcFailure;
  if (isJsonRpcSuccess(payload)) return payload.result;

  const code = payload.error?.code;
  const message = payload.error?.message || "Unknown Solana RPC error";
  throw new Error(code === undefined ? message : `Solana RPC ${code}: ${message}`);
}

/** Current block height (confirmed), to tell an expired blockhash from a lagging node. */
export async function getBlockHeight(cluster: SolanaCluster): Promise<number> {
  const response = await fetch(getRpcUrl(cluster), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBlockHeight", params: [{ commitment: "confirmed" }] }),
  });
  if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: number; error?: { message?: string } };
  if (typeof payload.result !== "number") throw new Error(payload.error?.message || "Unknown Solana RPC error");
  return payload.result;
}
