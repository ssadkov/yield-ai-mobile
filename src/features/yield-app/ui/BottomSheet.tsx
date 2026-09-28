import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  LinearTransition,
  interpolate,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tap } from "./Tap";
import { T } from "./Text";
import { IconClose } from "./icons";
import { C } from "./theme";

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Gap between blocks (design: 20 or 24). */
  gap?: number;
  /** false while a transaction is in flight. */
  dismissible?: boolean;
  children: ReactNode;
};

const SPRING = { damping: 34, stiffness: 380, mass: 0.9 };

/**
 * Bottom sheet as tall as its content. Slides up with a spring over a fading scrim,
 * closes on swipe down, scrim tap and the Android back button, rides above the keyboard.
 * Render it inside <Screen overlay>.
 */
export function BottomSheet(props: Props) {
  const [mounted, setMounted] = useState(props.open);
  useEffect(() => {
    if (props.open) setMounted(true);
  }, [props.open]);
  if (!mounted) return null;
  return <SheetBody {...props} onHidden={() => setMounted(false)} />;
}

function SheetBody({ open, onClose, label, gap = 24, dismissible = true, children, onHidden }: Props & { onHidden: () => void }) {
  const { height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const kb = useAnimatedKeyboard();
  const y = useSharedValue(H);
  const panelH = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const [viewportH, setViewportH] = useState(0);

  // Open once the panel has a size; close from wherever it is (also mid-drag).
  useEffect(() => {
    if (!measured) return;
    if (open) y.value = reduced ? withTiming(0, { duration: 120 }) : withSpring(0, SPRING);
    else
      y.value = withTiming(panelH.value || H, { duration: reduced ? 120 : 220 }, (done) => {
        if (done) runOnJS(onHidden)();
      });
  }, [open, measured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back closes the sheet (or is swallowed while it can't be dismissed).
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dismissible) onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, dismissible, onClose]);

  const drag = (enabled: boolean) =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY([-8, 8])
      .failOffsetX([-20, 20])
      .onUpdate((e) => {
        const t = e.translationY;
        y.value = t > 0 ? (dismissible ? t : t * 0.08) : t * 0.04;
      })
      .onEnd((e) => {
        if (dismissible && (e.translationY > 110 || e.velocityY > 700)) runOnJS(onClose)();
        else y.value = withSpring(0, SPRING);
      });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - kb.height.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, Math.max(1, panelH.value)], [1, 0], Extrapolation.CLAMP),
  }));

  const maxH = H - insets.top - 12;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, elevation: 40 }}>
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim }, scrimStyle]}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={() => dismissible && onClose()} />
      </Animated.View>
      <GestureDetector gesture={drag(!scrollable)}>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          layout={reduced ? undefined : LinearTransition.duration(260)}
          onLayout={(e) => {
            panelH.value = e.nativeEvent.layout.height;
            if (!measured) {
              y.value = e.nativeEvent.layout.height;
              setMeasured(true);
            }
          }}
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: maxH,
              backgroundColor: C.white,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 24,
              paddingBottom: Math.max(28, insets.bottom + 16),
              opacity: measured ? 1 : 0,
            },
            panelStyle,
          ]}
        >
          <GestureDetector gesture={drag(scrollable)}>
            <View style={{ alignItems: "center", paddingTop: 10, marginHorizontal: -24 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.handle }} />
            </View>
          </GestureDetector>
          <ScrollView
            bounces={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={scrollable}
            onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
            onContentSizeChange={(_, h) => setScrollable(viewportH > 0 && h > viewportH + 2)}
            contentContainerStyle={{ gap, paddingTop: gap }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function SheetHeader({ title, subtitle, onClose, size = 28, closeDisabled }: { title: string; subtitle?: string; onClose: () => void; size?: 26 | 28; closeDisabled?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ gap: 2, flex: 1 }}>
        <T size={size} w={700} tracking={-0.025} accessibilityRole="header">
          {title}
        </T>
        {subtitle ? (
          <T size={14} color={C.ink3}>
            {subtitle}
          </T>
        ) : null}
      </View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Close"
        disabled={closeDisabled}
        feedback="none"
        scale={0.9}
        onPress={onClose}
        style={{ marginRight: -10, width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: closeDisabled ? 0.3 : 1 }}
      >
        <IconClose color={C.ink2} />
      </Tap>
    </View>
  );
}
