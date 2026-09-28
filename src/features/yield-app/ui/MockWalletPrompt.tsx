import { View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMockPrompt } from "../wallet/mock-driver";
import { WalletAvatar } from "./images";
import { Tap } from "./Tap";
import { T } from "./Text";
import { C } from "./theme";

/** Stand-in for the wallet's own approval UI (EXPO_PUBLIC_WALLET_MODE=mock only). */
export function MockWalletPrompt() {
  const prompt = useMockPrompt((s) => s.prompt);
  const insets = useSafeAreaInsets();
  if (!prompt) return null;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, elevation: 60, justifyContent: "flex-end" }}>
      <Animated.View entering={FadeIn} exiting={FadeOut} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(12,18,28,0.35)" }} />
      <Animated.View
        entering={SlideInDown.springify().damping(32).stiffness(420)}
        exiting={SlideOutDown}
        accessibilityRole="alert"
        style={{ margin: 12, marginBottom: Math.max(12, insets.bottom), gap: 16, borderRadius: 24, backgroundColor: "#16191F", padding: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <WalletAvatar id={prompt.walletId} size={36} />
            <View>
              <T size={15} w={600} color={C.white}>
                {prompt.walletName}
              </T>
              <T size={12} color={C.mute}>
                yieldai.app
              </T>
            </View>
          </View>
          <View style={{ borderRadius: 999, backgroundColor: "#F59E0B", paddingHorizontal: 8, paddingVertical: 3 }}>
            <T size={10} w={700} tracking={0.08} color="#16191F">
              MOCK WALLET
            </T>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <T size={20} w={700} tracking={-0.02} color={C.white}>
            {prompt.kind === "connect" ? "Connect to Yield AI?" : "Sign transaction"}
          </T>
          <T size={14} lh={1.5} color={C.handle}>
            {prompt.kind === "connect" ? "Yield AI will see your address and USDC balance. It can't move funds without your signature." : `${prompt.step.title} · ${prompt.step.detail}`}
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Tap accessibilityRole="button" onPress={prompt.reject} style={{ flex: 1, height: 52, borderRadius: 16, borderWidth: 1, borderColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
            <T size={16} w={600} color={C.white}>
              Reject
            </T>
          </Tap>
          <Tap accessibilityRole="button" onPress={prompt.resolve} style={{ flex: 1, height: 52, borderRadius: 16, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
            <T size={16} w={600}>
              {prompt.kind === "connect" ? "Connect" : "Sign"}
            </T>
          </Tap>
        </View>
      </Animated.View>
    </View>
  );
}
