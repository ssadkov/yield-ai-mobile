import { Buffer } from "buffer";
import { Linking } from "react-native";

import {
  buildConnectURL,
  buildDisconnectURL,
  buildSignAndSubmitURL,
  buildSignMessageURL,
  deriveSharedSecret,
  generateDAppKeyPair,
  getPetraResponsePath,
  parseAptosTransactionPayload,
  parseConnectApproved,
  parsePetraResponse,
  parsePetraSignResponseBody,
} from "../lib/petra-service";
import {
  clearPetraSession,
  loadPetraSession,
  savePetraSession,
} from "../lib/petra-session-store";
import type {
  DAppKeyPair,
  PetraSession,
} from "../lib/petra-types";
import type { AptosWalletAdapter, AptosWalletConfig } from "./types";

interface PendingOperation<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface PendingSignOperation<T> extends PendingOperation<T> {
  session: PetraSession;
  timeoutId: ReturnType<typeof setTimeout>;
}

const PETRA_SIGN_TIMEOUT_MS = 115_000;

export class PetraDeeplinkAdapter implements AptosWalletAdapter {
  readonly name = "Petra (Deeplink)";

  private dAppKeyPair: DAppKeyPair;
  private session: PetraSession | null = null;

  private inFlightConnect: Promise<{ address: string; chain: string }> | null = null;
  private pendingConnect: PendingOperation<{ address: string; chain: string }> | null = null;
  private pendingDisconnect: PendingOperation<void> | null = null;
  private pendingSignAndSend: PendingSignOperation<string> | null = null;
  private pendingSignMessage: PendingSignOperation<string> | null = null;

  hasPendingSign(): boolean {
    return !!(this.pendingSignAndSend || this.pendingSignMessage);
  }

  constructor(private config: AptosWalletConfig) {
    this.dAppKeyPair = generateDAppKeyPair();
    void this.restorePersistedSession();
  }

  private async restorePersistedSession(): Promise<void> {
    const restored = await loadPetraSession();
    if (!restored || this.session) return;
    this.session = restored;
    this.dAppKeyPair = restored.dAppKeyPair;
    if (__DEV__) {
      console.log("[Petra] restored persisted session for", restored.walletAddress);
    }
  }

  async connect(): Promise<{ address: string; chain: string }> {
    if (!this.session) {
      await this.restorePersistedSession();
    }
    if (this.session) {
      return { address: this.session.walletAddress, chain: "aptos" };
    }
    if (this.pendingSignAndSend || this.pendingSignMessage) {
      throw new Error("Cannot connect Petra while a sign request is in progress");
    }
    if (this.inFlightConnect) {
      return this.inFlightConnect;
    }

    const inFlightConnect = new Promise<{ address: string; chain: string }>((resolve, reject) => {
      // Fresh keypair per connect — Petra binds encryption to this public key.
      const connectKeyPair = generateDAppKeyPair();
      this.dAppKeyPair = connectKeyPair;
      const url = buildConnectURL(this.config, connectKeyPair.publicKey);

      if (__DEV__) console.log("[Petra] connect URL:", url);

      this.pendingConnect = { resolve, reject };
      Linking.openURL(url).catch((error) => {
        this.pendingConnect = null;
        reject(new Error(`Failed to open Petra: ${error}`));
      });
    }).finally(() => {
      this.inFlightConnect = null;
    });
    this.inFlightConnect = inFlightConnect;

    return inFlightConnect;
  }

  async disconnect(): Promise<void> {
    if (this.pendingSignAndSend || this.pendingSignMessage) {
      throw new Error("Cannot disconnect Petra while a sign request is in progress");
    }

    // Petra's reference dApp clears local session immediately and does not wait
    // for the wallet redirect — otherwise web disconnect hangs if the user stays
    // in Petra or the redirect is dropped while the app is backgrounded.
    this.pendingConnect?.reject(new Error("Disconnect requested"));
    this.pendingConnect = null;
    this.inFlightConnect = null;

    const disconnectKeyPair = this.session?.dAppKeyPair ?? this.dAppKeyPair;
    this.session = null;
    void clearPetraSession();

    const url = buildDisconnectURL(this.config, disconnectKeyPair.publicKey);
    try {
      await Linking.openURL(url);
    } catch (error) {
      throw new Error(`Failed to open Petra disconnect URL: ${error}`);
    }
  }

