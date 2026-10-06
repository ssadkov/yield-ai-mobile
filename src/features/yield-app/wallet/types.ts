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
  /** Runs the step itself (real backend, chain/). Otherwise the driver signs it with signAndSubmit. */
  run?: (onPhase: (p: "signing" | "submitting") => void, setDetail: (detail: string) => void) => Promise<string>;
};

export type TxPhase = "pending" | "signing" | "submitting" | "done" | "failed";

/** PENDING / UNCONFIRMED / FAILED come from the real-backend flow (chain/engine.ts). */
export type WalletErrorCode = "USER_REJECTED" | "NOT_AVAILABLE" | "NOT_SUPPORTED" | "TIMEOUT" | "UNKNOWN" | "PENDING" | "UNCONFIRMED" | "FAILED";

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
  // MWA: the wallet took too long (e.g. sat on its PIN screen) and the local session closed.
  if (/ConnectionFailedException|websocket/i.test(msg)) return new WalletError("TIMEOUT", "Couldn't reach the wallet. Open it, unlock it, then try again.");
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
  /** Reconnects the wallet if needed, so a later signTransaction opens only the signing prompt. */
  prepareSigning(): Promise<void>;
  /** Signs a base64 wire transaction without sending it; resolves with the signed base64 transaction. */
  signTransaction(txBase64: string): Promise<string>;
}
