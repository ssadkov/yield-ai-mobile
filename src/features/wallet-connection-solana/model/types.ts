// ─── Solana Cluster ───────────────────────────────────────────────────────────

export type SolanaCluster = "mainnet-beta" | "testnet" | "devnet";

// ─── Solana wallet config ────────────────────────────────────────────────────

export interface SolanaWalletConfig {
  walletId: string;
  appScheme: string;
  cluster: SolanaCluster;
  appName: string;
}

// ─── Internal adapter interface ───────────────────────────────────────────────

export interface SolanaWalletAdapter {
  readonly name: string;
  connect(): Promise<{ address: string; chain: string }>;
  cancelConnect?(): void;
  disconnect(): Promise<void>;
  signAndSendTransaction(transaction: Uint8Array): Promise<string>;
  signTransaction(transaction: Uint8Array): Promise<string>;
  signMessage(message: Uint8Array): Promise<string>;
  handleDeeplink?(url: string): void;
  dispose(): void;
}
