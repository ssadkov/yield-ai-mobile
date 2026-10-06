import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { addDays, dayMonth, dayMonthYear, money, moneyAuto, pct } from "../lib/format";
import { useApp } from "../lib/store";
import { STRATEGIES, strategyGain, type StrategyId } from "../lib/strategies";
import { ConnectSheet } from "../sheets/ConnectSheet";
import { DepositSheet } from "../sheets/DepositSheet";
import { AmountChips } from "../ui/AmountChips";
import { PrimaryButton } from "../ui/Button";
import { LOGO } from "../ui/images";
import { BackButton, Screen, TitleHeader } from "../ui/Screen";
import { StrategyPickCard } from "../ui/StrategyCard";
import { T } from "../ui/Text";
import { toast } from "../ui/Toast";
import { C } from "../ui/theme";
import { DEVNET, MAINNET } from "../chain/config";
import { FIXED_UNTIL, useFixedYield, useStrategy } from "../chain/state";

export function StrategyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ s?: string }>();
  const [sel, setSel] = useState<StrategyId>(params.s === "fixed" && !DEVNET ? "fixed" : "flexible");
  const [amount, setAmount] = useState(1000);
  const [sheet, setSheet] = useState<"connect" | "deposit" | null>(null);
  const flex = sel === "flexible";

  const live = useStrategy(sel);
  const fixedYield = useFixedYield();
  const unlock = addDays(Date.now(), STRATEGIES.fixed.lockDays!);
  // Mainnet Fixed: Exponent's projected net USDC at maturity for 100 USDC, scaled to the example amount.
  const gain = MAINNET ? (flex ? amount * live.apr : fixedYield.netPerUsdc !== null ? amount * (fixedYield.netPerUsdc - 1) : NaN) : strategyGain(sel, amount);
  const whole = (n: number) => money(Math.round(n), { cents: false });
  const gainNote = MAINNET
    ? flex
      ? Number.isFinite(gain)
        ? `a year · ${whole(gain / 12)}/mo at today's rate`
        : "Kamino's rate is unavailable right now"
      : Number.isFinite(gain)
        ? `by ${FIXED_UNTIL} · about ${pct(fixedYield.apy ?? NaN)} APY. Final rate is quoted when you sign.`
        : `Your fixed rate is quoted when you sign. Held until ${FIXED_UNTIL}.`
    : flex
      ? `a year · ${whole(gain / 12)}/mo`
      : `in 100 days · ${whole(amount + gain)} on ${dayMonth(unlock)}`;

  const onContinue = () => setSheet(useApp.getState().wallet ? "deposit" : "connect");

  return (
    <Screen
      top={48}
      bottom={28}
      gap={18}
      overlay={
        <>
          <ConnectSheet open={sheet === "connect"} onClose={() => setSheet(null)} onConnected={() => setSheet("deposit")} />
          <DepositSheet
            open={sheet === "deposit"}
            onClose={() => setSheet(null)}
            strategy={sel}
            onDone={(dep) => {
              setSheet(null);
              if (dep.first) router.replace({ pathname: "/success", params: { d: dep.id } });
              else {
                toast(`Deposited ${moneyAuto(dep.amount)} · ${STRATEGIES[dep.strategy].name}`);
                router.dismissTo("/home");
              }
            }}
          />
        </>
      }
    >
      <TitleHeader title="Choose a strategy" back={<BackButton href="/home" />} />

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Image source={LOGO} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.raised }} contentFit="contain" />
          <T size={12} w={700} tracking={0.08} color={C.ink3}>
            STRATEGIES BY YIELD AI
          </T>
        </View>
        <StrategyPickCard
          id="flexible"
          selected={flex}
          onSelect={() => setSel("flexible")}
          description={MAINNET ? "Withdraw any time. Your USDC earns in Kamino through your own Safe." : "Withdraw any time. The agent keeps your USDC in the best-paying protocols."}
        />
        {!DEVNET && (
          <StrategyPickCard
            id="fixed"
            selected={!flex}
            onSelect={() => setSel("fixed")}
            description={MAINNET ? `Your rate is fixed until ${FIXED_UNTIL}. Leaving early sells at the market price.` : `Your USDC is locked until ${dayMonthYear(unlock)}. The rate won't change.`}
          />
        )}
        <View style={{ marginVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 }} importantForAccessibility="no-hide-descendants">
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
          <T size={12} w={600} tracking={0.08} color={C.mute}>
            OR
          </T>
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        </View>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          accessibilityLabel="Pick protocols yourself, coming soon"
          style={{ height: 60, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.subtle, paddingHorizontal: 16 }}
        >
          <View style={{ height: 20, borderRadius: 6, backgroundColor: C.handle, paddingHorizontal: 7, justifyContent: "center" }}>
            <T size={11} w={700} tracking={0.06} color={C.white}>
              PRO
            </T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T size={15} w={600} color={C.ink4}>
              Pick protocols yourself
            </T>
            <T size={12} w={500} color={C.mute}>
              Coming soon
            </T>
          </View>
        </View>
      </View>

      <View accessibilityLabel="Earnings estimate" style={{ marginTop: "auto", gap: 12, borderRadius: 20, backgroundColor: C.surface, padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T size={14} color={C.ink2}>
            If you deposit
          </T>
          <AmountChips
            size="sm"
            label="Example amount"
            value={amount}
            onChange={setAmount}
            chips={[
              { value: 100, label: "$100" },
              { value: 1000, label: "$1k" },
              { value: 10000, label: "$10k" },
            ]}
          />
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }} accessibilityLiveRegion="polite">
          {Number.isFinite(gain) && (
            <T size={32} w={700} tracking={-0.03} tnum color={C.gain}>
              +{whole(gain)}
            </T>
          )}
          <T size={14} color={C.ink2} style={{ flexShrink: 1, textAlign: "right" }}>
            {gainNote}
          </T>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <PrimaryButton onPress={onContinue}>{flex ? "Continue with Flexible" : MAINNET ? `Lock until ${FIXED_UNTIL}` : "Lock for 100 days"}</PrimaryButton>
        <T size={11} lh={1.45} color={C.ink4} center>
          {MAINNET
            ? "Flexible APY is variable. Fixed APR is an estimate until you sign, then locked to maturity. Not a guarantee; DeFi protocol risk applies."
            : "Flexible APR is variable. Fixed APR is locked at deposit. Not a guarantee; DeFi protocol risk applies."}
        </T>
      </View>
    </Screen>
  );
}
