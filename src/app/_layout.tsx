import "react-native-get-random-values";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MockWalletPrompt, PrivyRoot, Toaster, WalletRuntime, colors as C, useHydrated } from "@/features/yield-app";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const hydrated = useHydrated();
  const ready = (fontsLoaded || !!fontError) && hydrated;

  // Keep the native splash until the first screen can render with real fonts and state.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.white }}>
      <SafeAreaProvider>
        <PrivyRoot>
          <StatusBar style="dark" />
          <WalletRuntime />
          {ready ? (
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: C.white } }}>
                <Stack.Screen name="index" options={{ animation: "fade" }} />
                <Stack.Screen name="home" options={{ animation: "fade" }} />
                <Stack.Screen name="success" options={{ animation: "fade_from_bottom" }} />
                <Stack.Screen name="withdraw/[id]" options={{ animation: "fade_from_bottom" }} />
                <Stack.Screen name="wallet-callback" options={{ presentation: "transparentModal", animation: "none" }} />
              </Stack>
              <Toaster />
              <MockWalletPrompt />
            </View>
          ) : null}
        </PrivyRoot>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
