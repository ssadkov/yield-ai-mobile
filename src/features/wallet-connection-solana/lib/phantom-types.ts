// ─── dApp keypair for NaCl encryption with Phantom ───────────────────────────

export interface DAppKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// ─── Active Phantom session ───────────────────────────────────────────────────

export interface PhantomSession {
  walletPublicKey: string;
  session: string;
  sharedSecret: Uint8Array;
  phantomEncryptionPublicKey: Uint8Array;
}

// ─── Deeplink response params ─────────────────────────────────────────────────

export interface ConnectResponseParams {
  phantom_encryption_public_key: string;
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

export interface PhantomErrorResponse {
  errorCode: string;
  errorMessage: string;
}
