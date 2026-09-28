// WalletAccount — chain-agnostic wallet account
export interface WalletAccount {
  address: string;
  chain: string;
  walletId: string;
}

// ChainConnector — core abstraction, one per blockchain
export interface ChainConnector {
  readonly chain: string;
  readonly walletId: string;
  connect(): Promise<WalletAccount>;
  /** Abandons a connect still waiting on the wallet app, so the next connect starts fresh. */
  cancelConnect?(): void;
  disconnect(): Promise<void>;
  signAndSendTransaction(tx: Uint8Array): Promise<string>;
  signTransaction(tx: Uint8Array): Promise<string>;
  signMessage(message: Uint8Array): Promise<string>;
  handleDeeplink?(url: string): void;
  dispose(): void;
}

// Error
export class WalletConnectionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "WalletConnectionError";
  }
}
