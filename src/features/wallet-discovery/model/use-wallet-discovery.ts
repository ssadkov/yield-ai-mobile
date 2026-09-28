import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { canResolveScheme, isWalletInstalled } from "wallet-availability";
import { WALLET_REGISTRY } from "./wallet-registry";
import type { DetectedWallet } from "./types";

const ENABLE_WALLET_DISCOVERY_LOGS = false;

async function detectWallets(): Promise<DetectedWallet[]> {
  return Promise.all(
    WALLET_REGISTRY.map(async (wallet) => {
      try {
        if (Platform.OS === "android") {
          const packagesToCheck = Array.from(
            new Set([wallet.androidPackage, ...(wallet.androidPackageAliases ?? [])]),
          );
          const checks = await Promise.all(
            packagesToCheck.map((pkg) => isWalletInstalled(pkg)),
          );

          const foundByPackage = checks.some(Boolean);

          // Fallback: resolve URI scheme if package lookup fails (e.g. Android 15 / Seeker)
          const isInstalled =
            foundByPackage || (await canResolveScheme(wallet.scheme));

          return { ...wallet, isInstalled };
        }
        return {
          ...wallet,
          isInstalled: await Linking.canOpenURL(`${wallet.scheme}://`),
        };
      } catch (error) {
        if (__DEV__ && ENABLE_WALLET_DISCOVERY_LOGS) {
          console.warn("[WalletDiscovery] wallet check failed:", {
            walletId: wallet.id,
            scheme: wallet.scheme,
            platform: Platform.OS,
            error,
          });
        }
        return {
          ...wallet,
          isInstalled: false,
        };
      }
    }),
  );
}

function logDetectedWallets(results: DetectedWallet[]) {
  if (!__DEV__ || !ENABLE_WALLET_DISCOVERY_LOGS) return;
  const ecosystems = Array.from(new Set(results.map((wallet) => wallet.ecosystem)));
  for (const ecosystem of ecosystems) {
    const installedWalletIds = results
      .filter((wallet) => wallet.ecosystem === ecosystem && wallet.isInstalled)
      .map((wallet) => wallet.id);

    console.log("[WalletDiscovery] installed wallets:", {
      platform: Platform.OS,
      ecosystem,
      installedWalletIds,
    });
  }
}

export function useWalletDiscovery() {
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const rescan = useCallback(async () => {
    try {
      const results = await detectWallets();
      logDetectedWallets(results);
      if (isMountedRef.current) setWallets(results);
    } catch (error) {
      if (__DEV__ && ENABLE_WALLET_DISCOVERY_LOGS) {
        console.warn("[WalletDiscovery] detection failed:", error);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // Initial scan
  useEffect(() => {
    rescan();
    return () => {
      isMountedRef.current = false;
    };
  }, [rescan]);

  // Re-scan when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        rescan();
      }
    });
    return () => subscription.remove();
  }, [rescan]);

  return { wallets, isLoading, rescan };
}
