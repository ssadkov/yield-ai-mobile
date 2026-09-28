import { Linking } from "react-native";
import type { ConnectorRegistry } from "@/core/wallet";
import { resolveWalletCallbackChain } from "./wallet-callback-url";

export function createDeeplinkHandler(registry: ConnectorRegistry) {
  return {
    subscribe(): () => void {
      const handler = (url: string) => {
        const chain = resolveWalletCallbackChain(url);
        if (!chain) return;

        const connector = registry.getActive(chain);
        if (!connector?.handleDeeplink) return;

        connector.handleDeeplink(url);
      };

      const subscription = Linking.addEventListener("url", (event) => {
        console.log("[DeeplinkHandler] Incoming URL:", event.url);
        handler(event.url);
      });

      // Handle cold-start deeplink (app opened via URL)
      Linking.getInitialURL().then((url) => {
        if (url) handler(url);
      });

      return () => subscription.remove();
    },
  };
}
