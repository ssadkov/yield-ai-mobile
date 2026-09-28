import { useSolanaDevice } from "@/features/solana-device";
import {
  WalletPickerSheet,
  useWalletPickerSheet,
} from "@/features/wallet-picker-sheet";
import { useWalletDiscovery } from "@/features/wallet-discovery";
import { useWalletGateway } from "@/features/wallet-gateway";
import { useThemeColor } from "@/shared/hooks";
import * as ExpoSplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { DISABLE_TEXT_SELECTION_SCRIPT } from "../lib/disable-text-selection-script";
import { resolveWebViewUrl } from "../lib/webview-url";
import { useWebViewBridge } from "../model/use-web-view-bridge";

const MAIN_WEBVIEW_URL = resolveWebViewUrl();

if (__DEV__) {
  console.log(`[WebView] Using dev URL: ${MAIN_WEBVIEW_URL}`);
}

export default function WebShellScreen() {
  const {
    wallets,
    isLoading: isWalletDiscoveryLoading,
    rescan: rescanWallets,
  } = useWalletDiscovery();
  const { isSolanaPhone, isLoading: isDeviceCheckLoading } = useSolanaDevice();

  const {
    webViewRef,
    sendCommandToWeb,
    handleRawMessageFromWeb,
    handleLoadEnd,
    handleShouldStartLoadWithRequest,
    isWebReady,
  } = useWebViewBridge(MAIN_WEBVIEW_URL);

  const { handleWalletCommandFromWeb } = useWalletGateway(
    sendCommandToWeb,
    wallets,
    isWebReady && !isWalletDiscoveryLoading && !isDeviceCheckLoading,
    undefined,
    isSolanaPhone,
  );

  const {
    isPickerSheetVisible,
    closePickerSheet,
    handleWalletPress,
    handlePickerSheetDidHide,
    handleCommandFromWebWithPickerSheet,
  } = useWalletPickerSheet({
    onCommandFromWeb: handleWalletCommandFromWeb,
  });

  const backgroundColor = useThemeColor("background");
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isWebReady || isDeviceCheckLoading) return;
    sendCommandToWeb("device_info", { isSolanaPhone });
  }, [isWebReady, isDeviceCheckLoading, isSolanaPhone, sendCommandToWeb]);

  useEffect(() => {
    if (!isWebReady) return;
    ExpoSplashScreen.hideAsync().catch(() => {});
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShowSplash(false);
    });
  }, [isWebReady, splashOpacity]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }} edges={["top"]}>
      <WebView
        ref={webViewRef}
        source={{ uri: MAIN_WEBVIEW_URL }}
        style={{ flex: 1 }}
        injectedJavaScriptBeforeContentLoaded={DISABLE_TEXT_SELECTION_SCRIPT}
        injectedJavaScript={DISABLE_TEXT_SELECTION_SCRIPT}
        onMessage={(event) =>
          handleRawMessageFromWeb(event, handleCommandFromWebWithPickerSheet)
        }
        onLoadEnd={handleLoadEnd}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
      />
      <WalletPickerSheet
        visible={isPickerSheetVisible}
        wallets={wallets}
        onClose={closePickerSheet}
        onDidHide={handlePickerSheetDidHide}
        onRescan={rescanWallets}
        onWalletPress={handleWalletPress}
        isSolanaPhone={isSolanaPhone}
      />
      {showSplash && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor,
              opacity: splashOpacity,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={require("@/assets/images/splash-icon.png")}
            style={styles.splashImage}
            resizeMode="contain"
            onLoad={() => ExpoSplashScreen.hideAsync()}
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splashImage: {
    width: 200,
  },
});
