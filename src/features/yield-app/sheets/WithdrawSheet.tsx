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
import { DEVNET } from "../devnet/config";
import { devnetWithdrawSteps, signedAmount } from "../devnet/state";

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
  const total = p.flexible;
  const [part, setPart] = useState<number | null>(1);
  const [amount, setAmount] = useState(total);
  const flow = useTxFlow(wallet?.name ?? "your wallet", (sigs) => {
    const w = request({ amount: DEVNET ? signedAmount(sigs[0], amount) : amount, txIds: sigs });
    // On Devnet the transfer is already confirmed on chain.
    if (DEVNET) complete(w.id);
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
  const tooMuch = amount > total + 1e-9;
  const can = amount > 0 && !tooMuch;
  const nextUnlock = p.fixed.length ? Math.min(...p.fixed.map((f) => f.unlockAt)) : null;

  if (flow.status !== "idle") {
    return (
      <Animated.View key="flow" entering={ENTER_FLOW} exiting={EXIT} style={{ gap: 24 }}>
        <TxFlowView flow={flow} walletId={wallet?.id} walletName={walletName} onCancel={flow.cancel} doneLabel={DEVNET ? "Withdrawn" : "Requested"} />
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
            "Idle USDC goes from your Safe straight to your wallet on Solana Devnet. You pay the network fee in devnet SOL."
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
          One signature with {walletName}
        </T>
        <PrimaryButton variant="black" onPress={() => flow.start(DEVNET ? devnetWithdrawSteps(amount, part === 1) : withdrawPlan(amount))} disabled={!can}>
          {amount > 0 ? `Withdraw ${money(amount)}` : "Enter an amount"}
        </PrimaryButton>
      </View>
    </Animated.View>
  );
}
