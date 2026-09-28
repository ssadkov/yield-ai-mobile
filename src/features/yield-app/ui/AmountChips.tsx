import { View } from "react-native";
import { Tap } from "./Tap";
import { T } from "./Text";
import { C } from "./theme";

export type Chip<V> = { value: V; label: string; disabled?: boolean };

/** Pill chips — selected is ink-filled (design: Deposit, Withdraw, calculator). */
export function AmountChips<V extends string | number>({
  chips,
  value,
  onChange,
  size = "md",
  label,
}: {
  chips: Chip<V>[];
  value: V | null;
  onChange: (v: V) => void;
  size?: "md" | "sm";
  label: string;
}) {
  const md = size === "md";
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", gap: md ? 8 : 6 }}>
      {chips.map((c) => {
        const on = c.value === value;
        return (
          <Tap
            key={String(c.value) + c.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!c.disabled }}
            disabled={c.disabled}
            feedback="select"
            onPress={() => onChange(c.value)}
            hitSlop={md ? undefined : { top: 4, bottom: 4 }}
            style={{
              flex: md ? 1 : undefined,
              height: md ? 44 : 36,
              paddingHorizontal: md ? 0 : 12,
              borderRadius: md ? 22 : 18,
              borderWidth: 1,
              borderColor: on ? C.ink : C.line2,
              backgroundColor: on ? C.ink : C.white,
              alignItems: "center",
              justifyContent: "center",
              opacity: c.disabled ? 0.4 : 1,
            }}
          >
            <T size={md ? 15 : 13} w={600} color={on ? C.white : C.ink}>
              {c.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}
