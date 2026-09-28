import type { ChainConnector } from "./types";
import { WalletConnectionError } from "./types";

export class ConnectorRegistry {
  // key: "solana:phantom" → value: SolanaConnector
  private connectors = new Map<string, ChainConnector>();
  private activeConnectorByChain = new Map<string, ChainConnector>();

  private makeKey(chain: string, walletId: string): string {
    return `${chain}:${walletId}`;
  }

  private getRegisteredByChain(chain: string): ChainConnector[] {
    const matches: ChainConnector[] = [];
    for (const connector of this.connectors.values()) {
      if (connector.chain === chain) {
        matches.push(connector);
      }
    }
    return matches;
  }

  private getSingleRegisteredByChain(chain: string): ChainConnector | undefined {
    const connectors = this.getRegisteredByChain(chain);
    return connectors.length === 1 ? connectors[0] : undefined;
  }

  register(connector: ChainConnector): void {
    this.connectors.set(this.makeKey(connector.chain, connector.walletId), connector);
  }

  unregister(chain: string, walletId: string): void {
    const connector = this.connectors.get(this.makeKey(chain, walletId));
    this.connectors.delete(this.makeKey(chain, walletId));
    if (connector && this.activeConnectorByChain.get(chain) === connector) {
      this.activeConnectorByChain.delete(chain);
    }
  }

  get(chain: string, walletId?: string): ChainConnector | undefined {
    if (walletId) {
      return this.connectors.get(this.makeKey(chain, walletId));
    }

    return this.activeConnectorByChain.get(chain) ?? this.getSingleRegisteredByChain(chain);
  }

  getOrThrow(chain: string, walletId?: string): ChainConnector {
    if (walletId) {
      const connector = this.connectors.get(this.makeKey(chain, walletId));
      if (!connector) {
        if (this.getRegisteredByChain(chain).length === 0) {
          throw new WalletConnectionError(
            "CHAIN_NOT_SUPPORTED",
            `Chain "${chain}" is not supported. Register a connector first.`,
          );
        }

        throw new WalletConnectionError(
          "WALLET_NOT_SUPPORTED",
          `Wallet "${walletId}" is not supported for chain "${chain}".`,
        );
      }
      return connector;
    }

    const connector = this.get(chain);
    if (!connector) {
      if (this.getRegisteredByChain(chain).length === 0) {
        throw new WalletConnectionError(
          "CHAIN_NOT_SUPPORTED",
          `Chain "${chain}" is not supported. Register a connector first.`,
        );
      }

      throw new WalletConnectionError(
        "WALLET_NOT_CONNECTED",
        `No active wallet selected for chain "${chain}". Connect first.`,
      );
    }
    return connector;
  }

  setActive(chain: string, walletId: string): ChainConnector {
    const connector = this.getOrThrow(chain, walletId);
    this.activeConnectorByChain.set(chain, connector);
    return connector;
  }

  getActive(chain: string): ChainConnector | undefined {
    return this.activeConnectorByChain.get(chain) ?? this.getSingleRegisteredByChain(chain);
  }

  clearActive(chain: string): void {
    this.activeConnectorByChain.delete(chain);
  }

  has(chain: string, walletId?: string): boolean {
    if (walletId) {
      return this.connectors.has(this.makeKey(chain, walletId));
    }
    return this.get(chain) !== undefined;
  }

  dispose(): void {
    for (const connector of new Set(this.connectors.values())) {
      connector.dispose();
    }
    this.connectors.clear();
    this.activeConnectorByChain.clear();
  }
}
