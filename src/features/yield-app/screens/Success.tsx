import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Linking, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { dayMonthYear, money, pct } from "../lib/format";
import { useApp, type AccountEvent } from "../lib/store";
import { STRATEGIES, strategyGain } from "../lib/strategies";
import { PrimaryButton } from "../ui/Button";
import { Screen } from "../ui/Screen";
import { StrategyIcon } from "../ui/StrategyCard";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { toast } from "../ui/Toast";
import { IconCheck } from "../ui/icons";
import { C } from "../ui/theme";
import { useIsMock } from "../wallet";
import { DEVNET, LIVE, MAINNET, NET, explorerTx } from "../chain/config";
import { FIXED_UNTIL, useStrategy } from "../chain/state";

/** Pops in like the web version: ring springs from .6, check follows 150ms later. */
export function PopCheck({ ring, core, children }: { ring: string; core: string; children: React.ReactNode }) {
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  useEffect(() => {
    a.value = withSpring(1, { damping: 14, stiffness: 260 });
    b.value = withDelay(150, withSpring(1, { damping: 12, stiffness: 320 }));
  }, [a, b]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, a.value), transform: [{ scale: 0.6 + 0.4 * a.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: b.value }] }));
  return (
    <Animated.View style={[{ width: 96, height: 96, borderRadius: 48, backgroundColor: ring, alignItems: "center", justifyContent: "center" }, ringStyle]}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: core, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={checkStyle}>{children}</Animated.View>
      </View>
    </Animated.View>
  );
}

export function SuccessScreen() {
  const router = useRouter();
  const { d } = useLocalSearchParams<{ d: string }>();
  const isMock = useIsMock();
  const dep = useApp((s) => s.events.find((e): e is AccountEvent => e.id === d && e.src === "account"));
  const live = useStrategy(dep?.strategy ?? "flexible");
  if (!dep) return <Redirect href="/home" />;

  const s = STRATEGIES[dep.strategy];
  const gain = strategyGain(dep.strategy, dep.amount);
  const whole = (n: number) => money(Math.round(n), { cents: false });

  return (
    <Screen top={56} bottom={32}>
      <View style={{ marginTop: 72, alignItems: "center", gap: 24 }}>
        <PopCheck ring={C.gainSoft} core={C.gain}>
          <IconCheck size={34} sw={2.6} color={C.white} />
        </PopCheck>
        <View style={{ gap: 10 }}>
          <T size={32} w={700} lh={1.12} tracking={-0.03} center accessibilityRole="header">
            {"Congrats on your\nfirst deposit!"}
          </T>
          <T size={16} lh={1.5} color={C.ink2} center>
            {DEVNET
              ? `Your test USDC is in your Safe on ${NET.label}.`
              : MAINNET
                ? dep.strategy === "fixed"
                  ? `Your USDC is in a fixed-rate position until ${FIXED_UNTIL}.`
                  : "Your USDC is earning in Kamino through your own Safe."
                : "Your USDC is already earning. The agent takes it from here."}
          </T>
        </View>
      </View>

      <View style={{ marginTop: 40, gap: 16, borderRadius: 24, backgroundColor: C.surface, padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <StrategyIcon id={dep.strategy} />
          <View style={{ flex: 1, gap: 2 }}>
            <T size={16} w={700}>
              {s.name}
            </T>
            <T size={13} color={C.ink3}>
              {dep.strategy === "fixed" && dep.unlockAt ? `Unlocks ${dayMonthYear(dep.unlockAt)}` : s.sub}
            </T>
          </View>
          <T size={16} w={700} color={dep.strategy === "fixed" ? C.navy : C.gain}>
            {DEVNET ? "Idle" : MAINNET && dep.strategy === "fixed" ? "Fixed" : `${pct(live.apr)} ${MAINNET ? "APY" : "APR"}`}
          </T>
        </View>
        <View style={{ height: 1, backgroundColor: C.line }} />
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <T size={14} color={C.ink2}>
            You deposited
          </T>
          <T size={28} w={700} tracking={-0.03} tnum>
            {money(dep.amount)}
          </T>
        </View>
        {!LIVE && <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <T size={14} color={C.ink2}>
            Est. earnings
          </T>
          <T size={15} w={600} tnum color={C.gain} style={{ flexShrink: 1, textAlign: "right" }}>
            {dep.strategy === "fixed" ? `+${whole(gain)} in 100 days` : `+${whole(gain)} a year · +${whole(gain / 12)}/mo`}
          </T>
        </View>}
        <Tap
          accessibilityRole="link"
          feedback="none"
          onPress={() => (LIVE && dep.txIds.at(-1) ? Linking.openURL(explorerTx(dep.txIds.at(-1)!)) : isMock ? toast("Mock transaction — nothing was sent on-chain") : toast("Signed as a test message — no transaction on-chain yet"))}
          style={{ alignSelf: "flex-start" }}
        >
          <T size={14} w={600} color={C.blue}>
            View transaction
          </T>
        </Tap>
      </View>

      <View style={{ marginTop: "auto", paddingTop: 24 }}>
        <PrimaryButton onPress={() => router.replace("/home")}>Explore other products</PrimaryButton>
      </View>
    </Screen>
  );
}