  // Petra's signAndSubmit expects an Aptos entry-function payload as a JS
  // object. The caller passes a serialized JSON; we parse it here so we can
  // re-serialize and encrypt it inside the envelope.
  async signAndSendTransaction(transaction: Uint8Array): Promise<string> {
    const session = this.session;
    if (!session) throw new Error("Wallet not connected");
    const txPayload = parseAptosTransactionPayload(transaction);

    const url = buildSignAndSubmitURL(
      this.config,
      session.dAppKeyPair.publicKey,
      session.sharedSecret,
      txPayload,
    );

    if (__DEV__) {
      const pubHex = Buffer.from(session.dAppKeyPair.publicKey).toString("hex");
      console.log("[Petra] signAndSubmit URL (pubkey prefix):", pubHex.slice(0, 16));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = this.startSignTimeout("signAndSubmit");
      this.pendingSignAndSend = { resolve, reject, session, timeoutId };
      Linking.openURL(url).catch((error) => {
        this.clearPendingSign(this.pendingSignAndSend);
        reject(new Error(`Failed to open Petra signAndSubmit URL: ${error}`));
      });
    });
  }

  async signTransaction(_transaction: Uint8Array): Promise<string> {
    // Petra's mobile2mobile protocol only documents signAndSubmit (not
    // sign-only). If we ever need pure signing, route it via Aptos SDK
    // simulation or expose a separate flow.
    throw new Error("Petra deeplink protocol only supports signAndSubmit");
  }

  async signMessage(message: Uint8Array): Promise<string> {
    const session = this.session;
    if (!session) throw new Error("Wallet not connected");
    const text = Buffer.from(message).toString("utf8");
    const url = buildSignMessageURL(
      this.config,
      session.dAppKeyPair.publicKey,
      session.sharedSecret,
      text,
    );

    return new Promise((resolve, reject) => {
      const timeoutId = this.startSignTimeout("signMessage");
      this.pendingSignMessage = { resolve, reject, session, timeoutId };
      Linking.openURL(url).catch((error) => {
        this.clearPendingSign(this.pendingSignMessage);
        reject(new Error(`Failed to open Petra signMessage URL: ${error}`));
      });
    });
  }

  handleDeeplink(url: string): void {
    if (!url) return;
    if (__DEV__) console.log("[Petra] handleDeeplink:", url);

    const path = getPetraResponsePath(url);
    const { approved, data } = parsePetraResponse(url);

    if (path === "/api/v1/connect") {
      if (!this.pendingConnect && !this.inFlightConnect) {
        if (__DEV__) {
          console.log("[Petra] Ignoring stale connect deeplink (no pending connect)");
        }
        return;
      }
      if (!approved || !data) {
        this.pendingConnect?.reject(new Error("Petra rejected connect"));
        this.pendingConnect = null;
        return;
      }
      try {
        const decoded = parseConnectApproved(data);
        const sharedSecret = deriveSharedSecret(
          this.dAppKeyPair.secretKey,
          decoded.petraPublicEncryptedKey,
        );
        this.session = {
          walletAddress: decoded.address,
          walletPublicKey: decoded.publicKey,
          dAppKeyPair: this.dAppKeyPair,
          sharedSecret,
        };
        void savePetraSession(this.session);
        this.pendingConnect?.resolve({ address: decoded.address, chain: "aptos" });
      } catch (error) {
        this.pendingConnect?.reject(toError(error));
      }
      this.pendingConnect = null;
      return;
    }

    if (path === "/api/v1/disconnect") {
      if (approved) {
        this.session = null;
        void clearPetraSession();
      }
      this.pendingDisconnect?.resolve();
      this.pendingDisconnect = null;
      return;
    }

    // Sign responses use /api/v1/response. Disconnect may also land here when
    // redirectLink pointed at /response in older builds.
    if (path === "/api/v1/response") {
      if (!approved) {
        const err = new Error("Petra rejected request");
        const signPending = this.pendingSignAndSend;
        const messagePending = this.pendingSignMessage;
        signPending?.reject(err);
        messagePending?.reject(err);
        this.pendingDisconnect?.resolve();
        if (!signPending && !messagePending) {
          this.session = null;
        }
        this.clearPending();
        return;
      }
      // Disconnect ack is `response=approved` with no `data` — must not reject
      // an in-flight sign request that shares the same redirect path.
      if (!data) {
        if (this.pendingDisconnect) {
          if (!this.pendingSignAndSend && !this.pendingSignMessage) {
            this.session = null;
          }
          this.pendingDisconnect.resolve();
          this.pendingDisconnect = null;
          return;
        }
        const err = new Error("Petra response missing data");
        this.pendingSignAndSend?.reject(err);
        this.pendingSignMessage?.reject(err);
        this.clearPending();
        return;
      }

      try {
        if (this.pendingDisconnect) {
          if (!this.pendingSignAndSend && !this.pendingSignMessage) {
            this.session = null;
          }
          this.pendingDisconnect.resolve();
          this.pendingDisconnect = null;
          return;
        }

        const signSession =
          this.pendingSignAndSend?.session ??
          this.pendingSignMessage?.session ??
          this.session;
        const decrypted = parsePetraSignResponseBody(
          data,
          signSession?.sharedSecret,
        );

        if (this.pendingSignAndSend) {
          const hash = decrypted?.hash ?? decrypted?.transactionHash;
          if (typeof hash !== "string") {
            throw new Error("Petra signAndSubmit response missing hash");
          }
          this.pendingSignAndSend.resolve(hash);
          this.clearPendingSign(this.pendingSignAndSend);
          return;
        }

        if (this.pendingSignMessage) {
          const signature = decrypted?.signature ?? decrypted?.fullMessage;
          if (typeof signature !== "string") {
            throw new Error("Petra signMessage response missing signature");
          }
          this.pendingSignMessage.resolve(signature);
          this.clearPendingSign(this.pendingSignMessage);
        }
      } catch (error) {
        const err = toError(error);
        this.pendingSignAndSend?.reject(err);
        this.pendingSignMessage?.reject(err);
        this.clearPending();
      }
    }
  }

  dispose(): void {
    const abortError = new Error("Adapter disposed");
    this.pendingConnect?.reject(abortError);
    this.pendingDisconnect?.reject(abortError);
    this.pendingSignAndSend?.reject(abortError);
    this.pendingSignMessage?.reject(abortError);
    this.clearPending();
    // Keep persisted Petra session — Metro reload must not drop encryption keys.
  }

  private clearPending(): void {
    this.pendingConnect = null;
    this.pendingDisconnect = null;
    this.clearPendingSign(this.pendingSignAndSend);
    this.clearPendingSign(this.pendingSignMessage);
  }

  private clearPendingSign<T>(pending: PendingSignOperation<T> | null): void {
    if (pending) {
      clearTimeout(pending.timeoutId);
    }
    if (pending === this.pendingSignAndSend) {
      this.pendingSignAndSend = null;
    }
    if (pending === this.pendingSignMessage) {
      this.pendingSignMessage = null;
    }
  }

  private startSignTimeout(kind: "signAndSubmit" | "signMessage") {
    return setTimeout(() => {
      const pending =
        kind === "signAndSubmit" ? this.pendingSignAndSend : this.pendingSignMessage;
      if (!pending) return;

      const err = new Error(
        "Petra request timed out. Reconnect Petra in the app, then retry.",
      );
      pending.reject(err);
      this.clearPendingSign(pending);
      this.session = null;
      void clearPetraSession();
    }, PETRA_SIGN_TIMEOUT_MS);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
