export {
  SolanaConnector,
  DEEPLINK_WALLET_IDS,
  WC_WALLET_IDS,
  MWA_WALLET_ID,
  SEED_VAULT_WALLET_ID,
  SUPPORTED_SOLANA_WALLET_IDS,
  ANDROID_MWA_WALLET_IDS,
} from "./model/solana-connector";
export type { SolanaWalletConfig, SolanaCluster } from "./model/types";
export { getBlockHeight, submitSignedTransaction } from "./lib/solana-rpc";
