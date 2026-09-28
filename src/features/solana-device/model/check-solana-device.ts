import { SeedVault } from "@solana-mobile/seed-vault-lib";
import { Platform } from "react-native";

let cached: Promise<boolean> | null = null;

export function __resetSolanaDeviceCacheForTests() {
  cached = null;
}

export function checkIsSolanaDevice(): Promise<boolean> {
  if (cached) return cached;
  if (Platform.OS !== "android") {
    cached = Promise.resolve(false);
    return cached;
  }
  cached = SeedVault.isSeedVaultAvailable(__DEV__)
    .then((result) => {
      if (__DEV__) console.log("[SolanaDevice] isSolanaPhone:", result);
      return result;
    })
    .catch((e) => {
      if (__DEV__) console.warn("[SolanaDevice] Seed Vault check failed:", e);
      // Reset so a later mount can retry instead of caching the failure.
      cached = null;
      return false;
    });
  return cached;
}
