/**
 * EXPO_PUBLIC_YIELD_NETWORK picks the real backend:
 *   devnet  — Yield AI Safe API on Solana Devnet: idle USDC only (no APY, no Fixed, no agent).
 *   mainnet — the same Safe on Solana Mainnet plus Kamino (Flexible) and Exponent PT (Fixed).
 * Without it the app keeps its mock portfolio. The mock wallet always stays mock.
 */
export type NetworkId = "devnet" | "mainnet";

const RAW = process.env.EXPO_PUBLIC_YIELD_NETWORK;
export const NETWORK: NetworkId | null =
  (RAW === "devnet" || RAW === "mainnet") && process.env.EXPO_PUBLIC_WALLET_MODE !== "mock" ? RAW : null;

/** Any real backend (devnet or mainnet). */
export const LIVE = NETWORK !== null;
export const DEVNET = NETWORK === "devnet";
export const MAINNET = NETWORK === "mainnet";

type NetworkSpec = {
  apiBase: string;
  /** JSON-RPC used to send signed transactions. */
  rpcUrl: string;
  /** JSON-RPC used only to read the block height (the expiry clock). */
  heightRpcUrl: string;
  /** Wallet adapter cluster. */
  walletCluster: "devnet" | "mainnet-beta";
  label: string;
  /** Pinned in the app: every API response and every transaction is checked against these. */
  expected: { cluster: string; chain: string; genesis: string; programId: string; usdcMint: string };
};

const DEVNET_API = "https://yield-ai-solana-devnet.vercel.app/api/mobile/v1";
const MAINNET_API = "https://yield-ai-solana-mainnet.vercel.app/api/mobile/v1";

const SPECS: Record<NetworkId, NetworkSpec> = {
  devnet: {
    apiBase: DEVNET_API,
    rpcUrl: process.env.EXPO_PUBLIC_SOLANA_RPC_URL_DEVNET?.trim() || "https://api.devnet.solana.com",
    heightRpcUrl: process.env.EXPO_PUBLIC_SOLANA_RPC_URL_DEVNET?.trim() || "https://api.devnet.solana.com",
    walletCluster: "devnet",
    label: "Solana Devnet",
    expected: {
      cluster: "devnet",
      chain: "solana:devnet",
      genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      programId: "8xa1D9Tydju5HqnRPVSJwNbjJGAdY55WKjbf9ijpz3D5",
      usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
  },
  mainnet: {
    apiBase: MAINNET_API,
    // The API's own transport: same RPC that built the plan, mandatory preflight, no signer.
    rpcUrl: `${MAINNET_API}/rpc`,
    // The API's upstream (PublicNode) answers getBlockHeight with the slot number, ~22M too high,
    // which made every fresh transaction look expired. Read the height from the public RPC instead.
    heightRpcUrl: process.env.EXPO_PUBLIC_SOLANA_RPC_URL_MAINNET_BETA?.trim() || "https://api.mainnet-beta.solana.com",
    walletCluster: "mainnet-beta",
    label: "Solana",
    expected: {
      cluster: "mainnet",
      chain: "solana:mainnet",
      genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
      programId: "yie1Jjq6y3rjsiGkgMYnwTveSgpSrSh4n41JHRNyBih",
      usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    },
  },
};

export const NET = SPECS[NETWORK ?? "devnet"];
export const API_BASE = (process.env.EXPO_PUBLIC_YIELD_API_BASE?.trim() || NET.apiBase).replace(/\/+$/, "");
export const CLUSTER = NET.expected.cluster as NetworkId;
export const EXPECTED_NETWORK = NET.expected;

/** Exponent PT market behind the Fixed strategy (Mainnet). */
export const EXPONENT_MATURITY = Date.UTC(2027, 0, 10, 13, 0, 0);
export const PT_DECIMALS = 9;
/** Kamino's vault minimum. */
export const KAMINO_MIN_USDC = 1;

export const FAUCET_SOL = "https://faucet.solana.com/";
export const FAUCET_USDC = "https://faucet.circle.com/";

const clusterParam = () => (DEVNET ? "?cluster=devnet" : "");

export function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}${clusterParam()}`;
}

export function explorerAddress(address: string) {
  return `https://explorer.solana.com/address/${address}${clusterParam()}`;
}
