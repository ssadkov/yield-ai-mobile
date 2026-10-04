import { useEffect, useMemo } from "react";
import { WalletService } from "@/core/wallet";
import { useSolanaDevice } from "@/features/solana-device";
import { useWalletDiscovery } from "@/features/wallet-discovery";
import { useWalletRegistry } from "@/features/wallet-gateway";
import { DEVNET } from "../devnet/config";
import { useDevnetRuntime } from "../devnet/state";
import { useWalletEnv } from "./native-driver";

/**
 * Mounts the app's wallet connectors once (Seed Vault / MWA / Phantom deeplinks)
 * and exposes them to the screens through useWalletEnv.
 */
export function WalletRuntime() {
  const { wallets } = useWalletDiscovery();
  const { isSolanaPhone, isLoading } = useSolanaDevice();
  const registry = useWalletRegistry({ wallets, isSolanaPhone, solanaCluster: DEVNET ? "devnet" : "mainnet-beta" });
  const service = useMemo(() => new WalletService(registry), [registry]);
  useDevnetRuntime();
  const phantomInstalled = wallets.some((w) => w.id === "phantom" && w.isInstalled);

  useEffect(() => {
    useWalletEnv.setState({
      service,
      isSolanaPhone: isLoading ? null : isSolanaPhone,
      phantomInstalled,
      detected: wallets,
    });
  }, [service, isSolanaPhone, isLoading, phantomInstalled, wallets]);

  return null;
}
