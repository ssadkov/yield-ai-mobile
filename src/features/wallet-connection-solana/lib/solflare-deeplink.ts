import { Linking } from "react-native";

import {
  generateDAppKeyPair,
  buildConnectURL,
  buildDisconnectURL,
  buildSignAndSendTransactionURL,
  buildSignTransactionURL,
  buildSignMessageURL,
  parseConnectResponse,
  parseSignAndSendTransactionResponse,
  parseSignTransactionResponse,
  parseSignMessageResponse,
  isSolflareErrorResponse,
  extractQueryParams,
} from "./solflare-service";
import { signedTransactionBase58ToBase64 } from "./signed-transaction-encoding";

import type { DAppKeyPair, SolflareSession } from "./solflare-types";
import type { SolanaWalletAdapter, SolanaWalletConfig } from "../model/types";
import { WALLET_CALLBACK_QUERY_PARAM } from "@/core/wallet";

interface PendingOperation<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function getDeeplinkPath(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const callback = parsedUrl.searchParams.get(WALLET_CALLBACK_QUERY_PARAM);
    if (callback) return callback;
  } catch {
    // Ignore URL parser errors and fallback to legacy path parsing.
  }

  try {
    const withoutScheme = url.replace(/^[^:]+:\/\/\/?/, "");
    const path = withoutScheme.split("?")[0];
    return path || null;
  } catch {
    return null;
  }
}

export class SolflareDeeplinkAdapter implements SolanaWalletAdapter {
  readonly name = "Solflare (Deeplink)";

  private dAppKeyPair: DAppKeyPair;
  private session: SolflareSession | null = null;

  private pendingConnect: PendingOperation<{ address: string; chain: string }> | null = null;
  private pendingDisconnect: PendingOperation<void> | null = null;
  private pendingSignAndSend: PendingOperation<string> | null = null;
  private pendingSignTransaction: PendingOperation<string> | null = null;
  private pendingSignMessage: PendingOperation<string> | null = null;

  constructor(private config: SolanaWalletConfig) {
    this.dAppKeyPair = generateDAppKeyPair();
  }

