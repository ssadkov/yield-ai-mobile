/// <reference types="jest" />
import { renderHook, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";
import { canResolveScheme, isWalletInstalled } from "wallet-availability";
import { useWalletDiscovery } from "../use-wallet-discovery";
import { WALLET_REGISTRY } from "../wallet-registry";

jest.mock("wallet-availability", () => ({
  isWalletInstalled: jest.fn(),
  canResolveScheme: jest.fn(),
}));

const mockedIsWalletInstalled = jest.mocked(isWalletInstalled);
const mockedCanResolveScheme = jest.mocked(canResolveScheme);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);
  mockedIsWalletInstalled.mockResolvedValue(false);
  mockedCanResolveScheme.mockResolvedValue(false);
});

describe("useWalletDiscovery", () => {
  it("returns empty array initially, then populates after detection", async () => {
    const { result } = renderHook(() => useWalletDiscovery());
    expect(result.current.wallets).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    // Wait for async detection to complete so the state update
    // happens inside act() and doesn't leak into subsequent tests
    await waitFor(() => {
      expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
    });
    expect(result.current.isLoading).toBe(false);
  });

  describe("on Android", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
    });

    it("uses isWalletInstalled with all configured Android package ids", async () => {
      mockedIsWalletInstalled.mockResolvedValue(false);

      const { result } = renderHook(() => useWalletDiscovery());

      await waitFor(() => {
        expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
      });

      const expectedPackages = Array.from(
        new Set(
          WALLET_REGISTRY.flatMap((wallet) => [
            wallet.androidPackage,
            ...(wallet.androidPackageAliases ?? []),
          ]),
        ),
      );

      expect(mockedIsWalletInstalled).toHaveBeenCalledTimes(expectedPackages.length);
      for (const pkg of expectedPackages) {
        expect(mockedIsWalletInstalled).toHaveBeenCalledWith(pkg);
      }
      expect(Linking.canOpenURL).not.toHaveBeenCalled();
    });

    it("marks wallet as installed when native module returns true", async () => {
      mockedIsWalletInstalled.mockImplementation((pkg: string) =>
        Promise.resolve(pkg === "app.phantom"),
      );

      const { result } = renderHook(() => useWalletDiscovery());

      await waitFor(() => {
        expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
      });

      const phantom = result.current.wallets.find((w) => w.id === "phantom");
      const solflare = result.current.wallets.find((w) => w.id === "solflare");

      expect(phantom?.isInstalled).toBe(true);
      expect(solflare?.isInstalled).toBe(false);
    });

    it("falls back to scheme resolution when package lookup fails", async () => {
      mockedIsWalletInstalled.mockResolvedValue(false);
      mockedCanResolveScheme.mockImplementation((scheme: string) =>
        Promise.resolve(scheme === "petra"),
      );

      const { result } = renderHook(() => useWalletDiscovery());

      await waitFor(() => {
        expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
      });

      const petra = result.current.wallets.find((w) => w.id === "petra");

      expect(petra?.isInstalled).toBe(true);
    });

    it("marks Glow as installed when legacy package id is found", async () => {
      mockedIsWalletInstalled.mockImplementation((pkg: string) =>
        Promise.resolve(pkg === "io.glow.app"),
      );

      const { result } = renderHook(() => useWalletDiscovery());

      await waitFor(() => {
        expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
      });

      const glow = result.current.wallets.find((w) => w.id === "glow");
      expect(glow?.isInstalled).toBe(true);
    });
  });

  describe("on iOS", () => {
    beforeEach(() => {
      (Platform as any).OS = "ios";
    });

    it("uses Linking.canOpenURL with scheme", async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useWalletDiscovery());

      await waitFor(() => {
        expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
      });

      expect(Linking.canOpenURL).toHaveBeenCalledTimes(WALLET_REGISTRY.length);
      for (const wallet of WALLET_REGISTRY) {
        expect(Linking.canOpenURL).toHaveBeenCalledWith(`${wallet.scheme}://`);
      }
      expect(mockedIsWalletInstalled).not.toHaveBeenCalled();
    });

    it("marks wallet as installed when canOpenURL returns true", async () => {
      (Linking.canOpenURL as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url === "phantom://"),
      );

      const { result } = renderHook(() => useWalletDiscovery());

      await waitFor(() => {
        expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
      });

      const phantom = result.current.wallets.find((w) => w.id === "phantom");
      const petra = result.current.wallets.find((w) => w.id === "petra");

      expect(phantom?.isInstalled).toBe(true);
      expect(petra?.isInstalled).toBe(false);
    });
  });

  it("preserves wallet metadata in results", async () => {
    (Platform as any).OS = "ios";
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useWalletDiscovery());

    await waitFor(() => {
      expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
    });

    for (const detected of result.current.wallets) {
      const original = WALLET_REGISTRY.find((w) => w.id === detected.id);
      expect(original).toBeDefined();
      expect(detected.name).toBe(original!.name);
      expect(detected.scheme).toBe(original!.scheme);
      expect(detected.androidPackage).toBe(original!.androidPackage);
      expect(detected.ecosystem).toBe(original!.ecosystem);
    }
  });

  it("detects multiple installed wallets", async () => {
    (Platform as any).OS = "ios";
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useWalletDiscovery());

    await waitFor(() => {
      expect(result.current.wallets.length).toBe(WALLET_REGISTRY.length);
    });

    const allInstalled = result.current.wallets.every((w) => w.isInstalled);
    expect(allInstalled).toBe(true);
  });
});
