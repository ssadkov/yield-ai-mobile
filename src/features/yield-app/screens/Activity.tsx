import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dayLabel, startOfDay } from "../lib/format";
import { useApp, type LedgerEvent } from "../lib/store";
import { ActivityRow } from "../ui/ActivityRow";
import { PrimaryButton } from "../ui/Button";
import { FiltersButton, FiltersMenu } from "../ui/FiltersMenu";
import { BackButton, Screen, TitleHeader } from "../ui/Screen";
import { T } from "../ui/Text";
import { C } from "../ui/theme";

export function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const events = useApp((s) => s.events);
  const walletName = useApp((s) => s.wallet?.name ?? "wallet");
  const [show, setShow] = useState({ account: true, agent: true });
  const [menu, setMenu] = useState(false);

  const days = useMemo(() => {
    const now = Date.now();
    const rows = events.filter((e) => e.ts <= now + 120_000 && show[e.src]).sort((a, b) => b.ts - a.ts);
    const groups: { day: number; label: string; rows: LedgerEvent[] }[] = [];
    for (const e of rows) {
      const day = startOfDay(e.ts);
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.rows.push(e);
      else groups.push({ day, label: dayLabel(e.ts, now), rows: [e] });
    }
    return groups;
  }, [events, show]);

  const count = days.reduce((n, d) => n + d.rows.length, 0);
  const filtered = !(show.account && show.agent);
  const sub =
    !show.account && !show.agent ? "Nothing selected" : `${filtered ? (show.account ? "Account only" : "Agent only") : "All activity"} · ${count} item${count === 1 ? "" : "s"}`;

  return (
    <Screen
      top={48}
      bottom={28}
      gap={6}
      overlay={
        <FiltersMenu
          open={menu}
          setOpen={setMenu}
          top={insets.top + 24 + 52}
          onToggle={(id) => setShow((s) => ({ ...s, [id]: !s[id as keyof typeof s] }))}
          options={[
            { id: "account", label: "Account", hint: "Deposits, withdrawals", on: show.account },
            { id: "agent", label: "Agent", hint: "Agent actions", on: show.agent },
          ]}
        />
      }
    >
      <TitleHeader
        style={{ paddingBottom: 8 }}
        title="Activity"
        back={<BackButton href="/home" />}
        sub={
          <T size={13} color={C.ink3}>
            {sub}
          </T>
        }
        right={<FiltersButton open={menu} setOpen={setMenu} active={filtered} />}
      />

      {events.length === 0 ? (
        <Empty title="No activity yet" body="Deposits, withdrawals and every agent action will show up here." cta />
      ) : count === 0 ? (
        <Empty title="Nothing to show" body="Turn on Account or Agent in Filters to see your activity." />
      ) : (
        days.map((d) => (
          <Animated.View key={d.day} layout={LinearTransition.duration(180)} entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, paddingBottom: 2 }}>
              <T size={13} w={600} color={C.ink3}>
                {d.label}
              </T>
              <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
            </View>
            {d.rows.map((e) => (
              <ActivityRow key={e.id} e={e} walletName={walletName} />
            ))}
          </Animated.View>
        ))
      )}
    </Screen>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingBottom: 64 }}>
      <T size={17} w={600}>
        {title}
      </T>
      <T size={14} lh={1.5} color={C.ink3} center>
        {body}
      </T>
      {cta && (
        <View style={{ marginTop: 16, alignSelf: "center" }}>
          <PrimaryButton style={{ paddingHorizontal: 32, width: "auto" }} onPress={() => router.dismissTo({ pathname: "/home", params: { sheet: "deposit" } })}>
            Make a deposit
          </PrimaryButton>
        </View>
      )}
    </View>
  );
}