  async connect(): Promise<{ address: string; chain: string }> {
    this.dAppKeyPair = generateDAppKeyPair();
    const url = buildConnectURL(this.config, this.dAppKeyPair.publicKey);

    return new Promise((resolve, reject) => {
      this.pendingConnect = { resolve, reject };
      Linking.openURL(url).catch((error) => {
        this.pendingConnect = null;
        reject(new Error(`Failed to open Solflare: ${error}`));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.session) return;

    const url = buildDisconnectURL(
      this.config,
      this.dAppKeyPair.publicKey,
      this.session.session,
      this.session.sharedSecret,
    );

    return new Promise((resolve, reject) => {
      this.pendingDisconnect = { resolve, reject };
      Linking.openURL(url).catch((error) => {
        this.pendingDisconnect = null;
        this.session = null;
        reject(new Error(`Failed to open disconnect URL: ${error}`));
      });
    });
  }

  async signAndSendTransaction(transaction: Uint8Array): Promise<string> {
    if (!this.session) throw new Error("Wallet not connected");

    const url = buildSignAndSendTransactionURL(
      this.config,
      this.dAppKeyPair.publicKey,
      this.session.session,
      this.session.sharedSecret,
      transaction,
    );

    return new Promise((resolve, reject) => {
      this.pendingSignAndSend = { resolve, reject };
      Linking.openURL(url).catch((error) => {
        this.pendingSignAndSend = null;
        reject(new Error(`Failed to open signAndSendTransaction URL: ${error}`));
      });
    });
  }

  async signTransaction(transaction: Uint8Array): Promise<string> {
    if (!this.session) throw new Error("Wallet not connected");

    const url = buildSignTransactionURL(
      this.config,
      this.dAppKeyPair.publicKey,
      this.session.session,
      this.session.sharedSecret,
      transaction,
    );

    return new Promise((resolve, reject) => {
      this.pendingSignTransaction = { resolve, reject };
      Linking.openURL(url).catch((error) => {
        this.pendingSignTransaction = null;
        reject(new Error(`Failed to open signTransaction URL: ${error}`));
      });
    });
  }

  async signMessage(message: Uint8Array): Promise<string> {
    if (!this.session) throw new Error("Wallet not connected");

    const url = buildSignMessageURL(
      this.config,
      this.dAppKeyPair.publicKey,
      this.session.session,
      this.session.sharedSecret,
      message,
    );

    return new Promise((resolve, reject) => {
      this.pendingSignMessage = { resolve, reject };
      Linking.openURL(url).catch((error) => {
        this.pendingSignMessage = null;
        reject(new Error(`Failed to open signMessage URL: ${error}`));
      });
    });
  }

  handleDeeplink(url: string): void {
    if (!url) return;

    const path = getDeeplinkPath(url);
    const params = extractQueryParams(url);

    if (isSolflareErrorResponse(params)) {
      const error = new Error(
        `Solflare error ${params.errorCode}: ${params.errorMessage}`,
      );

      if (path === "onDisconnect") {
        this.session = null;
        this.pendingDisconnect?.resolve();
        this.pendingDisconnect = null;
        return;
      }

      if (path === "onConnect") { this.pendingConnect?.reject(error); this.pendingConnect = null; }
      else if (path === "onSignAndSendTransaction") { this.pendingSignAndSend?.reject(error); this.pendingSignAndSend = null; }
      else if (path === "onSignTransaction") { this.pendingSignTransaction?.reject(error); this.pendingSignTransaction = null; }
      else if (path === "onSignMessage") { this.pendingSignMessage?.reject(error); this.pendingSignMessage = null; }
      return;
    }

    switch (path) {
      case "onConnect": {
        try {
          const { payload, solflareEncryptionPublicKey, sharedSecret } =
            parseConnectResponse(params as any, this.dAppKeyPair.secretKey);

          const address = payload.public_key;
          this.session = { walletPublicKey: address, session: payload.session, sharedSecret, solflareEncryptionPublicKey };
          this.pendingConnect?.resolve({ address, chain: "solana" });
        } catch (error) {
          this.pendingConnect?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.pendingConnect = null;
        break;
      }

      case "onDisconnect": {
        this.session = null;
        this.pendingDisconnect?.resolve();
        this.pendingDisconnect = null;
        break;
      }

      case "onSignAndSendTransaction": {
        try {
          if (!this.session) throw new Error("No active session");
          const result = parseSignAndSendTransactionResponse(params as any, this.session.sharedSecret);
          this.pendingSignAndSend?.resolve(result.signature);
        } catch (error) {
          this.pendingSignAndSend?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.pendingSignAndSend = null;
        break;
      }

      case "onSignTransaction": {
        try {
          if (!this.session) throw new Error("No active session");
          const result = parseSignTransactionResponse(params as any, this.session.sharedSecret);
          this.pendingSignTransaction?.resolve(
            signedTransactionBase58ToBase64(result.transaction),
          );
        } catch (error) {
          this.pendingSignTransaction?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.pendingSignTransaction = null;
        break;
      }

      case "onSignMessage": {
        try {
          if (!this.session) throw new Error("No active session");
          const result = parseSignMessageResponse(params as any, this.session.sharedSecret);
          this.pendingSignMessage?.resolve(result.signature);
        } catch (error) {
          this.pendingSignMessage?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.pendingSignMessage = null;
        break;
      }
    }
  }

  dispose(): void {
    const abortError = new Error("Adapter disposed");
    this.pendingConnect?.reject(abortError);
    this.pendingDisconnect?.reject(abortError);
    this.pendingSignAndSend?.reject(abortError);
    this.pendingSignTransaction?.reject(abortError);
    this.pendingSignMessage?.reject(abortError);
    this.pendingConnect = null;
    this.pendingDisconnect = null;
    this.pendingSignAndSend = null;
    this.pendingSignTransaction = null;
    this.pendingSignMessage = null;
    this.session = null;
  }
}
