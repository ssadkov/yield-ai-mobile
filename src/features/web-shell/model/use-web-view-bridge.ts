import type { BridgeCommandFromWebHandler } from "@/shared/types";
import { useCallback, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import {
  type WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import type { BridgeEvent } from "./types";

const LOAD_END_FALLBACK_MS = 3_000;

const BRIDGE_SYSTEM_TYPES = new Set([
  "route_change",
  "link_click",
  "button_click",
  "bridge_ready",
  "native_command_received",
  "web_log",
]);

/**
 * Transport layer for WebView communication: parses incoming messages,
 * validates source/nonce, handles system events (bridge_ready, web_log),
 * and delegates business commands to onCommandFromWeb callback.
 */
export function useWebViewBridge(baseUrl: string) {
  const webViewRef = useRef<WebView>(null);
  const sessionNonce = useRef<string>(
    Math.random().toString(36).slice(2) + Date.now().toString(36),
  );
  const [isWebReady, setIsWebReady] = useState(false);
  const nativeReadySent = useRef(false);

  const sendCommandToWeb = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      if (__DEV__ && type !== "installed_wallets") {
        console.log("[Mobile → Web]", type, payload);
      }
      const safeJson = JSON.stringify(JSON.stringify({ type, payload }));
      webViewRef.current?.injectJavaScript(
        `window.YieldAIBridge?.handleNativeCommand(JSON.parse(${safeJson})); true;`,
      );
    },
    [],
  );

  const sendNativeReady = useCallback(() => {
    sendCommandToWeb("native_ready", {
      platform: Platform.OS,
      nonce: sessionNonce.current,
    });
  }, [sendCommandToWeb]);

  const handleRawMessageFromWeb = useCallback(
    (
      event: WebViewMessageEvent,
      onCommandFromWeb?: BridgeCommandFromWebHandler,
    ) => {
      try {
        const rawMessage = JSON.parse(event.nativeEvent.data) as BridgeEvent;

        if (rawMessage.source !== "yield-ai-web") return;

        if (
          rawMessage.type !== "bridge_ready" &&
          rawMessage.nonce !== sessionNonce.current
        ) {
          if (__DEV__)
            console.warn(
              "[Bridge] Invalid nonce, message dropped:",
              rawMessage.type,
            );
          return;
        }

        if (rawMessage.type === "bridge_ready") {
          setIsWebReady(true);
          // Re-send nonce when web explicitly reports bridge readiness.
          // This closes race where initial native_ready could be sent before
          // window.YieldAIBridge is initialized in the web app.
          sendNativeReady();
          return;
        }

        if (rawMessage.type === "web_log") {
          if (rawMessage.payload?.message === "[Bridge ←RN] installed_wallets") {
            return;
          }
          console.log(
            "[Web]",
            rawMessage.payload?.message,
            rawMessage.payload?.payload ?? "",
          );
          return;
        }

        if (!BRIDGE_SYSTEM_TYPES.has(rawMessage.type)) {
          if (__DEV__)
            console.log("[Mobile ← Web]", rawMessage.type, rawMessage.payload);
          onCommandFromWeb?.(rawMessage.type, rawMessage.payload);
        }
      } catch (e) {
        if (__DEV__) console.warn("[Bridge] Malformed message:", e);
      }
    },
    [sendNativeReady],
  );

  // Intercept navigation: allow our domain, open external links in system browser
  const handleShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation) => {
      const { url } = request;
      if (url.startsWith(baseUrl)) return true;
      if (url.startsWith("http://") || url.startsWith("https://")) {
        Linking.openURL(url);
        return false;
      }
      return true;
    },
    [baseUrl],
  );

  const handleLoadEnd = useCallback(() => {
    if (nativeReadySent.current) return;
    nativeReadySent.current = true;
    sendNativeReady();
    setTimeout(() => setIsWebReady(true), LOAD_END_FALLBACK_MS);
  }, [sendNativeReady]);

  return {
    webViewRef,
    sendCommandToWeb,
    handleRawMessageFromWeb,
    handleLoadEnd,
    handleShouldStartLoadWithRequest,
    isWebReady,
  };
}
