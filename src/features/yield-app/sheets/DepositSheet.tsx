import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInLeft, FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { money, moneyAuto, pct } from "../lib/format";
import { useApp, type AccountEvent } from "../lib/store";
import { STRATEGIES, strategyGain, type StrategyId } from "../lib/strategies";
import { depositPlan, useTxFlow } from "../lib/tx-flow";
import { AmountChips } from "../ui/AmountChips";
import { AmountInput } from "../ui/AmountInput";
import { BottomSheet, SheetHeader } from "../ui/BottomSheet";
import { PrimaryButton } from "../ui/Button";
import { SideButtonHint, Skeleton } from "../ui/Screen";
import { T } from "../ui/Text";
import { TxFlowView, signHint } from "../ui/TxFlowView";
import { C } from "../ui/theme";

let balanceLoaded = false;
/** Mock "fetching wallet balance" on first open. TODO(backend): read the wallet's USDC balance. */
function useWalletUsdc() {
  const usdc = useApp((s) => s.walletUsdc);
  const [loading, setLoading] = useState(!balanceLoaded);
  useEffect(() => {
    if (balanceLoaded) return;
    const t = setTimeout(() => {
      balanceLoaded = true;
      setLoading(false);
    }, 450);
    return () => clearTimeout(t);
  }, []);
  return { usdc, loading };
}

export function DepositSheet({ open, onClose, strategy, onDone }: { open: boolean; onClose: () => void; strategy: StrategyId; onDone: (d: AccountEvent) => void }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!open) setLocked(false);
  }, [open]);
  return (
    <BottomSheet open={open} onClose={onClose} label="Deposit" gap={24} dismissible={!locked}>
      <DepositBody strategy={strategy} onClose={onClose} onDone={onDone} setLocked={setLocked} />
    </BottomSheet>
  );
}

const ENTER_FLOW = FadeInRight.duration(200).withInitialValues({ opacity: 0, transform: [{ translateX: 24 }] });
const ENTER_FORM = FadeInLeft.duration(200).withInitialValues({ opacity: 0, transform: [{ translateX: -24 }] });
const EXIT = FadeOutLeft.duration(100);

function DepositBody({ strategy, onClose, onDone, setLocked }: { strategy: StrategyId; onClose: () => void; onDone: (d: AccountEvent) => void; setLocked: (v: boolean) => void }) {
  const wallet = useApp((s) => s.wallet);
  const events = useApp((s) => s.events);
  const recordDeposit = useApp((s) => s.recordDeposit);
  const { usdc, loading } = useWalletUsdc();
  const [amount, setAmount] = useState(() => Math.min(1000, usdc || 1000));
  const flow = useTxFlow(wallet?.name ?? "your wallet", (sigs) => {
    const dep = recordDeposit({ strategy, amount, txIds: sigs });
    setTimeout(() => onDone(dep), 450);
  });
  const s = STRATEGIES[strategy];
  const isFirst = !events.some((e) => e.src === "account" && e.kind === "deposit");

  const inFlow = flow.status !== "idle";
  useEffect(() => {
    setLocked(flow.status === "running" || flow.status === "done");
  }, [flow.status, setLocked]);

  const tooMuch = !loading && amount > usdc + 1e-9;
  const noFunds = !loading && usdc <= 0;
  const canDeposit = !loading && amount > 0 && !tooMuch;

  const gain = strategyGain(strategy, amount);
  const whole = money(Math.round(gain), { cents: false });

  if (inFlow) {
    return (
      <Animated.View key="flow" entering={ENTER_FLOW} exiting={EXIT} style={{ gap: 24 }}>
        <TxFlowView flow={flow} walletId={wallet?.id} walletName={wallet?.name ?? "your wallet"} onCancel={flow.cancel} doneLabel="Deposited" />
      </Animated.View>
    );
  }

  return (
    <Animated.View key="form" entering={ENTER_FORM} exiting={EXIT} style={{ gap: 24 }}>
      <SheetHeader title="Deposit" onClose={onClose} />

      <View style={{ alignItems: "center", gap: 6, paddingVertical: 12 }}>
        <AmountInput value={amount} onChange={setAmount} label="Deposit amount in USD" />
        {loading ? (
          <Skeleton style={{ height: 17, width: 180 }} />
        ) : noFunds ? (
          <T size={14} color={C.danger}>
            No USDC in your wallet yet
          </T>
        ) : tooMuch ? (
          <T size={14} color={C.danger}>
            Not enough USDC · in wallet {money(usdc)}
          </T>
        ) : (
          <T size={14} color={C.ink3}>
            USDC · in wallet {money(usdc)}
          </T>
        )}
      </View>

      <AmountChips
        label="Quick amounts"
        value={amount}
        onChange={setAmount}
        chips={[
          { value: 100, label: "$100" },
          { value: 500, label: "$500" },
          { value: 1000, label: "$1,000" },
          { value: usdc, label: "Max", disabled: noFunds || loading },
        ]}
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 18, backgroundColor: C.surface, padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: strategy === "fixed" ? C.navy : C.gain }} />
          <T size={15} w={600} numberOfLines={1}>
            {strategy === "fixed" ? "Fixed" : s.name} · {pct(s.apr)} APR
          </T>
        </View>
        <T size={14} color={C.ink2} style={{ flexShrink: 1, textAlign: "right" }}>
          Est.{" "}
          <T size={14} w={600} tnum color={C.gain}>
            {whole}
          </T>{" "}
          {s.lockDays ? "in 100 days" : "/ year"}
        </T>
      </View>

      <View style={{ gap: 14 }}>
        <SideButtonHint text={wallet?.id === "seed-vault" || !wallet ? "Then double-tap the side button to sign" : signHint(wallet.id, wallet.name)} />
        <PrimaryButton onPress={() => flow.start(depositPlan(strategy, amount, isFirst))} disabled={!canDeposit}>
          {amount > 0 ? `Deposit ${moneyAuto(amount)}` : "Enter an amount"}
        </PrimaryButton>
      </View>
    </Animated.View>
  );
}
