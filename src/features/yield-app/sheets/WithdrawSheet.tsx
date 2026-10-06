import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInLeft, FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { dayMonthYear, money } from "../lib/format";
import { usePortfolio } from "../lib/hooks";
import { useApp, type Withdrawal } from "../lib/store";
import { useTxFlow, withdrawPlan } from "../lib/tx-flow";
import { AmountChips } from "../ui/AmountChips";
import { AmountInput } from "../ui/AmountInput";
import { BottomSheet, SheetHeader } from "../ui/BottomSheet";
import { PrimaryButton } from "../ui/Button";
import { T } from "../ui/Text";
import { TxFlowView } from "../ui/TxFlowView";
import { IconAlert } from "../ui/icons";
import { C } from "../ui/theme";
import { DEVNET, LIVE, MAINNET, NET } from "../chain/config";
import { FIXED_UNTIL, liveWithdrawSteps, signedAmount, useSafeBalances, type WithdrawSource } from "../chain/state";

export function WithdrawSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (w: Withdrawal) => void }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!open) setLocked(false);
  }, [open]);
  return (
    <BottomSheet open={open} onClose={onClose} label="Withdraw" gap={24} dismissible={!locked}>
      <WithdrawBody onClose={onClose} onDone={onDone} setLocked={setLocked} />
    </BottomSheet>
  );
}

const ENTER_FLOW = FadeInRight.duration(200).withInitialValues({ opacity: 0, transform: [{ translateX: 24 }] });
const ENTER_FORM = FadeInLeft.duration(200).withInitialValues({ opacity: 0, transform: [{ translateX: -24 }] });
const EXIT = FadeOutLeft.duration(100);

function WithdrawBody({ onClose, onDone, setLocked }: { onClose: () => void; onDone: (w: Withdrawal) => void; setLocked: (v: boolean) => void }) {
  const wallet = useApp((s) => s.wallet);
  const request = useApp((s) => s.requestWithdrawal);
  const complete = useApp((s) => s.completeWithdrawal);
  const p = usePortfolio();
  const chain = useSafeBalances();
  // Mainnet: pick which position to withdraw from when there is a fixed-rate one.
  const hasFixed = MAINNET && p.fixedTotal > 0;
  const [source, setSource] = useState<WithdrawSource>(p.flexible > 0 || !hasFixed ? "flexible" : "fixed");
  const total = source === "fixed" ? p.fixedTotal : p.flexible;
  const [part, setPart] = useState<number | null>(1);
  const [amount, setAmount] = useState(total);
  const flow = useTxFlow(wallet?.name ?? "your wallet", (sigs) => {
    const done = sigs.filter(Boolean);
    const w = request({ amount: DEVNET ? signedAmount(done[0], amount) : amount, txIds: done });
    // Live: the transfer is already confirmed on chain.
    if (LIVE) complete(w.id);
    setTimeout(() => onDone(useApp.getState().withdrawals[w.id] ?? w), 350);
  });
  const walletName = wallet?.name ?? "your wallet";

  useEffect(() => {
    setLocked(flow.status === "running" || flow.status === "done");
  }, [flow.status, setLocked]);

  const pick = (v: number) => {
    setPart(v);
    setAmount(Math.floor(total * v * 100) / 100);
  };
  const pickSource = (v: WithdrawSource) => {
    setSource(v);
    const t = v === "fixed" ? p.fixedTotal : p.flexible;
    setPart(1);
    setAmount(Math.floor(t * 100) / 100);
  };
  // Kamino: redeem, then send the USDC on (two signatures, more if liquidity is split).
  const kaminoOut = MAINNET && source === "flexible" && (chain?.kaminoUsdc ?? 0) > 0;
  const tooMuch = amount > total + 1e-9;
  const can = amount > 0 && !tooMuch;
  const nextUnlock = p.fixed.length ? Math.min(...p.fixed.map((f) => f.unlockAt)) : null;

  if (flow.status !== "idle") {
    return (
      <Animated.View key="flow" entering={ENTER_FLOW} exiting={EXIT} style={{ gap: 24 }}>
        <TxFlowView flow={flow} walletId={wallet?.id} walletName={walletName} onCancel={flow.cancel} doneLabel={LIVE ? "Withdrawn" : "Requested"} />
      </Animated.View>
    );
  }

  return (
    <Animated.View key="form" entering={ENTER_FORM} exiting={EXIT} style={{ gap: 24 }}>
      <SheetHeader title="Withdraw" onClose={onClose} />

      <View style={{ alignItems: "center", gap: 6, paddingVertical: 12 }}>
        <AmountInput
          value={amount}
          onChange={(n) => {
            setAmount(n);
            setPart(null);
          }}
          label="Withdraw amount in USD"
        />
        <T size={14} color={tooMuch ? C.danger : C.ink3}>
          {tooMuch ? `Available ${money(total)}` : "USDC to your wallet, about"}
        </T>
      </View>

      {hasFixed && (
        <AmountChips
          label="Withdraw from"
          size="sm"
          value={source}
          onChange={pickSource}
          chips={[
            { value: "flexible", label: "Flexible", disabled: p.flexible <= 0 },
            { value: "fixed", label: "Fixed" },
          ]}
        />
      )}

      <AmountChips
        label="Withdraw part"
        value={part}
        onChange={pick}
        chips={[
          { value: 0.25, label: "25%" },
          { value: 0.5, label: "50%" },
          { value: 1, label: "All" },
        ]}
      />

      <View style={{ flexDirection: "row", gap: 12, borderRadius: 18, backgroundColor: C.surface, padding: 16 }}>
        <View style={{ marginTop: 2 }}>
          <IconAlert size={18} sw={1.8} color={C.ink2} />
        </View>
        <T size={14} lh={1.5} color={C.ink2} style={{ flex: 1 }}>
          {DEVNET ? (
            `Idle USDC goes from your Safe straight to your wallet on ${NET.label}. You pay the network fee in devnet SOL.`
          ) : MAINNET && source === "fixed" ? (
            `Before ${FIXED_UNTIL} this sells your fixed-rate position at the market price, so you can get less than you put in. USDC goes straight to your wallet.`
          ) : MAINNET ? (
            "Your USDC comes out of Kamino and goes straight to your wallet. Amounts are approximate: Kamino pays out the current value of your share."
          ) : (
            <>
              Your USDC comes out of the DeFi protocols and goes straight to your wallet. No lockups.
              {nextUnlock ? ` Fixed deposits stay locked until ${dayMonthYear(nextUnlock)}.` : ""}
            </>
          )}
        </T>
      </View>

      <View style={{ gap: 14 }}>
        <T size={13} color={C.ink3} center>
          {kaminoOut ? `Two signatures with ${walletName}` : `One signature with ${walletName}`}
        </T>
        <PrimaryButton variant="black" onPress={() => flow.start(LIVE ? liveWithdrawSteps(source, amount, part === 1, total) : withdrawPlan(amount))} disabled={!can}>
          {amount > 0 ? `Withdraw ${money(amount)}` : "Enter an amount"}
        </PrimaryButton>
      </View>
    </Animated.View>
  );
}
