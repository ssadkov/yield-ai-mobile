import { Buffer } from "buffer";
import { WalletService } from "../wallet-service";
import { WalletConnectionError } from "../types";
import type { ConnectorRegistry } from "../connector-registry";
import type { ChainConnector } from "../types";

function createMockConnector(chain: string): jest.Mocked<ChainConnector> {
  return {
    chain,
    walletId: "phantom",
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSendTransaction: jest.fn(),
    signTransaction: jest.fn(),
    signMessage: jest.fn(),
    dispose: jest.fn(),
  };
}

function createMockRegistry(
  connectors: Map<string, jest.Mocked<ChainConnector>>,
): ConnectorRegistry {
  const activeByChain = new Map<string, jest.Mocked<ChainConnector>>();

  const getSingleByChain = (chain: string): jest.Mocked<ChainConnector> | undefined => {
    const matches = [...connectors.values()].filter(
      (connector) => connector.chain === chain,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };

  const get = (chain: string, walletId?: string): ChainConnector | undefined => {
    if (walletId) {
      return connectors.get(`${chain}:${walletId}`);
    }
    return activeByChain.get(chain) ?? getSingleByChain(chain);
  };

  const getOrThrow = (chain: string, walletId?: string): ChainConnector => {
    const connector = get(chain, walletId);
    if (connector) return connector;

    const hasAnyConnectorForChain = [...connectors.values()].some(
      (candidate) => candidate.chain === chain,
    );

    if (!hasAnyConnectorForChain) {
      throw new WalletConnectionError(
        "CHAIN_NOT_SUPPORTED",
        `No connector for chain: ${chain}`,
      );
    }

    if (walletId) {
      throw new WalletConnectionError(
        "WALLET_NOT_SUPPORTED",
        `No connector for wallet: ${walletId}`,
      );
    }

    throw new WalletConnectionError(
      "WALLET_NOT_CONNECTED",
      `No active wallet for chain: ${chain}`,
    );
  };

  const setActive = (chain: string, walletId: string): ChainConnector => {
    const connector = getOrThrow(chain, walletId) as jest.Mocked<ChainConnector>;
    activeByChain.set(chain, connector);
    return connector;
  };

  const getActive = (chain: string): ChainConnector | undefined => {
    return activeByChain.get(chain) ?? getSingleByChain(chain);
  };

  const clearActive = (chain: string): void => {
    activeByChain.delete(chain);
  };

  return {
    get,
    getOrThrow,
    setActive,
    getActive,
    clearActive,
    has: (chain: string, walletId?: string) => get(chain, walletId) !== undefined,
    register: jest.fn(),
    dispose: jest.fn(),
  } as unknown as ConnectorRegistry;
}

describe("WalletService", () => {
  let solanaConnector: jest.Mocked<ChainConnector>;
  let service: WalletService;

  beforeEach(() => {
    solanaConnector = createMockConnector("solana");
    const connectors = new Map([["solana:phantom", solanaConnector]]);
    service = new WalletService(createMockRegistry(connectors));
  });

  describe("connect", () => {
    it("delegates to connector and returns account", async () => {
      const account = { address: "ABC", chain: "solana", walletId: "phantom" };
      solanaConnector.connect.mockResolvedValue(account);

      const result = await service.connect("solana", "phantom");

      expect(solanaConnector.connect).toHaveBeenCalled();
      expect(result).toEqual(account);
    });

    it("throws for unsupported chain", async () => {
      await expect(service.connect("evm", "metamask")).rejects.toThrow(
        WalletConnectionError,
      );
    });

    it("throws for unsupported wallet", async () => {
      await expect(service.connect("solana", "solflare")).rejects.toThrow(
        WalletConnectionError,
      );
    });
  });

  describe("disconnect", () => {
    it("delegates to connector", async () => {
      solanaConnector.disconnect.mockResolvedValue(undefined);

      await service.disconnect("solana");

      expect(solanaConnector.disconnect).toHaveBeenCalled();
    });

    it("propagates connector disconnect errors after clearing active wallet", async () => {
      const clearActive = jest.fn();
      const registry = {
        ...createMockRegistry(new Map([["solana:phantom", solanaConnector]])),
        clearActive,
      } as unknown as ConnectorRegistry;
      const disconnectingService = new WalletService(registry);
      solanaConnector.connect.mockResolvedValue({
        address: "ABC",
        chain: "solana",
        walletId: "phantom",
      });
      await disconnectingService.connect("solana", "phantom");
      solanaConnector.disconnect.mockRejectedValue(new Error("Petra unavailable"));

      await expect(disconnectingService.disconnect("solana")).rejects.toThrow(
        "Petra unavailable",
      );
      expect(clearActive).toHaveBeenCalledWith("solana");
    });
  });

  describe("signTransaction", () => {
    it("calls signAndSendTransaction when send=true", async () => {
      solanaConnector.signAndSendTransaction.mockResolvedValue("sig123");
      const txBase64 = Buffer.from([1, 2, 3]).toString("base64");

      const result = await service.signTransaction("solana", txBase64, true);

      expect(solanaConnector.signAndSendTransaction).toHaveBeenCalledWith(
        Buffer.from([1, 2, 3]),
      );
      expect(result).toBe("sig123");
    });

    it("calls signTransaction when send=false", async () => {
      solanaConnector.signTransaction.mockResolvedValue("signed_tx");
      const txBase64 = Buffer.from([4, 5]).toString("base64");

      const result = await service.signTransaction("solana", txBase64, false);

      expect(solanaConnector.signTransaction).toHaveBeenCalledWith(
        Buffer.from([4, 5]),
      );
      expect(result).toBe("signed_tx");
    });

    it("accepts raw JSON transaction payloads from web", async () => {
      solanaConnector.signAndSendTransaction.mockResolvedValue("hash");
      const txJson = JSON.stringify({
        type: "entry_function_payload",
        function: "0x1::coin::transfer",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: ["0x1", 1],
      });

      await service.signTransaction("solana", txJson, true);

      expect(solanaConnector.signAndSendTransaction).toHaveBeenCalledWith(
        Buffer.from(txJson, "utf8"),
      );
    });
  });

  describe("signMessage", () => {
    it("decodes base64 and delegates to connector", async () => {
      solanaConnector.signMessage.mockResolvedValue("msg_sig");
      const msgBase64 = Buffer.from("hello").toString("base64");

      const result = await service.signMessage("solana", msgBase64);

      expect(solanaConnector.signMessage).toHaveBeenCalledWith(
        Buffer.from("hello"),
      );
      expect(result).toBe("msg_sig");
    });

    it("uses utf8 for non-base64 messages", async () => {
      solanaConnector.signMessage.mockResolvedValue("msg_sig");

      const result = await service.signMessage("solana", "Hello from Yield AI");

      expect(solanaConnector.signMessage).toHaveBeenCalledWith(
        Buffer.from("Hello from Yield AI", "utf8"),
      );
      expect(result).toBe("msg_sig");
    });

    it("honors explicit utf8 encoding for base64-looking text", async () => {
      solanaConnector.signMessage.mockResolvedValue("msg_sig");

      const result = await service.signMessage("solana", "SGVsbG8=", "utf8");

      expect(solanaConnector.signMessage).toHaveBeenCalledWith(
        Buffer.from("SGVsbG8=", "utf8"),
      );
      expect(result).toBe("msg_sig");
    });
  });
});
