import { renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";
import type { DetectedWallet } from "@/features/wallet-discovery";
import { SolanaConnector } from "@/features/wallet-connection-solana";
import { useWalletRegistry } from "../use-wallet-registry";

jest.mock("@/features/wallet-connection-solana", () => ({
  SolanaConnector: jest.fn((config: { walletId: string }) => ({
    chain: "solana",
    walletId: config.walletId,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSendTransaction: jest.fn(),
    signTransaction: jest.fn(),
    signMessage: jest.fn(),
    handleDeeplink: jest.fn(),
    dispose: jest.fn(),
  })),
  MWA_WALLET_ID: "mwa",
  SEED_VAULT_WALLET_ID: "seed-vault",
  ANDROID_MWA_WALLET_IDS: new Set(["solflare", "backpack", "jupiter"]),
  SUPPORTED_SOLANA_WALLET_IDS: new Set([
    "mwa",
    "seed-vault",
    "phantom",
    "solflare",
    "backpack",
    "jupiter",
  ]),
}));

jest.mock("@/features/wallet-connection-aptos", () => ({
  AptosConnector: jest.fn(() => ({
    chain: "aptos",
    walletId: "petra",
    dispose: jest.fn(),
  })),
}));

jest.mock("../../lib/deeplink-handler", () => ({
  createDeeplinkHandler: jest.fn(() => ({ subscribe: jest.fn(() => jest.fn()) })),
}));

const phantom: DetectedWallet = {
  id: "phantom",
  name: "Phantom",
  scheme: "phantom",
  androidPackage: "app.phantom",
  ecosystem: "solana",
  icon: 0,
  isInstalled: true,
};

const solflare: DetectedWallet = {
  id: "solflare",
  name: "Solflare",
  scheme: "solflare",
  androidPackage: "com.solflare.mobile",
  ecosystem: "solana",
  icon: 0,
  isInstalled: true,
};

const glow: DetectedWallet = {
  id: "glow",
  name: "Glow",
  scheme: "glow",
  androidPackage: "com.luma.wallet.prod",
  ecosystem: "solana",
  icon: 0,
  isInstalled: true,
};

function setPlatformOS(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

/** Config of the latest SolanaConnector built for this wallet. */
function solanaConfigFor(walletId: string) {
  return (SolanaConnector as unknown as jest.Mock).mock.calls
    .map(([config]) => config)
    .reverse()
    .find((config) => config.walletId === walletId);
}

describe("useWalletRegistry", () => {
  beforeEach(() => {
    setPlatformOS("ios");
    jest.clearAllMocks();
  });

  it("always registers Petra for Aptos", () => {
    const { result } = renderHook(() => useWalletRegistry({ wallets: [] }));

    expect(result.current.has("aptos", "petra")).toBe(true);
  });

  describe("iOS", () => {
    it("registers each installed Solana wallet with a supported transport", () => {
      const { result } = renderHook(() =>
        useWalletRegistry({ wallets: [phantom, solflare, glow] }),
      );

      expect(result.current.has("solana", "phantom")).toBe(true);
      expect(result.current.has("solana", "solflare")).toBe(true);
      expect(result.current.has("solana", "glow")).toBe(false);
    });

    it("falls back to Phantom when no Solana wallet is detected", () => {
      const { result } = renderHook(() => useWalletRegistry({ wallets: [] }));

      expect(result.current.has("solana", "phantom")).toBe(true);
    });
  });

  describe("Android", () => {
    beforeEach(() => setPlatformOS("android"));

    it("registers generic MWA plus installed MWA wallets on a regular phone", () => {
      const { result } = renderHook(() =>
        useWalletRegistry({ wallets: [phantom, solflare] }),
      );

      expect(result.current.has("solana", "mwa")).toBe(true);
      expect(result.current.has("solana", "solflare")).toBe(true);
      expect(result.current.has("solana", "phantom")).toBe(false);
      expect(result.current.has("solana", "seed-vault")).toBe(false);
    });

    it("targets MWA wallets at their Android package", () => {
      renderHook(() => useWalletRegistry({ wallets: [solflare] }));

      expect(solanaConfigFor("solflare")).toEqual(
        expect.objectContaining({ walletPackageName: "com.solflare.mobile" }),
      );
    });

    it("registers Seed Vault and installed Phantom on a Solana phone", () => {
      const { result } = renderHook(() =>
        useWalletRegistry({ wallets: [phantom, solflare], isSolanaPhone: true }),
      );

      expect(result.current.has("solana", "seed-vault")).toBe(true);
      expect(result.current.has("solana", "phantom")).toBe(true);
      expect(result.current.has("solana", "solflare")).toBe(true);
      expect(result.current.has("solana", "mwa")).toBe(false);
    });

    it("rebuilds Solana connectors when the cluster changes", () => {
      const { result, rerender } = renderHook(
        (props: { cluster: "mainnet-beta" | "devnet" }) =>
          useWalletRegistry({ wallets: [], solanaCluster: props.cluster }),
        { initialProps: { cluster: "mainnet-beta" } },
      );
      const before = result.current.get("solana", "mwa");

      rerender({ cluster: "devnet" });

      expect(before?.dispose).toHaveBeenCalled();
      expect(solanaConfigFor("mwa")).toEqual(
        expect.objectContaining({ cluster: "devnet" }),
      );
    });
  });
});
