import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { STRATEGIES, type StrategyId } from "../lib/strategies";
import { pct } from "../lib/format";
import { Tap } from "./Tap";
import { T } from "./Text";
import { IconLock, IconPlus, IconUnlock } from "./icons";
import { C } from "./theme";

export function StrategyIcon({ id, size = 44 }: { id: StrategyId; size?: 40 | 44 }) {
  const flex = id === "flexible";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: flex ? C.gainSoft : C.raised }}>
      {flex ? <IconUnlock color={C.gain} /> : <IconLock color={C.navy} />}
    </View>
  );
}

/** Big selectable card on "Choose a strategy". Selected = outer 3px ring (no layout shift). */
export function StrategyPickCard({ id, selected, onSelect, description }: { id: StrategyId; selected: boolean; onSelect: () => void; description: ReactNode }) {
  const s = STRATEGIES[id];
  const ring = useAnimatedStyle(() => ({ opacity: withTiming(selected ? 1 : 0, { duration: 200 }) }), [selected]);
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      feedback="select"
      scale={0.985}
      onPress={onSelect}
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: selected ? C.blue : C.line2,
        backgroundColor: selected ? C.select : C.white,
        padding: 18,
        gap: 12,
      }}
    >
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: -4, left: -4, right: -4, bottom: -4, borderRadius: 25, borderWidth: 3, borderColor: C.blue }, ring]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={17} w={700}>
            {s.name}
          </T>
          <T size={13} color={C.ink3}>
            {s.pickerSub}
          </T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <T size={26} w={700} tracking={-0.02} tnum color={id === "flexible" ? C.gain : C.navy}>
            {pct(s.apr)}
          </T>
          <T size={11} w={600} tracking={0.06} color={C.ink3}>
            {s.aprLabel}
          </T>
        </View>
      </View>
      <T size={14} lh={1.45} color={C.ink2}>
        {description}
      </T>
    </Tap>
  );
}

/** Product row on Home. */
export function ProductCard({ id, amount, apr, sub, rate }: { id: StrategyId; amount: string; apr: number; sub: string; rate?: string }) {
  const s = STRATEGIES[id];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 12 }}>
      <StrategyIcon id={id} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T size={15} w={600}>
          {s.name}
        </T>
        <T size={13} color={C.ink3} numberOfLines={1}>
          {sub}
        </T>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <T size={16} w={700} tnum>
          {amount}
        </T>
        <T size={13} w={600} color={id === "flexible" ? C.gain : C.navy}>
          {rate ?? `${pct(apr)} ${id === "fixed" ? "fixed" : "APR"}`}
        </T>
      </View>
    </View>
  );
}

/** Dashed "add a product" row on Home. */
export function AddProductCard({ id, onPress }: { id: StrategyId; onPress: () => void }) {
  const s = STRATEGIES[id];
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`Add ${s.name}`}
      onPress={onPress}
      scale={0.985}
      bg={C.white}
      pressedBg={C.surface}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: C.handle, paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <StrategyIcon id={id} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15} w={600}>
          Add {s.name}
        </T>
        {id === "fixed" ? (
          <T size={13} color={C.ink3}>
            Lock more USDC at{" "}
            <T size={13} w={600} color={C.navy}>
              {pct(s.apr)} fixed
            </T>
          </T>
        ) : (
          <T size={13} color={C.ink3}>
            Earn{" "}
            <T size={13} w={600} color={C.gain}>
              {pct(s.apr)} APR
            </T>
            , withdraw any time
          </T>
        )}
      </View>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" }}>
        <IconPlus size={18} sw={2.4} color={C.white} />
      </View>
    </Tap>
  );
}
