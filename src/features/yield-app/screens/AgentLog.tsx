import { useLocalSearchParams } from "expo-router";
import { Fragment, useEffect, useMemo, useRef } from "react";
import { ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clock, dayLabel, relativeMinutes, startOfDay } from "../lib/format";
import { useNow, useLedger } from "../lib/hooks";
import type { AgentEvent } from "../lib/store";
import { BackButton, TitleHeader } from "../ui/Screen";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { toast } from "../ui/Toast";
import { C } from "../ui/theme";

/** Agent log (design/Activity.dc.html). TODO(backend): agent activity API. */
export function AgentLogScreen() {
  const insets = useSafeAreaInsets();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const events = useLedger();
  const now = useNow(30_000);
  const scroller = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});
  const listY = useRef(0);

  // Scroll to the row that was tapped in Activity (after the push transition settles).
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const y = rowY.current[focus];
      if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, listY.current + y - 240), animated: true });
    }, 350);
    return () => clearTimeout(t);
  }, [focus]);

  const agent = useMemo(() => events.filter((e): e is AgentEvent => e.src === "agent" && e.ts <= now + 120_000).sort((a, b) => b.ts - a.ts), [events, now]);
  const groups = useMemo(() => {
    const out: { day: number; label: string; rows: AgentEvent[] }[] = [];
    for (const e of agent) {
      const day = startOfDay(e.ts);
      const g = out[out.length - 1];
      if (g && g.day === day) g.rows.push(e);
      else out.push({ day, label: dayLabel(e.ts, now), rows: [e] });
    }
    return out;
  }, [agent, now]);

  const lastCheck = agent[0]?.ts;
  const active = agent.length > 0;

  return (
    <ScrollView
      ref={scroller}
      style={{ flex: 1, backgroundColor: C.white }}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: Math.max(28, insets.bottom + 16), gap: 20 }}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      bounces={false}
    >
      <TitleHeader title="Agent activity" back={<BackButton href="/activity" />} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 16 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: active ? C.gain : C.ink4 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15} w={500}>
            {active ? `Active · last check ${relativeMinutes(lastCheck!, now)}` : "Waiting for your first deposit"}
          </T>
          <T size={13} color={C.ink3}>
            Every action lands here with its reason.
          </T>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Rules title="CAN" color={C.gain} items={["Move USDC between approved protocols", "Re-loop and compound rewards", "Keep leverage near target"]} />
        <Rules title="CAN'T" color={C.warn} items={["Send funds out of your Safe", "Use unapproved protocols", "Go past your limits"]} />
      </View>

      <View style={{ gap: 4 }} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
        {groups.length === 0 ? (
          <T size={14} color={C.ink3} center style={{ paddingVertical: 24 }}>
            No agent actions yet.
          </T>
        ) : (
          groups.map((g, gi) => (
            <Fragment key={g.day}>
              <T size={13} color={C.ink3} style={{ paddingBottom: 6, paddingTop: gi ? 4 : 0 }}>
                {g.label}
              </T>
              {g.rows.map((e, i) => (
                <LogRow
                  key={e.id}
                  e={e}
                  last={gi === groups.length - 1 && i === g.rows.length - 1}
                  highlight={e.id === focus}
                  onLayoutY={(y) => (rowY.current[e.id] = y)}
                />
              ))}
            </Fragment>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Rules({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <View style={{ flex: 1, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14 }}>
      <T size={12} w={600} tracking={0.06} color={color}>
        {title}
      </T>
      {items.map((t) => (
        <T key={t} size={13} lh={1.4} color={C.ink2}>
          {t}
        </T>
      ))}
    </View>
  );
}

function LogRow({ e, last, highlight, onLayoutY }: { e: AgentEvent; last: boolean; highlight: boolean; onLayoutY: (y: number) => void }) {
  const hl = useSharedValue(highlight ? 1 : 0);
  useEffect(() => {
    if (highlight) hl.value = withDelay(350, withTiming(0, { duration: 1600 }));
  }, [highlight, hl]);
  const a = useAnimatedStyle(() => ({ backgroundColor: `rgba(234,242,253,${hl.value})` }));
  const dot = e.kind === "check" ? C.mute : e.txCount ? C.navy : C.blue;
  return (
    <Animated.View
      onLayout={(ev) => onLayoutY(ev.nativeEvent.layout.y)}
      style={[{ marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 12, flexDirection: "row", gap: 14 }, a]}
    >
      <View style={{ alignItems: "center", paddingTop: 5 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: dot }} />
        {!last && <View style={{ marginTop: 4, width: 1, flex: 1, backgroundColor: C.line2 }} />}
      </View>
      <View style={{ flex: 1, gap: 4, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <T size={15} w={500} style={{ flexShrink: 1 }}>
            {e.title}
          </T>
          <T size={12} tnum color={C.ink4}>
            {clock(e.ts)}
          </T>
        </View>
        <T size={13} lh={1.45} color={C.ink3}>
          {e.why}
        </T>
        {(e.delta || e.kind === "action") && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {e.delta ? (
              <T size={13} tnum>
                {e.delta}
              </T>
            ) : null}
            {e.kind === "action" && (
              <Tap accessibilityRole="button" feedback="none" onPress={() => toast("Mock transaction — nothing was sent on-chain")} style={{ height: 44, marginVertical: -12, justifyContent: "center" }}>
                <T size={13} color={C.blue}>
                  {e.txCount ? `${e.txCount} transactions` : "View tx"}
                </T>
              </Tap>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
