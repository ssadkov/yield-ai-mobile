export {
  getWalletConnectClient,
  __resetWalletConnectClientForTests,
} from "./wc-client";
export { WC_METADATA, WC_PROJECT_ID } from "./wc-config";
export {
  canOpenWallet,
  openWalletWithWcUri,
  resolveWalletRedirectUri,
} from "./wc-deeplinks";
