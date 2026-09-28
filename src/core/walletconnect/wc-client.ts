import "@walletconnect/react-native-compat";
import { SignClient } from "@walletconnect/sign-client";
import type { ISignClient } from "@walletconnect/types";

import { WC_METADATA, WC_PROJECT_ID } from "./wc-config";

let clientPromise: Promise<ISignClient> | null = null;

// Singleton SignClient shared across all chain namespaces (Solana, Aptos, ...).
// One Reown project handles every namespace; the project id only identifies
// our dApp, not the chain.
export function getWalletConnectClient(): Promise<ISignClient> {
  if (!WC_PROJECT_ID) {
    return Promise.reject(
      new Error(
        "EXPO_PUBLIC_WC_PROJECT_ID is not set. Register a project at https://cloud.reown.com and add it to .env",
      ),
    );
  }
  if (!clientPromise) {
    clientPromise = SignClient.init({
      projectId: WC_PROJECT_ID,
      metadata: WC_METADATA,
    });
  }
  return clientPromise;
}

// For tests — reset the memoized singleton between runs.
export function __resetWalletConnectClientForTests(): void {
  clientPromise = null;
}
