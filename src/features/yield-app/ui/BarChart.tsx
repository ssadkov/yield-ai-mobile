import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import type { Bucket } from "../lib/portfolio";
import { moneyAuto } from "../lib/format";
import { haptic } from "./haptics";
import { T } from "./Text";
import { IconUp } from "./icons";
import { BLUE_BAR, C, SOFT_BAR, shadow } from "./theme";

const TOP = 30; // bars area offset
const AREA = 190; // bars area height
const TIP_W = 176;
// Empty state: a short strip (caption over stub bars) so the Home screen fits without scrolling.
const EMPTY_TOP = 44;
const EMPTY_AREA = 48;
const EASE = { duration: 200 };

function money2(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Default selection (as in the design): latest deposit, else latest withdrawal, else the last bucket. */
function defaultIndex(b: Bucket[]) {
  for (let i = b.length - 1; i >= 0; i--) if (b[i].added) return i;
  for (let i = b.length - 1; i >= 0; i--) if (b[i].withdrew) return i;
  return b.length - 1;
}

export function BarChart({ buckets, empty }: { buckets: Bucket[]; empty?: boolean }) {
  const [W, setW] = useState(364);
  const [sel, setSel] = useState(() => defaultIndex(buckets));
  const key = buckets.map((b) => `${b.day}:${b.added}:${b.withdrew}`).join(",");
  useEffect(() => setSel(defaultIndex(buckets)), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = buckets.length;
  const bw = n <= 7 ? 42 : Math.max(10, Math.min(42, Math.floor((W - (n - 1) * 6) / n)));
  const step = n > 1 ? (W - bw) / (n - 1) : 0;
  const hit = Math.max(bw, Math.min(step, 52));
  const max = useMemo(() => Math.max(...buckets.map((b) => b.earned), 0) / 0.95, [buckets]);
  const hOf = (e: number) => (max > 0 ? 40 + (e / max) * 140 : 40);

  const i = Math.min(sel, n - 1);
  const cur = buckets[i];
  const center = i * step + bw / 2;
  const tip: { sym: React.ReactNode; bg: string; label: string; value: string }[] = cur ? [{ sym: "+", bg: C.blue, label: "Earned", value: money2(cur.earned) }] : [];
  if (cur?.added) tip.push({ sym: "$", bg: C.gain2, label: "Added", value: moneyAuto(cur.added) });
  if (cur?.withdrew) tip.push({ sym: <IconUp size={11} sw={3} color={C.white} />, bg: C.ink3, label: "Withdrew", value: moneyAuto(cur.withdrew) });
  const tipH = 20 + tip.length * 26;
  const tipLeft = Math.max(0, Math.min(W - TIP_W, center - TIP_W / 2));
  // Sit above the tallest bar under the tooltip so it never covers a neighbour.
  const covered = buckets.filter((_, k) => {
    const c = k * step + bw / 2;
    return c + bw / 2 > tipLeft && c - bw / 2 < tipLeft + TIP_W;
  });
  const tallest = Math.max(hOf(cur?.earned ?? 0), ...covered.map((b) => hOf(b.earned)));
  const tipTop = Math.max(0, TOP + AREA - tallest - tipH - 10);
  const labelLeft = Math.max(45, Math.min(W - 45, center)) - 45;

  const tipStyle = useAnimatedStyle(() => ({ left: withTiming(tipLeft, EASE), top: withTiming(tipTop, EASE) }), [tipLeft, tipTop]);
  const labelStyle = useAnimatedStyle(() => ({ left: withTiming(labelLeft, EASE) }), [labelLeft]);

  return (
    <View accessibilityLabel="Daily earnings" style={{ height: empty ? EMPTY_TOP + EMPTY_AREA : 262 }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <View pointerEvents={empty ? "none" : "auto"} style={{ position: "absolute", left: 0, right: 0, top: empty ? EMPTY_TOP : TOP, height: empty ? EMPTY_AREA : AREA }}>
        {buckets.map((b, k) => (
          <Bar
            key={b.day + b.label}
            b={b}
            on={k === i}
            left={k * step + bw / 2 - hit / 2}
            hit={hit}
            bw={bw}
            h={hOf(b.earned)}
            onPress={() => {
              if (k !== i) haptic.select();
              setSel(k);
            }}
          />
        ))}
      </View>

      {cur && !empty && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 236, width: 90 }, labelStyle]}>
          <T size={14} w={600} color={C.blue} center numberOfLines={1} accessibilityLiveRegion="polite">
            {cur.label}
          </T>
        </Animated.View>
      )}

      {empty ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 8 }}>
          <T size={14} color={C.ink4} center>
            Your daily earnings will show up here
          </T>
        </View>
      ) : (
        cur && (
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", width: TIP_W, gap: 6, borderRadius: 16, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 10 }, shadow.tip, tipStyle]}
          >
            {tip.map((t) => (
              <View key={t.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
                  {typeof t.sym === "string" ? (
                    <T size={11} w={800} color={C.white}>
                      {t.sym}
                    </T>
                  ) : (
                    t.sym
                  )}
                </View>
                <T size={14} w={600}>
                  {t.label}
                </T>
                <T size={14} tnum color={C.ink4}>
                  {t.value}
                </T>
              </View>
            ))}
          </Animated.View>
        )
      )}
    </View>
  );
}

function Bar({ b, on, left, hit, bw, h, onPress }: { b: Bucket; on: boolean; left: number; hit: number; bw: number; h: number; onPress: () => void }) {
  const hStyle = useAnimatedStyle(() => ({ height: withTiming(h, EASE) }), [h]);
  const r = Math.min(14, bw / 3);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={b.aria}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ position: "absolute", top: 0, bottom: 0, left, width: hit, alignItems: "center", justifyContent: "flex-end" }}
    >
      <Animated.View style={[{ width: bw }, hStyle]}>
        <LinearGradient colors={on ? BLUE_BAR : SOFT_BAR} style={{ flex: 1, borderRadius: r }} />
        {b.added > 0 ? (
          <Badge bg={on ? C.gain2 : C.gainMute}>
            <T size={13} w={800} color={C.white}>
              $
            </T>
          </Badge>
        ) : b.withdrew > 0 ? (
          <Badge bg={on ? C.ink3 : C.mute2}>
            <IconUp size={14} sw={3} color={C.white} />
          </Badge>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** 26px event badge under a bar, with a 3px white ring. */
function Badge({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <View style={{ position: "absolute", bottom: -16, left: "50%", marginLeft: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}
