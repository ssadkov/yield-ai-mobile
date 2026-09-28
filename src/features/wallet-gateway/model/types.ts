export { WalletConnectionError } from "@/core/wallet";
export type { ChainConnector, WalletAccount } from "@/core/wallet";

// Bridge command types (Web → Native)
export type BridgeCommandType =
  | "connect_wallet"
  | "disconnect_wallet"
  | "sign_transaction"
  | "sign_and_submit_transaction"
  | "sign_message"
  | "get_installed_wallets";

// Native response types (Native → Web)
export type NativeResponseType =
  | "wallet_connected"
  | "wallet_disconnected"
  | "transaction_signed"
  | "transaction_submitted"
  | "message_signed"
  | "wallet_error"
  | "installed_wallets";

// Bridge command payloads
export interface ConnectWalletPayload {
  chain: string;
  walletId: string;
}

export interface DisconnectWalletPayload {
  chain: string;
}

export interface SignTransactionPayload {
  chain: string;
  transaction: string;
  requestId: string;
  send?: boolean;
}

export interface SignMessagePayload {
  chain: string;
  message: string;
  requestId: string;
  encoding?: "base64" | "utf8";
}
