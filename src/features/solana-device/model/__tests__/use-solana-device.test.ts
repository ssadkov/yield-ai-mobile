import { renderHook, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { SeedVault } from "@solana-mobile/seed-vault-lib";
import { useSolanaDevice } from "../use-solana-device";
import { __resetSolanaDeviceCacheForTests } from "../check-solana-device";

jest.mock("@solana-mobile/seed-vault-lib", () => ({
  SeedVault: {
    isSeedVaultAvailable: jest.fn(),
  },
}));

const mockedIsSeedVaultAvailable = jest.mocked(SeedVault.isSeedVaultAvailable);

beforeEach(() => {
  jest.clearAllMocks();
  __resetSolanaDeviceCacheForTests();
});

describe("useSolanaDevice", () => {
  describe("on Android", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
    });

    it("returns isLoading=true initially, then false after check", async () => {
      mockedIsSeedVaultAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => useSolanaDevice());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("returns isSolanaPhone=true when Seed Vault is available", async () => {
      mockedIsSeedVaultAvailable.mockResolvedValue(true);

      const { result } = renderHook(() => useSolanaDevice());

      await waitFor(() => {
        expect(result.current.isSolanaPhone).toBe(true);
      });
    });

    it("returns isSolanaPhone=false when Seed Vault is not available", async () => {
      mockedIsSeedVaultAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => useSolanaDevice());

      await waitFor(() => {
        expect(result.current.isSolanaPhone).toBe(false);
      });
    });

    it("calls isSeedVaultAvailable with __DEV__ flag", async () => {
      mockedIsSeedVaultAvailable.mockResolvedValue(false);

      renderHook(() => useSolanaDevice());

      await waitFor(() => {
        expect(mockedIsSeedVaultAvailable).toHaveBeenCalledWith(__DEV__);
      });
    });

    it("returns isSolanaPhone=false when native module throws", async () => {
      mockedIsSeedVaultAvailable.mockRejectedValue(new Error("Native module error"));

      const { result } = renderHook(() => useSolanaDevice());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSolanaPhone).toBe(false);
      });
    });
  });

  describe("on iOS", () => {
    beforeEach(() => {
      (Platform as any).OS = "ios";
    });

    it("returns isSolanaPhone=false without calling native module", async () => {
      const { result } = renderHook(() => useSolanaDevice());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSolanaPhone).toBe(false);
      expect(mockedIsSeedVaultAvailable).not.toHaveBeenCalled();
    });
  });
});
