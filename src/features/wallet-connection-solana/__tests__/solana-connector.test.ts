import { Platform } from "react-native";
import { MwaAdapter } from "../lib/mwa-adapter";
import { PhantomDeeplinkAdapter } from "../lib/phantom-deeplink";
import { SeedVaultAdapter } from "../lib/seed-vault-adapter";
import {
  MWA_WALLET_ID,
  SEED_VAULT_WALLET_ID,
  SolanaConnector,
} from "../model/solana-connector";
import type { SolanaWalletConfig } from "../model/types";

const mockSubmitSignedTransaction = jest.fn();

const mockAdapter = {
  name: "Mock Adapter",
  connect: jest.fn(),
  disconnect: jest.fn(),
  signAndSendTransaction: jest.fn(),
  signTransaction: jest.fn(),
  signMessage: jest.fn(),
  handleDeeplink: jest.fn(),
  dispose: jest.fn(),
};

jest.mock("../lib/mwa-adapter", () => ({
  MwaAdapter: jest.fn(() => mockAdapter),
}));

jest.mock("../lib/seed-vault-adapter", () => ({
  SeedVaultAdapter: jest.fn(() => mockAdapter),
}));

jest.mock("../lib/phantom-deeplink", () => ({
  PhantomDeeplinkAdapter: jest.fn(() => mockAdapter),
}));

jest.mock("../model/walletconnect-adapter", () => ({
  WalletConnectAdapter: jest.fn(() => mockAdapter),
}));

jest.mock("../lib/solana-rpc", () => ({
  submitSignedTransaction: (...args: unknown[]) => mockSubmitSignedTransaction(...args),
}));

const config: SolanaWalletConfig = {
  walletId: "phantom",
  appScheme: "testapp",
  cluster: "devnet",
  appName: "Test App",
};

