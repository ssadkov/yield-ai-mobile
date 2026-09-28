// ─── dApp keypair for NaCl encryption with Backpack ──────────────────────────

export interface DAppKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// ─── Active Backpack session ──────────────────────────────────────────────────

export interface BackpackSession {
  walletPublicKey: string;
  session: string;
  sharedSecret: Uint8Array;
  walletEncryptionPublicKey: Uint8Array;
}

// ─── Deeplink response params ─────────────────────────────────────────────────
// Note: Backpack uses `wallet_encryption_public_key` (not wallet-specific prefix)

export interface ConnectResponseParams {
  wallet_encryption_public_key: string;
  nonce: string;
  data: string;
}

export interface ConnectPayload {
  public_key: string;
  session: string;
}

export interface SignAndSendTransactionResponseParams {
  nonce: string;
  data: string;
}

export interface SignAndSendTransactionPayload {
  signature: string;
}

export interface SignTransactionResponseParams {
  nonce: string;
  data: string;
}

export interface SignTransactionPayload {
  transaction: string;
}

export interface SignMessageResponseParams {
  nonce: string;
  data: string;
}

export interface SignMessagePayload {
  signature: string;
}

export interface BackpackErrorResponse {
  errorCode: string;
  errorMessage: string;
}
