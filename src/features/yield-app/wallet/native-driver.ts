import { Platform } from "react-native";
import { create } from "zustand";
import type { WalletService } from "@/core/wallet";
import type { DetectedWallet } from "@/features/wallet-discovery";
import { MWA_WALLET_ID, SEED_VAULT_WALLET_ID } from "@/features/wallet-connection-solana";
import { WalletError, toWalletError, type TxStep, type WalletDriver, type WalletId } from "./types";

/**
 * Real wallets through the app's own connectors (Seed Vault, MWA, Phantom deeplink).
 * No WebView bridge: the screens call WalletService directly.
 */

type WalletEnv = {
  service: WalletService | null;
  /** null until the Seed Vault check has finished */
  isSolanaPhone: boolean | null;
  phantomInstalled: boolean;
  /** Every registry wallet with its install state (empty until the first scan finishes). */
  detected: DetectedWallet[];
};

export const useWalletEnv = create<WalletEnv>(() => ({
  service: null,
  isSolanaPhone: null,
  phantomInstalled: false,
  detected: [],
}));

/** Solana wallets that also speak MWA: on a regular Android phone they are reached through the MWA picker. */
const MWA_WALLETS = new Set<WalletId>(["solflare", "backpack", "jupiter"]);
/** Wallets with their own connector on iOS (registered by useWalletRegistry when installed). */
const IOS_WALLETS = new Set<WalletId>(["phantom", "solflare", "backpack", "jupiter"]);

const CHAIN = "solana";

/** Connector id in this process. Connector sessions live in memory, so after a restart we reconnect before signing. */
let session: string | null = null;

/** Maps a row on the Connect sheet to the connector registered by useWalletRegistry. */
export function nativeWalletId(id: WalletId, env: Pick<WalletEnv, "isSolanaPhone" | "phantomInstalled">): string {
  const notYet = () => new WalletError("NOT_SUPPORTED", "Not available in the app yet.");
  if (id === "seed-vault" || id === "mwa") {
    if (Platform.OS !== "android") return "phantom";
    return env.isSolanaPhone ? SEED_VAULT_WALLET_ID : MWA_WALLET_ID;
  }
  if (Platform.OS !== "android") {
    if (IOS_WALLETS.has(id)) return id;
    throw notYet();
  }
  if (MWA_WALLETS.has(id)) {
    // A Seeker only registers Seed Vault + Phantom, so other wallets have no route there yet.
    if (env.isSolanaPhone) throw notYet();
    return MWA_WALLET_ID;
  }
  if (id === "phantom") {
    // Regular Android phones reach Phantom through the MWA system picker.
    if (!env.isSolanaPhone) return MWA_WALLET_ID;
    if (!env.phantomInstalled) throw new WalletError("NOT_AVAILABLE", "Phantom isn't installed on this phone.");
    return "phantom";
  }
  throw notYet();
}

/** false for wallets the app can't connect to yet (shown as "Soon" on the Connect sheet). */
export function canConnect(id: WalletId, env: Pick<WalletEnv, "isSolanaPhone" | "phantomInstalled">): boolean {
  try {
    nativeWalletId(id, env);
    return true;
  } catch (e) {
    return !(e instanceof WalletError && e.code === "NOT_SUPPORTED");
  }
}

function requireService(): WalletService {
  const { service } = useWalletEnv.getState();
  if (!service) throw new WalletError("NOT_AVAILABLE", "Wallets are still loading. Try again.");
  return service;
}

async function ensureSession(walletId: WalletId): Promise<{ service: WalletService; nativeId: string }> {
  const service = requireService();
  const nativeId = nativeWalletId(walletId, useWalletEnv.getState());
  if (session !== nativeId) {
    await service.connect(CHAIN, nativeId);
    session = nativeId;
  }
  return { service, nativeId };
}

export function createNativeDriver(getWalletId: () => WalletId | undefined): WalletDriver {
  return {
    kind: "native",
    async connect(walletId) {
      const service = requireService();
      const nativeId = nativeWalletId(walletId, useWalletEnv.getState());
      try {
        const account = await service.connect(CHAIN, nativeId);
        session = nativeId;
        return { address: account.address };
      } catch (e) {
        throw toWalletError(e);
      }
    },
    cancelConnect(walletId) {
      const { service } = useWalletEnv.getState();
      try {
        service?.cancelConnect(CHAIN, nativeWalletId(walletId, useWalletEnv.getState()));
      } catch {
        // Wallets the app can't use never started a connect.
      }
    },
    async disconnect() {
      const service = useWalletEnv.getState().service;
      session = null;
      try {
        await service?.disconnect(CHAIN);
      } catch {
        // Nothing active is fine.
      }
    },
    async signAndSubmit(step: TxStep, onPhase) {
      onPhase("signing");
      try {
        const { service } = await ensureSession(getWalletId() ?? "seed-vault");
        // TODO(backend): sign and submit the real transaction once the backend builds it
        // (service.signTransaction(chain, base64, true)). Until then each step is signed as a
        // readable message, which still runs the real wallet approval (double-tap on Seeker).
        const signature = await service.signMessage(CHAIN, `Yield AI (test): ${step.title} — ${step.detail}`, "utf8");
        onPhase("submitting");
        return signature;
      } catch (e) {
        throw toWalletError(e);
      }
    },
  };
}
