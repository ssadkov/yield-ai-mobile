import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tap } from "./Tap";
import { T } from "./Text";
import { IconBack, IconSideButton } from "./icons";
import { C } from "./theme";

/**
 * Full-height phone screen. `top`/`bottom` are the design paddings, which include
 * ~28px of status bar; real insets replace that part. Scrolls only when content is taller.
 */
export function Screen({
  top = 48,
  bottom = 28,
  gap,
  scroll = true,
  children,
  overlay,
}: {
  top?: 48 | 52 | 56;
  bottom?: 28 | 32;
  gap?: number;
  scroll?: boolean;
  children: ReactNode;
  /** Sheets and menus rendered above the content */
  overlay?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const content: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: insets.top + top - 24,
    paddingBottom: Math.max(bottom, insets.bottom + 16),
    gap,
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {overlay}
    </View>
  );
}

export function BackButton({ href = "/home", onPress }: { href?: "/home" | "/activity" | "/"; onPress?: () => void }) {
  const router = useRouter();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Back"
      feedback="none"
      scale={0.9}
      onPress={() => {
        if (onPress) return onPress();
        if (router.canGoBack()) return router.back();
        router.replace(href);
      }}
      style={{ marginLeft: -12, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <IconBack />
    </Tap>
  );
}

export function TitleHeader({ title, back, right, sub, style }: { title: string; back?: ReactNode; right?: ReactNode; sub?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 4 }, style]}>
      {back}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={26} w={700} tracking={-0.03} accessibilityRole="header">
          {title}
        </T>
        {sub}
      </View>
      {right}
    </View>
  );
}

export function SideButtonHint({ text = "Double-tap the side button to sign" }: { text?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <IconSideButton />
      <T size={13} color={C.ink3}>
        {text}
      </T>
    </View>
  );
}

/** Loading placeholder with a soft pulse. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.55, { duration: 700 }), -1, true);
  }, [o, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ backgroundColor: C.neutral, borderRadius: 12 }, style, a]} />;
}
