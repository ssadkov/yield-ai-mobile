/**
 * EXPO_PUBLIC_YIELD_NETWORK=devnet runs deposits and withdrawals for real through the
 * Yield AI Safe API on Solana Devnet (idle USDC only: no APR, no Fixed, no agent).
 * Without it the app keeps its mock portfolio. The mock wallet always stays mock.
 */
export const DEVNET = process.env.EXPO_PUBLIC_YIELD_NETWORK === "devnet" && process.env.EXPO_PUBLIC_WALLET_MODE !== "mock";

export const API_BASE = (process.env.EXPO_PUBLIC_YIELD_API_BASE?.trim() || "https://yield-ai-solana-devnet.vercel.app/api/mobile/v1").replace(/\/+$/, "");

export const CLUSTER = "devnet" as const;

/** Pinned in the app: every API response and every transaction is checked against these. */
export const EXPECTED_NETWORK = {
  cluster: "devnet",
  chain: "solana:devnet",
  genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  programId: "8xa1D9Tydju5HqnRPVSJwNbjJGAdY55WKjbf9ijpz3D5",
  usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

export const FAUCET_SOL = "https://faucet.solana.com/";
export const FAUCET_USDC = "https://faucet.circle.com/";

export function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddress(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
