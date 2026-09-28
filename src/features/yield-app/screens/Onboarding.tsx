import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Ellipse } from "react-native-svg";
import { pct } from "../lib/format";
import { computePortfolio } from "../lib/portfolio";
import { useApp } from "../lib/store";
import { STRATEGIES } from "../lib/strategies";
import { ConnectSheet, TERMS_URL } from "../sheets/ConnectSheet";
import { PrimaryButton } from "../ui/Button";
import { CHAINS, LOGO, tokenSrc } from "../ui/images";
import { Screen } from "../ui/Screen";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { haptic } from "../ui/haptics";
import { IconArrowRight, IconBack, IconDown, IconLock, IconSideButton, IconTrend, IconUnlock, IconUp } from "../ui/icons";
import { BLUE_BAR, C, SOFT_BAR, shadow } from "../ui/theme";

const SLIDES = [
  { title: "Best DeFi yield.\nOne button.", body: "Deposit from any chain, withdraw to any chain. An AI agent finds the best yield for you, around the clock." },
  { title: "Invest in a variety\nof strategies.", body: "Earn a variable rate and withdraw any time, or lock for 100 days at a fixed rate." },
  { title: "One button in.\nOne button out.", body: "Deposit USDC and the agent does the rest. Withdraw whenever you want." },
];

const EASE = Easing.bezier(0.3, 0.7, 0.2, 1);

/** Slide in from the swipe direction, fade the old one out the other way. */
function slideIn(dx: number, duration: number) {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dx }] },
      animations: { opacity: withTiming(1, { duration, easing: EASE }), transform: [{ translateX: withTiming(0, { duration, easing: EASE }) }] },
    };
  };
}
function slideOut(dx: number, duration: number) {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: { opacity: withTiming(0, { duration: duration * 0.7, easing: EASE }), transform: [{ translateX: withTiming(-dx, { duration, easing: EASE }) }] },
    };
  };
}

export function OnboardingScreen() {
  const router = useRouter();
  const [[step, dir], setStep] = useState<[number, number]>([0, 0]);
  const [connectOpen, setConnectOpen] = useState(false);

  const go = (i: number) => {
    const next = Math.max(0, Math.min(2, i));
    if (next !== step) {
      haptic.select();
      setStep([next, next > step ? 1 : -1]);
    }
  };
  const onSwipe = (dx: number, vx: number) => {
    if (dx < -60 || vx < -500) go(step + 1);
    else if (dx > 60 || vx > 500) go(step - 1);
  };
  const swipe = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-20, 20])
    .onEnd((e) => runOnJS(onSwipe)(e.translationX, e.velocityX));

  const skip = () => {
    useApp.getState().setOnboarded();
    router.replace("/home");
  };

  const s = SLIDES[step];
  const isLast = step === 2;

  return (
    <Screen
      top={52}
      bottom={32}
      scroll={false}
      overlay={
        <ConnectSheet
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onConnected={() => {
            setConnectOpen(false);
            const hasPositions = computePortfolio(useApp.getState().events).hasPositions;
            router.replace(hasPositions ? "/home" : "/strategy");
          }}
        />
      }
    >
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Animated.View layout={LinearTransition.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {step > 0 && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ marginLeft: -12, marginRight: -4 }}>
              <Tap accessibilityRole="button" accessibilityLabel="Back" feedback="none" scale={0.9} onPress={() => go(step - 1)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconBack />
              </Tap>
            </Animated.View>
          )}
          <Animated.View layout={LinearTransition.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Image source={LOGO} style={{ width: 32, height: 32 }} contentFit="contain" />
            <T size={18} w={700} tracking={-0.02}>
              Yield AI
            </T>
          </Animated.View>
        </Animated.View>
        {!isLast && (
          <Tap accessibilityRole="button" feedback="none" onPress={skip} style={{ height: 44, justifyContent: "center", paddingHorizontal: 4 }}>
            <T size={15} w={500} color={C.ink3}>
              Skip
            </T>
          </Tap>
        )}
      </View>

      <GestureDetector gesture={swipe}>
        <View style={{ flex: 1 }} collapsable={false}>
          <View style={{ flexGrow: 1, minHeight: 340, alignItems: "center", justifyContent: "center", zIndex: 2 }}>
            <Animated.View key={step} entering={slideIn(dir * 48, 220)} exiting={slideOut(dir * 48, 220)} style={{ width: "100%", alignItems: "center" }}>
              {step === 0 && <SlideEarning />}
              {step === 1 && <SlideOrbit />}
              {step === 2 && <SlideButtons />}
            </Animated.View>
          </View>

          <View style={{ height: 36 }} />

          <Animated.View key={`t${step}`} entering={slideIn(dir * 24, 200)} exiting={slideOut(dir * 24, 200)}>
            <T size={36} w={700} lh={1.1} tracking={-0.035} accessibilityRole="header">
              {s.title}
            </T>
            <T size={17} lh={1.5} color={C.ink2} style={{ marginTop: 12, marginBottom: 28 }}>
              {s.body}
            </T>
          </Animated.View>
        </View>
      </GestureDetector>

      {!isLast ? (
        <PrimaryButton onPress={() => go(step + 1)}>Continue</PrimaryButton>
      ) : (
        <View style={{ gap: 8 }}>
          <PrimaryButton onPress={() => setConnectOpen(true)}>Connect wallet</PrimaryButton>
          <T size={12} lh={1.5} color={C.ink4} center>
            Yield is variable, not a guarantee. DeFi protocol risk applies.{" "}
            <T size={12} color={C.blue} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
              Risks
            </T>
          </T>
        </View>
      )}
    </Screen>
  );
}

