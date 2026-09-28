import { Platform } from "react-native";
import type {
  ChainConnector,
  WalletAccount,
} from "@/core/wallet";
import { PhantomDeeplinkAdapter } from "../lib/phantom-deeplink";
import { SolflareDeeplinkAdapter } from "../lib/solflare-deeplink";
import { BackpackDeeplinkAdapter } from "../lib/backpack-deeplink";
import { WalletConnectAdapter } from "./walletconnect-adapter";
import type { SolanaWalletAdapter, SolanaWalletConfig } from "./types";
import { submitSignedTransaction } from "../lib/solana-rpc";

// Wallets with our custom nacl.box deeplink adapters.
export const DEEPLINK_WALLET_IDS = new Set(["phantom", "solflare", "backpack"]);

// Wallets that speak WalletConnect v2 instead of a proprietary deeplink protocol.
// Jupiter has no native deeplink flow — WC is the only option.
export const WC_WALLET_IDS = new Set(["jupiter"]);

// Solana wallets that speak MWA. On Android each gets its own MWA connector aimed
// at the wallet's package, so the user lands in that wallet instead of a chooser.
export const ANDROID_MWA_WALLET_IDS = new Set(["solflare", "backpack", "jupiter"]);

// Generic Android Mobile Wallet Adapter picker. Android resolves this through
// the system intent flow to any installed Solana wallet that supports MWA.
export const MWA_WALLET_ID = "mwa";

// Native Solana Mobile Seed Vault connector for Solana phone devices.
export const SEED_VAULT_WALLET_ID = "seed-vault";

// Union used by UI and registry filters to decide which wallets to show/register.
export const SUPPORTED_SOLANA_WALLET_IDS = new Set([
  MWA_WALLET_ID,
  SEED_VAULT_WALLET_ID,
  ...DEEPLINK_WALLET_IDS,
  ...WC_WALLET_IDS,
]);

class LazyMwaAdapter implements SolanaWalletAdapter {
  readonly name = "Mobile Wallet Adapter";
  private adapterPromise: Promise<SolanaWalletAdapter> | null = null;

  constructor(private config: SolanaWalletConfig) {}

  async connect(): Promise<{ address: string; chain: string }> {
    return (await this.getAdapter()).connect();
  }

  async disconnect(): Promise<void> {
    return (await this.getAdapter()).disconnect();
  }

  async signAndSendTransaction(transaction: Uint8Array): Promise<string> {
    return (await this.getAdapter()).signAndSendTransaction(transaction);
  }

  async signTransaction(transaction: Uint8Array): Promise<string> {
    return (await this.getAdapter()).signTransaction(transaction);
  }

  async signMessage(message: Uint8Array): Promise<string> {
    return (await this.getAdapter()).signMessage(message);
  }

  dispose(): void {
    this.adapterPromise?.then((adapter) => adapter.dispose()).catch(() => {});
    this.adapterPromise = null;
  }

  private getAdapter(): Promise<SolanaWalletAdapter> {
    this.adapterPromise ??= Promise.resolve().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MwaAdapter } = require("../lib/mwa-adapter") as typeof import("../lib/mwa-adapter");
      return new MwaAdapter(this.config);
    });
    return this.adapterPromise;
  }
}

class LazySeedVaultAdapter implements SolanaWalletAdapter {
  readonly name = "Seed Vault";
  private adapterPromise: Promise<SolanaWalletAdapter> | null = null;

  constructor(private config: SolanaWalletConfig) {}

  async connect(): Promise<{ address: string; chain: string }> {
    return (await this.getAdapter()).connect();
  }

  async disconnect(): Promise<void> {
    return (await this.getAdapter()).disconnect();
  }

  async signAndSendTransaction(transaction: Uint8Array): Promise<string> {
    return (await this.getAdapter()).signAndSendTransaction(transaction);
  }