function setPlatformOS(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

describe("SolanaConnector", () => {
  beforeEach(() => {
    setPlatformOS("ios");
    jest.clearAllMocks();
  });

  it("has chain = solana", () => {
    const connector = new SolanaConnector(config);
    expect(connector.chain).toBe("solana");
  });

  it("connect delegates to adapter and adds walletId", async () => {
    mockAdapter.connect.mockResolvedValue({ address: "AbC123", chain: "solana" });
    const connector = new SolanaConnector(config);
    const account = await connector.connect();
    expect(mockAdapter.connect).toHaveBeenCalled();
    expect(account).toEqual({ address: "AbC123", chain: "solana", walletId: "phantom" });
  });

  it("disconnect delegates to adapter", async () => {
    mockAdapter.disconnect.mockResolvedValue(undefined);
    const connector = new SolanaConnector(config);
    await connector.disconnect();
    expect(mockAdapter.disconnect).toHaveBeenCalled();
  });

  it("signAndSendTransaction delegates to adapter", async () => {
    mockAdapter.signAndSendTransaction.mockResolvedValue("sig123");
    const connector = new SolanaConnector(config);
    const sig = await connector.signAndSendTransaction(new Uint8Array([1, 2, 3]));
    expect(sig).toBe("sig123");
    expect(mockAdapter.signAndSendTransaction).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it("opens Phantom once on Android by signing first and submitting through RPC", async () => {
    setPlatformOS("android");
    mockAdapter.signTransaction.mockResolvedValue("signed_tx_base64");
    mockSubmitSignedTransaction.mockResolvedValue("rpc_sig123");

    const connector = new SolanaConnector(config);
    const signature = await connector.signAndSendTransaction(
      new Uint8Array([1, 2, 3]),
    );

    expect(signature).toBe("rpc_sig123");
    expect(mockAdapter.signAndSendTransaction).not.toHaveBeenCalled();
    expect(mockAdapter.signTransaction).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
    );
    expect(mockSubmitSignedTransaction).toHaveBeenCalledWith(
      "signed_tx_base64",
      "devnet",
    );
  });

  it("falls back to signTransaction and RPC submit when signAndSendTransaction is unsupported", async () => {
    mockAdapter.signAndSendTransaction.mockRejectedValue(
      new Error("Phantom error -32601: This method is not supported"),
    );
    mockAdapter.signTransaction.mockResolvedValue("signed_tx_base64");
    mockSubmitSignedTransaction.mockResolvedValue("rpc_sig123");

    const connector = new SolanaConnector(config);
    const sig = await connector.signAndSendTransaction(new Uint8Array([1, 2, 3]));

    expect(sig).toBe("rpc_sig123");
    expect(mockAdapter.signAndSendTransaction).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
    );
    expect(mockAdapter.signTransaction).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
    );
    expect(mockSubmitSignedTransaction).toHaveBeenCalledWith(
      "signed_tx_base64",
      "devnet",
    );
  });

  it("does not fallback when signAndSendTransaction fails for another reason", async () => {
    mockAdapter.signAndSendTransaction.mockRejectedValue(new Error("User rejected"));

    const connector = new SolanaConnector(config);
    await expect(
      connector.signAndSendTransaction(new Uint8Array([1, 2, 3])),
    ).rejects.toThrow("User rejected");

    expect(mockAdapter.signTransaction).not.toHaveBeenCalled();
    expect(mockSubmitSignedTransaction).not.toHaveBeenCalled();
  });

  it("signTransaction delegates to adapter", async () => {
    mockAdapter.signTransaction.mockResolvedValue("signedTx");
    const connector = new SolanaConnector(config);
    const result = await connector.signTransaction(new Uint8Array([4, 5]));
    expect(result).toBe("signedTx");
  });

  it("signMessage delegates to adapter", async () => {
    mockAdapter.signMessage.mockResolvedValue("msgSig");
    const connector = new SolanaConnector(config);
    const result = await connector.signMessage(new Uint8Array([6, 7]));
    expect(result).toBe("msgSig");
  });

  it("handleDeeplink delegates to adapter", () => {
    const connector = new SolanaConnector(config);
    connector.handleDeeplink("testapp://onConnect?foo=bar");
    expect(mockAdapter.handleDeeplink).toHaveBeenCalledWith("testapp://onConnect?foo=bar");
  });

  it("dispose delegates to adapter", () => {
    const connector = new SolanaConnector(config);
    connector.dispose();
    expect(mockAdapter.dispose).toHaveBeenCalled();
  });

  describe("adapter selection", () => {
    it("uses PhantomDeeplinkAdapter for phantom on iOS", () => {
      setPlatformOS("ios");
      new SolanaConnector(config);
      expect(PhantomDeeplinkAdapter).toHaveBeenCalledWith(config);
      expect(MwaAdapter).not.toHaveBeenCalled();
    });

    it("uses MwaAdapter for generic MWA on Android", async () => {
      setPlatformOS("android");
      const mwaConfig = { ...config, walletId: MWA_WALLET_ID };
      mockAdapter.connect.mockResolvedValue({ address: "Mwa123", chain: "solana" });

      const connector = new SolanaConnector(mwaConfig);
      await connector.connect();

      expect(MwaAdapter).toHaveBeenCalledWith(mwaConfig);
      expect(PhantomDeeplinkAdapter).not.toHaveBeenCalled();
    });

    it("uses SeedVaultAdapter for Seed Vault on Android", async () => {
      setPlatformOS("android");
      const seedVaultConfig = { ...config, walletId: SEED_VAULT_WALLET_ID };
      mockAdapter.connect.mockResolvedValue({ address: "Seed123", chain: "solana" });

      const connector = new SolanaConnector(seedVaultConfig);
      await connector.connect();

      expect(SeedVaultAdapter).toHaveBeenCalledWith(seedVaultConfig);
      expect(MwaAdapter).not.toHaveBeenCalled();
      expect(PhantomDeeplinkAdapter).not.toHaveBeenCalled();
    });

    it("uses PhantomDeeplinkAdapter for phantom on Android", () => {
      setPlatformOS("android");
      new SolanaConnector(config);

      expect(PhantomDeeplinkAdapter).toHaveBeenCalledWith(config);
      expect(MwaAdapter).not.toHaveBeenCalled();
      expect(SeedVaultAdapter).not.toHaveBeenCalled();
    });

    it("rejects other proprietary Solana wallet ids on Android", () => {
      setPlatformOS("android");
      expect(
        () => new SolanaConnector({ ...config, walletId: "solflare" }),
      ).toThrow(
        /Unsupported Solana wallet on Android: solflare/,
      );
    });

  });
});
