/** Built-in rows plus every wallet in the discovery registry (wallet-discovery/model/wallet-registry.ts). */
export type WalletId =
  | "seed-vault"
  | "mwa"
  | "privy"
  | "phantom"
  | "solflare"
  | "backpack"
  | "jupiter"
  | "glow"
  | "petra"
  | "metamask"
  | "trust"
  | "okx"
  | "bitget"
  | "coinbase"
  | "rainbow"
  | "uniswap";

export type TxStep = {
  id: string;
  /** "Deposit $1,000" */
  title: string;
  /** "USDC into Flexible" */
  detail: string;
  kind: "setup" | "deposit" | "lock" | "withdraw";
};

export type TxPhase = "pending" | "signing" | "submitting" | "done" | "failed";

export type WalletErrorCode = "USER_REJECTED" | "NOT_AVAILABLE" | "NOT_SUPPORTED" | "TIMEOUT" | "UNKNOWN";

export class WalletError extends Error {
  constructor(
    public code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export function toWalletError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|declin|cancel|denied/i.test(msg)) return new WalletError("USER_REJECTED", "You declined the request in your wallet.");
  if (/timed out|timeout/i.test(msg)) return new WalletError("TIMEOUT", "The wallet didn't respond. Try again.");
  return new WalletError("UNKNOWN", msg || "Something went wrong.");
}

export interface WalletDriver {
  readonly kind: "mock" | "native";
  connect(walletId: WalletId, walletName: string): Promise<{ address: string }>;
  /** Gives up on a connect still waiting for the wallet (the user came back without answering). */
  cancelConnect(walletId: WalletId): void;
  disconnect(): Promise<void>;
  /** Resolves with the transaction signature once it has been submitted. */
  signAndSubmit(step: TxStep, onPhase: (p: "signing" | "submitting") => void, walletName: string): Promise<string>;
}
