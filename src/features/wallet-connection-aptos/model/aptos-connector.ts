import type { ChainConnector, WalletAccount } from "@/core/wallet";
import { PetraDeeplinkAdapter } from "./petra-deeplink-adapter";
import type { AptosWalletAdapter, AptosWalletConfig } from "./types";

function createAptosAdapter(config: AptosWalletConfig): AptosWalletAdapter {
  switch (config.walletId) {
    case "petra":
    default:
      return new PetraDeeplinkAdapter(config);
  }
}

export class AptosConnector implements ChainConnector {
  readonly chain = "aptos";
  readonly walletId: string;
  private adapter: AptosWalletAdapter;

  constructor(config: AptosWalletConfig) {
    this.walletId = config.walletId;
    this.adapter = createAptosAdapter(config);
  }

  async connect(): Promise<WalletAccount> {
    const result = await this.adapter.connect();
    return { ...result, walletId: this.walletId };
  }

  async disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  hasPendingSign(): boolean {
    return (
      this.adapter instanceof PetraDeeplinkAdapter && this.adapter.hasPendingSign()
    );
  }

  async signAndSendTransaction(tx: Uint8Array): Promise<string> {
    return this.adapter.signAndSendTransaction(tx);
  }

  async signTransaction(tx: Uint8Array): Promise<string> {
    return this.adapter.signTransaction(tx);
  }

  async signMessage(message: Uint8Array): Promise<string> {
    return this.adapter.signMessage(message);
  }

  handleDeeplink(url: string): void {
    this.adapter.handleDeeplink?.(url);
  }

  dispose(): void {
    this.adapter.dispose();
  }
}
