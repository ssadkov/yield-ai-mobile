import type { SolanaCluster } from "../../model/types";

// CAIP-2 chain IDs for Solana clusters.
const SOLANA_CHAIN_IDS: Record<SolanaCluster, string> = {
  "mainnet-beta": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

export function getSolanaChainId(cluster: SolanaCluster): string {
  return SOLANA_CHAIN_IDS[cluster];
}

// Methods we request in the session proposal. Matches Solana WalletConnect spec.
// signAllTransactions is optional — not every wallet supports it.
export const SOLANA_WC_METHODS = [
  "solana_signTransaction",
  "solana_signAndSendTransaction",
  "solana_signMessage",
] as const;
