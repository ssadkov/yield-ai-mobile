import { ConnectorRegistry } from "../connector-registry";
import { WalletConnectionError } from "../types";
import type { ChainConnector, WalletAccount } from "../types";

function makeConnector(
  chain: string,
  walletId: string,
): jest.Mocked<ChainConnector> {
  return {
    chain,
    walletId,
    connect: jest.fn<Promise<WalletAccount>, []>(),
    disconnect: jest.fn<Promise<void>, []>(),
    signAndSendTransaction: jest.fn<Promise<string>, [Uint8Array]>(),
    signTransaction: jest.fn<Promise<string>, [Uint8Array]>(),
    signMessage: jest.fn<Promise<string>, [Uint8Array]>(),
    handleDeeplink: jest.fn<void, [string]>(),
    dispose: jest.fn<void, []>(),
  };
}

describe("ConnectorRegistry", () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it("registers and retrieves connector by chain + walletId", () => {
    const connector = makeConnector("solana", "phantom");
    registry.register(connector);

    expect(registry.get("solana", "phantom")).toBe(connector);
  });

  it("returns undefined for unknown chain", () => {
    expect(registry.get("evm")).toBeUndefined();
  });

  it("has() returns true for registered chain", () => {
    registry.register(makeConnector("solana", "phantom"));

    expect(registry.has("solana")).toBe(true);
  });

  it("has() returns true for registered chain + walletId", () => {
    registry.register(makeConnector("solana", "phantom"));

    expect(registry.has("solana", "phantom")).toBe(true);
  });

  it("has() returns false for unknown chain", () => {
    expect(registry.has("evm")).toBe(false);
  });

  it("getOrThrow returns connector when chain + walletId is registered", () => {
    const connector = makeConnector("solana", "phantom");
    registry.register(connector);

    expect(registry.getOrThrow("solana", "phantom")).toBe(connector);
  });

  it("getOrThrow throws CHAIN_NOT_SUPPORTED for unknown chain", () => {
    expect(() => registry.getOrThrow("evm", "metamask")).toThrow(
      WalletConnectionError,
    );
    expect(() => registry.getOrThrow("evm", "metamask")).toThrow(
      "not supported",
    );
  });

  it("getOrThrow throws WALLET_NOT_SUPPORTED for unknown wallet in known chain", () => {
    registry.register(makeConnector("solana", "phantom"));

    try {
      registry.getOrThrow("solana", "solflare");
    } catch (error) {
      expect(error).toBeInstanceOf(WalletConnectionError);
      expect((error as WalletConnectionError).code).toBe("WALLET_NOT_SUPPORTED");
    }
  });

  it("setActive and getActive manage active connector per chain", () => {
    const phantom = makeConnector("solana", "phantom");
    const solflare = makeConnector("solana", "solflare");
    registry.register(phantom);
    registry.register(solflare);

    registry.setActive("solana", "solflare");

    expect(registry.getActive("solana")).toBe(solflare);
    expect(registry.get("solana")).toBe(solflare);
  });

  it("get(chain) falls back to the only connector when exactly one is registered", () => {
    const phantom = makeConnector("solana", "phantom");
    registry.register(phantom);

    expect(registry.get("solana")).toBe(phantom);
  });

  it("clearActive removes active connector for chain", () => {
    const phantom = makeConnector("solana", "phantom");
    const solflare = makeConnector("solana", "solflare");
    registry.register(phantom);
    registry.register(solflare);
    registry.setActive("solana", "phantom");

    registry.clearActive("solana");

    expect(registry.getActive("solana")).toBeUndefined();
  });

  it("dispose calls dispose on all connectors and clears registry", () => {
    const solana = makeConnector("solana", "phantom");
    const aptos = makeConnector("aptos", "petra");
    registry.register(solana);
    registry.register(aptos);

    registry.dispose();

    expect(solana.dispose).toHaveBeenCalledTimes(1);
    expect(aptos.dispose).toHaveBeenCalledTimes(1);
    expect(registry.has("solana")).toBe(false);
    expect(registry.has("aptos")).toBe(false);
  });

  it("registering the same chain + walletId overwrites previous connector", () => {
    const first = makeConnector("solana", "phantom");
    const second = makeConnector("solana", "phantom");
    registry.register(first);
    registry.register(second);

    expect(registry.get("solana", "phantom")).toBe(second);
  });

  it("unregister removes connector and clears it as active", () => {
    const phantom = makeConnector("solana", "phantom");
    registry.register(phantom);
    registry.setActive("solana", "phantom");

    registry.unregister("solana", "phantom");

    expect(registry.get("solana", "phantom")).toBeUndefined();
    expect(registry.getActive("solana")).toBeUndefined();
  });
});
