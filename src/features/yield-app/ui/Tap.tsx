import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic } from "./haptics";

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (1 = none) */
  scale?: number;
  /** Background while pressed (with `bg` as the resting background) */
  pressedBg?: string;
  bg?: string;
  feedback?: "tap" | "select" | "none";
  children?: ReactNode;
};

/** Pressable with native-feeling press feedback: quick scale-down, spring back, light haptic. */
export function Tap({ style, scale = 0.97, pressedBg, bg = "transparent", feedback = "tap", onPressIn, onPressOut, onPress, disabled, children, ...rest }: Props) {
  const s = useSharedValue(1);
  const p = useSharedValue(0);
  const a = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
    ...(pressedBg ? { backgroundColor: p.value ? pressedBg : bg } : null),
  }));
  return (
    <APressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        s.value = withTiming(scale, { duration: 90 });
        p.value = 1;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 15, stiffness: 400 });
        p.value = 0;
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback === "tap") haptic.tap();
        else if (feedback === "select") haptic.select();
        onPress?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </APressable>
  );
}
