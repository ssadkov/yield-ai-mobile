// Shape of the JSON envelope inside the `data` query param sent to Petra.
// All cryptographic values are hex-encoded (no 0x prefix).
export interface PetraConnectRequest {
  appInfo: { domain: string; name: string };
  redirectLink: string;
  dappEncryptionPublicKey: string;
}

export interface PetraEncryptedRequest {
  appInfo: { domain: string; name: string };
  payload: string;
  redirectLink: string;
  dappEncryptionPublicKey: string;
  nonce: string;
}

// Decoded body of an approved /connect response.
// `petraPublicEncryptedKey` arrives as `0x<hex>`.
export interface PetraConnectApprovedResponse {
  petraPublicEncryptedKey: string;
  address: string;
  publicKey?: string;
}

// In-memory session state held by the adapter.
export interface PetraSession {
  walletAddress: string;
  walletPublicKey?: string;
  /** Keypair used for the /connect handshake — must match sharedSecret. */
  dAppKeyPair: DAppKeyPair;
  sharedSecret: Uint8Array;
}

export interface DAppKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}