  async signTransaction(transaction: Uint8Array): Promise<string> {
    return (await this.getAdapter()).signTransaction(transaction);
  }

  async signMessage(message: Uint8Array): Promise<string> {
    return (await this.getAdapter()).signMessage(message);
  }

  dispose(): void {
    this.adapterPromise?.then((adapter) => adapter.dispose()).catch(() => {});
    this.adapterPromise = null;
  }

  private getAdapter(): Promise<SolanaWalletAdapter> {
    this.adapterPromise ??= Promise.resolve().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SeedVaultAdapter } = require("../lib/seed-vault-adapter") as typeof import("../lib/seed-vault-adapter");
      return new SeedVaultAdapter(this.config);
    });
    return this.adapterPromise;
  }
}

function createSolanaAdapter(config: SolanaWalletConfig): SolanaWalletAdapter {
  if (Platform.OS === "android") {
    if (config.walletId === MWA_WALLET_ID || ANDROID_MWA_WALLET_IDS.has(config.walletId)) {
      // Keep MWA out of the regular Expo Go startup path. Expo Go does not ship
      // SolanaMobileWalletAdapter, so importing it eagerly crashes the app.
      return new LazyMwaAdapter(config);
    }
    if (config.walletId === SEED_VAULT_WALLET_ID) {
      return new LazySeedVaultAdapter(config);
    }
    if (config.walletId === "phantom") {
      return new PhantomDeeplinkAdapter(config);
    }
    throw new Error(`Unsupported Solana wallet on Android: ${config.walletId}`);
  }

  if (WC_WALLET_IDS.has(config.walletId)) {
    return new WalletConnectAdapter(config);
  }

  // Remaining iOS wallets speak their own deeplink protocol, or WalletConnect
  // for Jupiter above.
  switch (config.walletId) {
    case "phantom":
      return new PhantomDeeplinkAdapter(config);
    case "solflare":
      return new SolflareDeeplinkAdapter(config);
    case "backpack":
      return new BackpackDeeplinkAdapter(config);
    default:
      throw new Error(`Unsupported Solana wallet: ${config.walletId}`);
  }
}

function isUnsupportedSignAndSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /-32601|not supported/i.test(message);
}

export class SolanaConnector implements ChainConnector {
  readonly chain = "solana";
  readonly walletId: string;
  private adapter: SolanaWalletAdapter;
  private config: SolanaWalletConfig;

  constructor(config: SolanaWalletConfig) {
    this.walletId = config.walletId;
    this.config = config;
    this.adapter = createSolanaAdapter(config);
  }

  async connect(): Promise<WalletAccount> {
    const result = await this.adapter.connect();
    return { ...result, walletId: this.walletId };
  }

  cancelConnect(): void {
    this.adapter.cancelConnect?.();
  }

  async disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  async signAndSendTransaction(tx: Uint8Array): Promise<string> {
    if (Platform.OS === "android" && this.walletId === "phantom") {
      // Some Phantom Android builds reject signAndSendTransaction and trigger
      // the fallback below, which opens the wallet a second time. Sign once and
      // submit the returned transaction through our RPC instead.
      const signedTransaction = await this.adapter.signTransaction(tx);
      return submitSignedTransaction(signedTransaction, this.config.cluster);
    }

    try {
      return await this.adapter.signAndSendTransaction(tx);
    } catch (error) {
      if (!isUnsupportedSignAndSendError(error)) throw error;

      const signedTransaction = await this.adapter.signTransaction(tx);
      return submitSignedTransaction(signedTransaction, this.config.cluster);
    }
  }

  async signTransaction(tx: Uint8Array): Promise<string> {
    return this.adapter.signTransaction(tx);
  }

  async signMessage(message: Uint8Array): Promise<string> {
    return this.adapter.signMessage(message);
  }

  handleDeeplink(url: string): void {
    this.adapter.handleDeeplink?.(url);
  }

  dispose(): void {
    this.adapter.dispose();
  }
}
