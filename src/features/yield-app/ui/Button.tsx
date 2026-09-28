import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Tap } from "./Tap";
import { T } from "./Text";
import { Spinner } from "./icons";
import { C } from "./theme";

type Variant = "blue" | "black" | "light";

const BG: Record<Variant, [string, string, string]> = {
  // rest, pressed, disabled
  blue: [C.blue, "#0856B0", C.blueDisabled],
  black: [C.ink, "#000000", "#8A9099"],
  light: [C.raised, "#E3EBF6", C.raised],
};

/** 60px main action, radius 18 (design). Children can be a string or icon + text. */
export function PrimaryButton({
  variant = "blue",
  loading,
  disabled,
  onPress,
  children,
  style,
  label,
}: {
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Accessibility label when children aren't plain text */
  label?: string;
}) {
  const [rest, pressed, off] = BG[variant];
  const fg = variant === "light" ? (disabled ? C.mute : C.ink) : C.white;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!loading }}
      disabled={disabled}
      onPress={onPress}
      scale={0.985}
      bg={disabled ? off : rest}
      pressedBg={pressed}
      style={[
        { height: 60, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" },
        style,
      ]}
    >
      {loading && <Spinner size={20} color={fg} />}
      {typeof children === "string" ? (
        <T size={17} w={600} color={fg}>
          {children}
        </T>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{children}</View>
      )}
    </Tap>
  );
}

export function buttonFg(variant: Variant, disabled?: boolean) {
  return variant === "light" ? (disabled ? C.mute : C.ink) : C.white;
}
