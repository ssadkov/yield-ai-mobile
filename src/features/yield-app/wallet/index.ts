import { useApp } from "../lib/store";
import { mockDriver } from "./mock-driver";
import { canConnect, createNativeDriver, useWalletEnv } from "./native-driver";
import type { WalletDriver, WalletId } from "./types";

/** EXPO_PUBLIC_WALLET_MODE=mock runs the app with the mock wallet (emulator, demos). */
const MODE = process.env.EXPO_PUBLIC_WALLET_MODE === "mock" ? "mock" : "native";

const nativeDriver = createNativeDriver(() => useApp.getState().wallet?.id);

export function getDriver(): WalletDriver {
  return MODE === "mock" ? mockDriver : nativeDriver;
}

export function useIsMock() {
  return MODE === "mock";
}

/** Seed Vault is "Detected" on a Solana phone (Seeker). The mock pretends to be one. */
/** Mock mode connects any row, so the demo keeps every wallet tappable. */
export function useCanConnect() {
  const isSolanaPhone = useWalletEnv((s) => s.isSolanaPhone);
  const phantomInstalled = useWalletEnv((s) => s.phantomInstalled);
  return (id: WalletId) => MODE === "mock" || canConnect(id, { isSolanaPhone, phantomInstalled });
}

export function useSeedVaultDetected() {
  const isSolanaPhone = useWalletEnv((s) => s.isSolanaPhone);
  return MODE === "mock" || isSolanaPhone === true;
}

export { canConnect, useWalletEnv } from "./native-driver";
export * from "./types";