/** Scales a fixed-size illustration down on phones narrower than the 412px design. */
function useFit(w: number, side = 48) {
  const { width } = useWindowDimensions();
  return Math.min(1, (width - side) / w);
}

function FitBox({ w, h, side, children }: { w: number; h: number; side?: number; children: React.ReactNode }) {
  const s = useFit(w, side);
  return (
    <View style={{ width: w * s, height: h * s }}>
      <View style={{ width: w, height: h, transform: [{ translateX: (-w * (1 - s)) / 2 }, { translateY: (-h * (1 - s)) / 2 }, { scale: s }] }}>{children}</View>
    </View>
  );
}

/* ——— Slide 1: "Earning every day" ——— */

let barsPlayed = false;

const BARS: { h: number; hi?: boolean; icon?: "wd" | "dep" | "depSoft" }[] = [
  { h: 96 },
  { h: 70, icon: "wd" },
  { h: 138, hi: true, icon: "dep" },
  { h: 100, icon: "depSoft" },
  { h: 122, icon: "depSoft" },
  { h: 150 },
  { h: 178 },
];

function SlideEarning() {
  const reduced = useReducedMotion();
  const [animate] = useState(() => !barsPlayed && !reduced);
  const tip = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    barsPlayed = true;
    if (animate) tip.value = withDelay(1300, withTiming(1, { duration: 450, easing: Easing.out(Easing.ease) }));
  }, [animate, tip]);
  const tipStyle = useAnimatedStyle(() => ({ opacity: tip.value, transform: [{ translateY: (1 - tip.value) * 8 }] }));

  return (
    <FitBox w={336} h={388}>
      <View style={{ alignItems: "center", gap: 36 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <IconTrend size={16} color={C.mute} />
            <T size={15} w={500} color={C.ink3}>
              Earning every day
            </T>
          </View>
          <View style={{ width: 336, height: 262 }}>
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 34, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              {BARS.map((b, i) => (
                <GrowBar key={i} i={i} b={b} animate={animate} />
              ))}
            </View>
            <View style={{ position: "absolute", bottom: 4, left: 79, width: 80 }}>
              <T size={13} w={600} color={C.blue} center>
                Sep 21
              </T>
            </View>
            <Animated.View style={[{ position: "absolute", left: 44, top: 18, width: 150, gap: 6, borderRadius: 16, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 10 }, shadow.tip, tipStyle]}>
              <TipRow bg={C.gain2} sym="$" label="Added" value="$1,000" />
              <TipRow bg={C.blue} sym="+" label="Earned" value="$0.17" />
            </Animated.View>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ChainStack ids={["solana", "ethereum", "base"]} label="Any chain in" />
          <View style={{ marginBottom: 22 }}>
            <IconArrowRight size={22} color={C.mute} />
          </View>
          <View style={{ alignItems: "center", gap: 8 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.raised, alignItems: "center", justifyContent: "center" }}>
              <Image source={LOGO} style={{ width: 36, height: 36 }} contentFit="contain" accessibilityLabel="Yield AI" />
            </View>
            <T size={12} w={600} color={C.blue}>
              AI agent
            </T>
          </View>
          <View style={{ marginBottom: 22 }}>
            <IconArrowRight size={22} color={C.mute} />
          </View>
          <ChainStack ids={["arbitrum", "aptos", "solana"]} label="Any chain out" />
        </View>
      </View>
    </FitBox>
  );
}

function TipRow({ bg, sym, label, value }: { bg: string; sym: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <T size={sym === "+" ? 11 : 10} w={800} color={C.white}>
          {sym}
        </T>
      </View>
      <T size={13} w={600}>
        {label}
      </T>
      <T size={13} color={C.ink4}>
        {value}
      </T>
    </View>
  );
}

/** ybGrow: scaleY .06 → 1, opacity .4 → 1, 1.1s, 80ms stagger. Plays once per app run. */
function GrowBar({ i, b, animate }: { i: number; b: (typeof BARS)[number]; animate: boolean }) {
  const g = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) g.value = withDelay(i * 80, withTiming(1, { duration: 1100, easing: EASE }));
  }, [animate, g, i]);
  const a = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * g.value, transform: [{ scaleY: 0.06 + 0.94 * g.value }] }));
  const badgeBg = b.icon === "wd" ? C.mute2 : b.icon === "dep" ? C.gain2 : C.gainMute;
  return (
    <View style={{ width: 38, height: b.h }}>
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, transformOrigin: "bottom" }, a]}>
        <LinearGradient colors={b.hi ? BLUE_BAR : SOFT_BAR} style={{ flex: 1, borderRadius: 13 }} />
      </Animated.View>
      {b.icon && (
        <View style={{ position: "absolute", bottom: -15, left: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: badgeBg, alignItems: "center", justifyContent: "center" }}>
            {b.icon === "wd" ? (
              <IconUp size={12} sw={3} color={C.white} />
            ) : (
              <T size={12} w={800} color={C.white}>
                $
              </T>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function ChainStack({ ids, label }: { ids: string[]; label: string }) {
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <View style={{ flexDirection: "row" }}>
        {ids.map((id, i) => (
          <View key={id + i} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.white, padding: 3, marginLeft: i ? -18 : 0 }}>
            <Image source={CHAINS[id]} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
          </View>
        ))}
      </View>
      <T size={12} w={600} color={C.ink3}>
        {label}
      </T>
    </View>
  );
}

/* ——— Slide 2: strategies inside an orbit of coins ——— */

const COINS = ["usdc", "usd1", "sol", "usdt", "jupusd", "wbtc"];
const ORBIT = { cx: 196, cy: 150, rx: 190, ry: 116 };
const COIN = 30;

function SlideOrbit() {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!reduced) p.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
  }, [p, reduced]);
  const f = STRATEGIES.flexible;
  const x = STRATEGIES.fixed;
  return (
    <FitBox w={412} h={300} side={0}>
      <View style={{ marginLeft: 10, width: 392, height: 300 }}>
        <Svg width={392} height={300} viewBox="0 0 392 300" style={{ position: "absolute" }}>
          <Ellipse cx={196} cy={150} rx={190} ry={116} stroke={C.orbit} strokeWidth={1.5} strokeDasharray="4 6" fill="none" />
        </Svg>
        {COINS.map((c, i) => (
          <OrbitCoin key={`b${c}`} id={c} phase={i / 6} p={p} layer="back" reduced={reduced} />
        ))}
        <View style={{ position: "absolute", left: 46, top: 77, width: 300, gap: 10 }}>
          <OrbitCard
            border={2}
            borderColor={C.blue}
            icon={<IconUnlock color={C.gain} />}
            iconBg={C.gainSoft}
            name={f.name}
            sub="Withdraw any time"
            apr={pct(f.apr)}
            aprColor={C.gain}
            aprLabel="APR"
          />
          <OrbitCard
            border={1}
            borderColor={C.line2}
            icon={<IconLock color={C.navy} />}
            iconBg={C.raised}
            name={x.name}
            sub="Rate locked at deposit"
            apr={pct(x.apr)}
            aprColor={C.navy}
            aprLabel="FIXED APR"
          />
        </View>
        {COINS.map((c, i) => (
          <OrbitCoin key={`f${c}`} id={c} phase={i / 6} p={p} layer="front" reduced={reduced} />
        ))}
      </View>
    </FitBox>
  );
}

