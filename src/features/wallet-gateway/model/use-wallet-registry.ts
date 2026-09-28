import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { ConnectorRegistry } from "@/core/wallet";
import {
  SolanaConnector,
  SUPPORTED_SOLANA_WALLET_IDS,
  MWA_WALLET_ID,
  SEED_VAULT_WALLET_ID,
} from "@/features/wallet-connection-solana";
import { AptosConnector } from "@/features/wallet-connection-aptos";
import type { DetectedWallet } from "@/features/wallet-discovery";
import type { SolanaCluster, SolanaWalletConfig } from "@/features/wallet-connection-solana";
import type { AptosWalletConfig, AptosNetwork } from "@/features/wallet-connection-aptos";
import { createDeeplinkHandler } from "../lib/deeplink-handler";

const APP_SCHEME = "yieldaimobile";
const APP_NAME = "YieldAI";

function buildSolanaConfig(
  walletId: string,
  cluster: SolanaCluster,
): SolanaWalletConfig {
  return { walletId, appScheme: APP_SCHEME, cluster, appName: APP_NAME };
}

function buildAptosConfig(
  walletId: string,
  network: AptosNetwork,
): AptosWalletConfig {
  return { walletId, appScheme: APP_SCHEME, appName: APP_NAME, network };
}

function getInstalledSolanaWallets(
  wallets: DetectedWallet[],
  isSolanaPhone: boolean,
): DetectedWallet[] {
  if (Platform.OS === "android") {
    if (!isSolanaPhone) return [];
    return wallets.filter(
      (wallet) =>
        wallet.ecosystem === "solana" &&
        wallet.id === "phantom" &&
        wallet.isInstalled,
    );
  }
  return wallets.filter((w) => {
    if (w.ecosystem !== "solana" || !w.isInstalled) return false;
    // Only register wallets with a supported transport (deeplink or WalletConnect).
    // Glow uses Safari Extension on iOS with no mobile dApp protocol — skip.
    return SUPPORTED_SOLANA_WALLET_IDS.has(w.id);
  });
}

interface UseWalletRegistryOptions {
  wallets: DetectedWallet[];
  solanaCluster?: SolanaCluster;
  isSolanaPhone?: boolean;
}

/**
 * Registers supported blockchains (Solana, Aptos), subscribes to wallet
 * deeplink responses, and disposes resources on unmount.
 *
 * On Android, registers MWA on regular devices or Seed Vault on Solana phone
 * devices. An installed Phantom connector is additionally registered on
 * Solana phones. On iOS, creates a SolanaConnector for each installed Solana
 * wallet with a supported transport.
 * After first connect, MWA saves wallet_uri_base for direct reconnection.
 */
export function useWalletRegistry(options: UseWalletRegistryOptions): ConnectorRegistry {
  const { wallets, solanaCluster = "mainnet-beta", isSolanaPhone = false } = options;
  const registryRef = useRef<ConnectorRegistry | null>(null);
  const clusterRef = useRef(solanaCluster);
  const registeredWalletIdsRef = useRef<string[]>([]);
  const androidSolanaWalletId =
    isSolanaPhone ? SEED_VAULT_WALLET_ID : MWA_WALLET_ID;

  if (!registryRef.current) {
    registryRef.current = new ConnectorRegistry();
  }

  const registry = registryRef.current;

  // Ensure Aptos connectors are always registered (survives dispose/remount cycles)
  if (!registry.has("aptos", "petra")) {
    registry.register(new AptosConnector(buildAptosConfig("petra", "mainnet")));
  }
  // Ensure a fallback Solana connector exists synchronously
  if (!registry.has("solana")) {
    registry.register(
      new SolanaConnector(
        buildSolanaConfig(
          Platform.OS === "android" ? androidSolanaWalletId : "phantom",
          solanaCluster,
        ),
      ),
    );
    registeredWalletIdsRef.current = [
      Platform.OS === "android" ? androidSolanaWalletId : "phantom",
    ];
  }
  const installedSolana = getInstalledSolanaWallets(wallets, isSolanaPhone);
  const installedIds = installedSolana.map((w) => w.id).sort().join(",");

  // Rebuild Solana connectors when the target wallet set or cluster changes.
  useEffect(() => {
    const currentIds = registeredWalletIdsRef.current.sort().join(",");
    const targetIds =
      Platform.OS === "android"
        ? [androidSolanaWalletId, ...installedSolana.map((wallet) => wallet.id)]
            .sort()
            .join(",")
        : installedSolana.map((w) => w.id).sort().join(",");
    if (targetIds === currentIds && solanaCluster === clusterRef.current) return;

    // Dispose old Solana connectors
    for (const id of registeredWalletIdsRef.current) {
      registry.get("solana", id)?.dispose();
      registry.unregister("solana", id);
    }

    // Register fresh connectors
    const newIds: string[] = [];
    if (Platform.OS === "android") {
      registry.register(
        new SolanaConnector(buildSolanaConfig(androidSolanaWalletId, solanaCluster)),
      );
      newIds.push(androidSolanaWalletId);
      for (const wallet of installedSolana) {
        registry.register(
          new SolanaConnector(buildSolanaConfig(wallet.id, solanaCluster)),
        );
        newIds.push(wallet.id);
      }
    } else {
      for (const wallet of installedSolana) {
        registry.register(
          new SolanaConnector(buildSolanaConfig(wallet.id, solanaCluster)),
        );
        newIds.push(wallet.id);
      }

      // Fallback: if no installed wallets detected yet, register phantom without baseUri
      if (newIds.length === 0) {
        registry.register(new SolanaConnector(buildSolanaConfig("phantom", solanaCluster)));
        newIds.push("phantom");
      }
    }

    registeredWalletIdsRef.current = newIds;
    clusterRef.current = solanaCluster;
  }, [androidSolanaWalletId, installedIds, solanaCluster, registry, installedSolana]);

  useEffect(() => {
    const handler = createDeeplinkHandler(registry);
    const unsubscribe = handler.subscribe();
    return unsubscribe;
  }, [registry]);

  useEffect(() => {
    return () => {
      const registry = registryRef.current;
      if (!registry) return;
      // Tear down Solana transports only; keep Aptos/Petra session across remounts.
      for (const id of registeredWalletIdsRef.current) {
        registry.get("solana", id)?.dispose();
      }
    };
  }, []);

  return registry;
}
