import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { WalletService } from "@/core/wallet";
import type { DetectedWallet } from "@/features/wallet-discovery";
import {
  MWA_WALLET_ID,
  SEED_VAULT_WALLET_ID,
  type SolanaCluster,
} from "@/features/wallet-connection-solana";
import type { BridgeCommandFromWebHandler } from "@/shared/types";
import { createWebViewCommandHandler } from "../lib/webview-command-handler";
import { useWalletRegistry } from "./use-wallet-registry";

interface UseWalletGatewayResult {
  handleWalletCommandFromWeb: BridgeCommandFromWebHandler;
}

const ANDROID_MWA_WALLET: DetectedWallet = {
  id: MWA_WALLET_ID,
  name: "Solana Wallet",
  scheme: "solana-wallet",
  androidPackage: "",
  ecosystem: "solana",
  icon: require("@/assets/wallet-icons/solana-mark.png"),
  isInstalled: true,
};

const ANDROID_SEED_VAULT_WALLET: DetectedWallet = {
  id: SEED_VAULT_WALLET_ID,
  name: "Seed Vault",
  scheme: "seed-vault",
  androidPackage: "com.solanamobile.seedvault",
  ecosystem: "solana",
  icon: require("@/assets/wallet-icons/solana-mark.png"),
  isInstalled: true,
};

function getAndroidSolanaWalletId(isSolanaPhone: boolean): string {
  return isSolanaPhone ? SEED_VAULT_WALLET_ID : MWA_WALLET_ID;
}

function getBridgeWallets(
  wallets: DetectedWallet[],
  isSolanaPhone: boolean,
): DetectedWallet[] {
  if (Platform.OS !== "android") return wallets;
  return [
    ...wallets.filter((wallet) => wallet.ecosystem !== "solana"),
    isSolanaPhone ? ANDROID_SEED_VAULT_WALLET : ANDROID_MWA_WALLET,
  ];
}

/**
 * Composition hook that wires together wallet lifecycle, business logic,
 * and WebView bridge transport into a single `handleWalletCommandFromWeb` callback.
 *
 * - useWalletRegistry — creates/disposes connectors, sets up deeplinks
 * - WalletService     — chain-agnostic wallet operations (connect, sign, …)
 * - createWebViewCommandHandler — routes bridge commands to service, sends responses back
 * - optional installed-wallet sync — proactively pushes wallet discovery payload to web
 */
export function useWalletGateway(
  sendCommandToWeb: (type: string, payload: Record<string, unknown>) => void,
  wallets: DetectedWallet[],
  shouldSyncInstalledWallets = false,
  solanaCluster?: SolanaCluster,
  isSolanaPhone = false,
): UseWalletGatewayResult {
  const registry = useWalletRegistry({ wallets, solanaCluster, isSolanaPhone });
  const service = useMemo(() => new WalletService(registry), [registry]);
  const bridgeWallets = useMemo(
    () => getBridgeWallets(wallets, isSolanaPhone),
    [wallets, isSolanaPhone],
  );
  const androidSolanaWalletId = getAndroidSolanaWalletId(isSolanaPhone);
  const allowedAndroidSolanaWalletIds = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        isSolanaPhone &&
        wallets.some(
          (wallet) =>
            wallet.ecosystem === "solana" &&
            wallet.id === "phantom" &&
            wallet.isInstalled,
        )
          ? ["phantom"]
          : [],
      ),
    [isSolanaPhone, wallets],
  );
  // Wallet discovery runs again when the app returns from an external wallet.
  // Keep request deduplication outside the memoized bridge handler so a React
  // rerender cannot forget a transaction that is still in flight.
  const inFlightTransactionRequestsRef = useRef(new Set<string>());
  const handleWalletCommandFromWeb = useMemo(
    () =>
      createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        bridgeWallets,
        androidSolanaWalletId,
        allowedAndroidSolanaWalletIds,
        inFlightTransactionRequestsRef.current,
      ),
    [
      service,
      sendCommandToWeb,
      bridgeWallets,
      androidSolanaWalletId,
      allowedAndroidSolanaWalletIds,
    ],
  );

  useEffect(() => {
    if (!shouldSyncInstalledWallets) return;
    sendCommandToWeb("installed_wallets", { wallets: bridgeWallets });
  }, [bridgeWallets, shouldSyncInstalledWallets, sendCommandToWeb]);

  return { handleWalletCommandFromWeb };
}
