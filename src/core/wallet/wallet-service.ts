import { Buffer } from "buffer";
import type { ConnectorRegistry } from "./connector-registry";
import { WalletConnectionError } from "./types";
import type { WalletAccount } from "./types";

type ConnectorWithPendingSign = {
  hasPendingSign?: () => boolean;
};

function connectorHasPendingSign(connector: object): boolean {
  return (connector as ConnectorWithPendingSign).hasPendingSign?.() === true;
}

type MessageEncoding = "base64" | "utf8";

function isStrictBase64(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized.length % 4 === 1) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false;

  const decoded = Buffer.from(normalized, "base64");
  return (
    decoded.length > 0 &&
    decoded.toString("base64").replace(/=+$/, "") ===
      normalized.replace(/=+$/, "")
  );
}

function decodeMessage(message: string, encoding?: MessageEncoding): Buffer {
  if (encoding === "base64") return Buffer.from(message, "base64");
  if (encoding === "utf8") return Buffer.from(message, "utf8");
  return isStrictBase64(message)
    ? Buffer.from(message, "base64")
    : Buffer.from(message, "utf8");
}

function decodeTransaction(transaction: string): Buffer {
  const trimmed = transaction.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return Buffer.from(trimmed, "utf8");
  }
  return Buffer.from(trimmed, "base64");
}

export class WalletService {
  constructor(private registry: ConnectorRegistry) {}

  async connect(chain: string, walletId: string): Promise<WalletAccount> {
    const connector = this.registry.getOrThrow(chain, walletId);
    if (connectorHasPendingSign(connector)) {
      throw new WalletConnectionError(
        "SIGN_IN_PROGRESS",
        "Cannot connect while a wallet sign request is in progress",
      );
    }
    this.registry.setActive(chain, walletId);
    try {
      return await connector.connect();
    } catch (error) {
      if (this.registry.getActive(chain) === connector) {
        this.registry.clearActive(chain);
      }
      throw error;
    }
  }

  /** Drops a connect the user gave up on (e.g. came back from the wallet without answering). */
  cancelConnect(chain: string, walletId: string): void {
    this.registry.get(chain, walletId)?.cancelConnect?.();
  }

  async disconnect(chain: string): Promise<void> {
    const connector = this.registry.getOrThrow(chain);
    if (connectorHasPendingSign(connector)) {
      throw new WalletConnectionError(
        "SIGN_IN_PROGRESS",
        "Cannot disconnect while a wallet sign request is in progress",
      );
    }
    try {
      await connector.disconnect();
    } finally {
      this.registry.clearActive(chain);
    }
  }

  async signTransaction(
    chain: string,
    transactionBase64: string,
    send: boolean,
  ): Promise<string> {
    const txBytes = decodeTransaction(transactionBase64);
    const connector = this.registry.getOrThrow(chain);
    return send
      ? connector.signAndSendTransaction(txBytes)
      : connector.signTransaction(txBytes);
  }

  async signMessage(
    chain: string,
    message: string,
    encoding?: MessageEncoding,
  ): Promise<string> {
    const msgBytes = decodeMessage(message, encoding);
    return this.registry.getOrThrow(chain).signMessage(msgBytes);
  }
}
