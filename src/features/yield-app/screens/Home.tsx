import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { dayMonth, money, moneyAuto, pct, splitMoney } from "../lib/format";
import { usePortfolio } from "../lib/hooks";
import { RANGES, bucketize, type Range } from "../lib/portfolio";
import { useApp } from "../lib/store";
import { STRATEGIES } from "../lib/strategies";
import { ConnectSheet } from "../sheets/ConnectSheet";
import { DepositSheet } from "../sheets/DepositSheet";
import { ProfileSheet } from "../sheets/ProfileSheet";
import { WithdrawSheet } from "../sheets/WithdrawSheet";
import { BarChart } from "../ui/BarChart";
import { PrimaryButton } from "../ui/Button";
import { LOGO } from "../ui/images";
import { Screen } from "../ui/Screen";
import { AddProductCard, ProductCard } from "../ui/StrategyCard";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { toast } from "../ui/Toast";
import { IconClock, IconDown, IconInfo, IconTrend, IconUp } from "../ui/icons";
import { C, shadow } from "../ui/theme";

type Sheet = "deposit" | "withdraw" | "connect" | "profile" | null;

export function HomeScreen() {
  const router = useRouter();
  const p = usePortfolio();
  const wallet = useApp((s) => s.wallet);
  const loadDemo = useApp((s) => s.loadDemo);
  const [range, setRange] = useState<Range>("1W");
  const [info, setInfo] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);

  // "Make a deposit" on an empty Activity comes back here with ?sheet=deposit.
  const params = useLocalSearchParams<{ sheet?: string }>();
  useEffect(() => {
    if (params.sheet === "deposit") setSheet(useApp.getState().wallet ? "deposit" : "connect");
  }, [params.sheet]);

  const buckets = useMemo(() => bucketize(p.days, range), [p.days, range]);
  const [whole, cents] = splitMoney(p.total);
  const empty = !p.hasPositions;

  return (
    <Screen
      top={56}
      bottom={32}
      gap={18}
      overlay={
        <>
          <ConnectSheet open={sheet === "connect"} onClose={close} onConnected={() => setSheet("deposit")} />
          <DepositSheet
            open={sheet === "deposit"}
            onClose={close}
            strategy="flexible"
            onDone={(dep) => {
              close();
              if (dep.first) router.push({ pathname: "/success", params: { d: dep.id } });
              else toast(`Deposited ${moneyAuto(dep.amount)} · Flexible`);
            }}
          />
          <WithdrawSheet
            open={sheet === "withdraw"}
            onClose={close}
            onDone={(w) => {
              close();
              router.push({ pathname: "/withdraw/[id]", params: { id: w.id } });
            }}
          />
          <ProfileSheet open={sheet === "profile"} onClose={close} onConnect={() => setSheet("connect")} />
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Tap accessibilityRole="button" accessibilityLabel="Account" scale={0.92} onPress={() => setSheet("profile")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.raised, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Image source={LOGO} style={{ width: 30, height: 30 }} contentFit="contain" />
        </Tap>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Activity history"
          scale={0.92}
          onPress={() => router.push("/activity")}
          style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }, shadow.float]}
        >
          <IconClock size={22} sw={2.2} />
        </Tap>
      </View>

      <View style={{ marginTop: -8, alignItems: "center", gap: 10, zIndex: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <IconTrend size={18} color={C.mute} />
          <T size={16} w={500} color={C.ink3}>
            {empty ? `Earn ${pct(STRATEGIES.flexible.apr)}` : `Earning ${pct(p.apr)}`}
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="About this rate" accessibilityState={{ expanded: info }} hitSlop={14} onPress={() => setInfo((v) => !v)}>
            <IconInfo size={16} color={C.mute} />
          </Pressable>
          {info && (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[{ position: "absolute", top: 30, alignSelf: "center", left: "50%", marginLeft: -130, width: 260, borderRadius: 16, backgroundColor: C.white, padding: 12, zIndex: 10 }, shadow.tip]}>
              <Pressable onPress={() => setInfo(false)} accessibilityRole="text">
                <T size={13} lh={1.45} color={C.ink2} center>
                  {empty ? "Flexible APR" : "Your blended APR"} is variable and not a guarantee. It changes with market rates.
                </T>
              </Pressable>
            </Animated.View>
          )}
        </View>
        <View accessibilityLabel={`Balance ${money(p.total)}`} style={{ flexDirection: "row", alignItems: "baseline" }}>
          <T size={64} w={800} tracking={-0.045} tnum>
            {whole}
          </T>
          <T size={40} w={800} tracking={-0.045} tnum>
            {cents}
          </T>
        </View>
        {empty ? (
          <T size={15} color={C.ink4}>
            Make your first deposit to start earning
          </T>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.gain2 }} />
            <T size={15} w={700} tnum color={C.gain}>
              {money(p.earnedWeek)} earned
            </T>
            <T size={15} color={C.ink4}>
              this week
            </T>
          </View>
        )}
      </View>

      <BarChart buckets={buckets} empty={empty} />

      {!empty && (
        <View accessibilityRole="tablist" style={{ marginTop: -8, flexDirection: "row", justifyContent: "space-between" }}>
          {RANGES.map((r) => {
            const on = r === range;
            return (
              <Tap
                key={r}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                feedback="select"
                scale={0.95}
                onPress={() => setRange(r)}
                style={{ height: 40, borderRadius: 20, paddingHorizontal: 16, justifyContent: "center", backgroundColor: on ? C.raised : "transparent" }}
              >
                <T size={14} w={600} color={on ? C.ink : C.ink4}>
                  {r}
                </T>
              </Tap>
            );
          })}
        </View>
      )}

      <View style={{ gap: 10 }} accessibilityLabel="Your products">
        {p.flexible > 0 && <ProductCard id="flexible" amount={money(p.flexible)} apr={STRATEGIES.flexible.apr} sub="Withdraw any time" />}
        {p.fixed.map((f) => (
          <ProductCard key={f.id} id="fixed" amount={money(f.amount + f.earned)} apr={STRATEGIES.fixed.apr} sub={`Unlocks ${dayMonth(f.unlockAt)}`} />
        ))}
        {p.flexible <= 0 && <AddProductCard id="flexible" onPress={() => router.push({ pathname: "/strategy", params: { s: "flexible" } })} />}
        {p.fixed.length === 0 && <AddProductCard id="fixed" onPress={() => router.push({ pathname: "/strategy", params: { s: "fixed" } })} />}
        {empty && (
          <Tap accessibilityRole="button" feedback="none" onPress={loadDemo} style={{ height: 44, alignItems: "center", justifyContent: "center" }}>
            <T size={14} w={600} color={C.blue}>
              Or explore with demo data
            </T>
          </Tap>
        )}
      </View>

      <View style={{ marginTop: "auto", flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Deposit" onPress={() => setSheet(wallet ? "deposit" : "connect")}>
            <IconDown size={20} sw={2.2} color={C.white} />
            <T size={17} w={600} color={C.white}>
              Deposit
            </T>
          </PrimaryButton>
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Withdraw" variant="light" disabled={p.flexible <= 0} onPress={() => setSheet("withdraw")}>
            <IconUp size={20} sw={2.2} color={p.flexible <= 0 ? C.mute : C.ink} />
            <T size={17} w={600} color={p.flexible <= 0 ? C.mute : C.ink}>
              Withdraw
            </T>
          </PrimaryButton>
        </View>
      </View>
    </Screen>
  );
}
