import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { T } from "./Text";
import { IconCheck, IconClose } from "./icons";
import { C } from "./theme";

export type StepState = "done" | "active" | "pending" | "failed";
export type Step = { title: string; sub?: string; state: StepState };

/** Vertical status list (Withdrawal requested, multi-transaction signing). */
export function StatusSteps({ steps, gap = 14 }: { steps: Step[]; gap?: number }) {
  return (
    <View style={{ gap }} accessibilityRole="list">
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <StepDot state={s.state} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <T size={15} w={600} color={s.state === "pending" ? C.ink4 : C.ink}>
              {s.title}
            </T>
            {s.sub ? (
              <T size={12} color={s.state === "failed" ? C.danger : C.ink4}>
                {s.sub}
              </T>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const DOT = { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" } as const;

export function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <View style={[DOT, { backgroundColor: C.gain }]}>
        <IconCheck size={14} sw={3} color={C.white} />
      </View>
    );
  if (state === "failed")
    return (
      <View style={[DOT, { backgroundColor: C.danger }]}>
        <IconClose size={14} sw={3} color={C.white} />
      </View>
    );
  if (state === "active")
    return (
      <View style={[DOT, { borderWidth: 2, borderColor: C.blue }]}>
        <PulseDot />
      </View>
    );
  return <View style={[DOT, { borderWidth: 2, borderColor: C.line2 }]} />;
}

/** wdPulse: scale .7 → 1, opacity .5 → 1, 1.2s. */
function PulseDot() {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) v.value = withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true);
    else v.value = 1;
  }, [v, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: 0.5 + v.value * 0.5, transform: [{ scale: 0.7 + v.value * 0.3 }] }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue }, a]} />;
}
