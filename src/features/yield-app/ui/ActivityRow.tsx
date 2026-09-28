import { useRouter } from "expo-router";
import { View } from "react-native";
import type { LedgerEvent } from "../lib/store";
import { STRATEGIES } from "../lib/strategies";
import { clock, money } from "../lib/format";
import { TokenPair } from "./images";
import { Tap } from "./Tap";
import { T } from "./Text";
import { IconCheck, IconDown, IconUp } from "./icons";
import { C } from "./theme";

function describe(e: LedgerEvent, walletName: string) {
  if (e.src === "agent") return { title: e.title, detail: e.detail, amount: "", color: C.ink };
  const s = STRATEGIES[e.strategy].name;
  if (e.kind === "deposit")
    return { title: "Deposit", detail: e.first ? `First deposit · ${s}` : `From ${walletName} · ${s}`, amount: "+" + money(e.amount), color: C.gain };
  return { title: "Withdraw", detail: `To ${walletName} · ${s}`, amount: "−" + money(e.amount), color: C.ink };
}

const CIRCLE = { alignItems: "center", justifyContent: "center" } as const;

export function ActivityRow({ e, walletName }: { e: LedgerEvent; walletName: string }) {
  const router = useRouter();
  const d = describe(e, walletName);
  const isCheck = e.src === "agent" && e.kind === "check";
  const body = (
    <>
      <View style={{ width: 40, flexDirection: "row" }}>
        {e.src === "agent" ? (
          e.kind === "check" ? (
            <View style={[CIRCLE, { width: 28, height: 28, borderRadius: 14, backgroundColor: C.neutral }]}>
              <IconCheck size={14} sw={2.4} color={C.ink4} />
            </View>
          ) : (
            <TokenPair a={e.coins?.[0] ?? "usdc"} b={e.coins?.[1] ?? "usd1"} />
          )
        ) : e.kind === "deposit" ? (
          <View style={[CIRCLE, { width: 32, height: 32, borderRadius: 16, backgroundColor: C.gainSoft }]}>
            <IconDown size={16} sw={2.4} color={C.gain} />
          </View>
        ) : (
          <View style={[CIRCLE, { width: 32, height: 32, borderRadius: 16, backgroundColor: C.neutral }]}>
            <IconUp size={16} sw={2.4} color={C.ink2} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <T size={15} w={600} color={isCheck ? C.ink3 : C.ink} numberOfLines={1}>
          {d.title}
        </T>
        <T size={12} color={C.ink3} numberOfLines={1}>
          {d.detail}
        </T>
      </View>
      <View style={{ alignItems: "flex-end", gap: 1 }}>
        {d.amount ? (
          <T size={15} w={600} tnum color={d.color}>
            {d.amount}
          </T>
        ) : null}
        <T size={12} tnum color={C.ink4}>
          {clock(e.ts)}
        </T>
      </View>
    </>
  );
  const row = { height: 56, flexDirection: "row", alignItems: "center", gap: 12 } as const;
  if (e.src === "agent") {
    return (
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${d.title}, ${d.detail}`}
        feedback="none"
        scale={1}
        bg={C.white}
        pressedBg={C.surface}
        onPress={() => router.push({ pathname: "/activity/agent", params: { focus: e.id } })}
        style={[row, { marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 12 }]}
      >
        {body}
      </Tap>
    );
  }
  return <View style={row}>{body}</View>;
}
