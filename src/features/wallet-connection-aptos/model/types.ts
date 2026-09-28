// ─── Aptos wallet config ─────────────────────────────────────────────────────

export interface AptosWalletConfig {
  walletId: string;
  appScheme: string;
  appName: string;
  network: AptosNetwork;
}

export type AptosNetwork = "mainnet" | "testnet" | "devnet";

// ─── Internal adapter interface ──────────────────────────────────────────────

export interface AptosWalletAdapter {
  readonly name: string;
  connect(): Promise<{ address: string; chain: string }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(transaction: Uint8Array): Promise<string>;
  signTransaction(transaction: Uint8Array): Promise<string>;
  signMessage(message: Uint8Array): Promise<string>;
  handleDeeplink?(url: string): void;
  dispose(): void;
}
