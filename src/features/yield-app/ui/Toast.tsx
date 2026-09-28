import { View } from "react-native";
import Animated, { FadeOutDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { T } from "./Text";
import { C, shadow } from "./theme";

type Toast = { id: number; text: string } | null;
const useToast = create<{ toast: Toast }>(() => ({ toast: null }));
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string) {
  clearTimeout(timer);
  useToast.setState({ toast: { id: Date.now(), text } });
  timer = setTimeout(() => useToast.setState({ toast: null }), 2800);
}

/** Pill toast above the bottom buttons. Mounted once in the root layout. */
export function Toaster() {
  const t = useToast((s) => s.toast);
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(28, insets.bottom + 16) + 76, alignItems: "center", paddingHorizontal: 24, zIndex: 70, elevation: 70 }}
    >
      {t && (
        <Animated.View
          key={t.id}
          entering={ZoomIn.springify().damping(28).stiffness(400).withInitialValues({ transform: [{ scale: 0.96 }, { translateY: 12 }], opacity: 0 })}
          exiting={FadeOutDown.duration(180)}
          style={[{ maxWidth: 420, borderRadius: 999, backgroundColor: C.ink, paddingHorizontal: 20, paddingVertical: 12 }, shadow.tip]}
        >
          <T size={14} w={500} color={C.white} center>
            {t.text}
          </T>
        </Animated.View>
      )}
    </View>
  );
}