function OrbitCard(props: { border: number; borderColor: string; icon: React.ReactNode; iconBg: string; name: string; sub: string; apr: string; aprColor: string; aprLabel: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: props.border, borderColor: props.borderColor, backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: props.iconBg, alignItems: "center", justifyContent: "center" }}>{props.icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T size={16} w={700} numberOfLines={1}>
          {props.name}
        </T>
        <T size={12} color={C.ink3} numberOfLines={1}>
          {props.sub}
        </T>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <T size={22} w={700} color={props.aprColor}>
          {props.apr}
        </T>
        <T size={10} w={600} tracking={0.06} color={C.ink3}>
          {props.aprLabel}
        </T>
      </View>
    </View>
  );
}

/**
 * orbMove + orbDepth: one lap in 9s, starting on the left and going over the top.
 * Top half: smaller, faded, behind the cards. Bottom half: bigger, in front.
 * Each coin is drawn twice (behind / in front of the cards) and only one copy is visible.
 */
function OrbitCoin({ id, phase, p, layer, reduced }: { id: string; phase: number; p: SharedValue<number>; layer: "back" | "front"; reduced: boolean }) {
  const still = phase + 0.04;
  const a = useAnimatedStyle(() => {
    const t = ((reduced ? still : p.value + phase) % 1 + 1) % 1;
    const ang = Math.PI + 2 * Math.PI * t;
    const x = ORBIT.cx + ORBIT.rx * Math.cos(ang);
    const y = ORBIT.cy + ORBIT.ry * Math.sin(ang);
    const scale = interpolate(t, [0, 0.25, 0.5, 0.75, 1], [1, 0.72, 1, 1.18, 1]);
    const opacity = interpolate(t, [0, 0.25, 0.5, 1], [1, 0.55, 1, 1]);
    const mine = layer === "back" ? t < 0.5 : t >= 0.5;
    return { opacity: mine ? opacity : 0, transform: [{ translateX: x - COIN / 2 - 3 }, { translateY: y - COIN / 2 - 3 }, { scale }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: COIN + 6, height: COIN + 6, borderRadius: (COIN + 6) / 2, backgroundColor: C.white, padding: 3 }, shadow.coin, a]}>
      <Image source={tokenSrc(id)} style={{ width: COIN, height: COIN, borderRadius: COIN / 2 }} contentFit="cover" />
    </Animated.View>
  );
}

/* ——— Slide 3: one button in, one button out ——— */

function SlideButtons() {
  return (
    <View style={{ width: 270, gap: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[{ height: 64, borderRadius: 20, backgroundColor: C.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, shadow.cta]}>
        <IconDown size={22} sw={2.2} color={C.white} />
        <T size={19} w={600} color={C.white}>
          Deposit
        </T>
      </View>
      <View style={{ height: 64, borderRadius: 20, backgroundColor: C.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <IconUp size={22} sw={2.2} color={C.white} />
        <T size={19} w={600} color={C.white}>
          Withdraw
        </T>
      </View>
      <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <IconSideButton w={14} h={22} />
        <T size={13} color={C.ink2}>
          Double-tap the side button to sign
        </T>
      </View>
    </View>
  );
}
