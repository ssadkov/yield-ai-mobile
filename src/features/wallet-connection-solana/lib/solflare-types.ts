// ─── dApp keypair for NaCl encryption with Solflare ──────────────────────────

export interface DAppKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// ─── Active Solflare session ──────────────────────────────────────────────────

export interface SolflareSession {
  walletPublicKey: string;
  session: string;
  sharedSecret: Uint8Array;
  solflareEncryptionPublicKey: Uint8Array;
}

// ─── Deeplink response params ─────────────────────────────────────────────────

export interface ConnectResponseParams {
  solflare_encryption_public_key: string;
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

export interface SolflareErrorResponse {
  errorCode: string;
  errorMessage: string;
}
