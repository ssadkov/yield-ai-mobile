import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { FadeOutLeft, SlideInRight, useAnimatedStyle, withTiming } from "react-native-reanimated";
import type { TxFlow } from "../lib/tx-flow";
import type { TxStep, WalletId } from "../wallet";
import { SheetHeader } from "./BottomSheet";
import { PrimaryButton } from "./Button";
import { SideButtonHint } from "./Screen";
import { StatusSteps, type StepState } from "./StatusSteps";
import { Tap } from "./Tap";
import { T } from "./Text";
import { haptic } from "./haptics";
import { IconAlert, IconCheck, IconDown, IconLock, IconShield, IconUp, Spinner } from "./icons";
import { C } from "./theme";

function KindIcon({ kind }: { kind: TxStep["kind"] }) {
  const p = { size: 30, sw: 2.2, color: C.white };
  if (kind === "setup") return <IconShield {...p} />;
  if (kind === "lock") return <IconLock {...p} />;
  if (kind === "withdraw") return <IconUp {...p} />;
  return <IconDown {...p} />;
}

export function signHint(walletId: WalletId | undefined, walletName: string) {
  if (walletId === "seed-vault" || !walletId) return "Double-tap the side button to sign";
  return `Approve in ${walletName}`;
}

/**
 * Signing screen inside a sheet. With several transactions each one gets its own
 * "page" (Step 1 of 2 → Step 2 of 2) plus a compact overview of all steps.
 */
export function TxFlowView({ flow, walletId, walletName, onCancel, doneLabel = "Done" }: { flow: TxFlow; walletId?: WalletId; walletName: string; onCancel: () => void; doneLabel?: string }) {
  const { steps, phases, status, error, current } = flow;
  const n = steps.length;
  const step = steps[current];
  const phase = phases[current];

  // Haptics on outcome.
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current !== status) {
      if (status === "done") haptic.success();
      if (status === "failed") haptic.error();
    }
    prev.current = status;
  }, [status]);

  if (!step) return null;

  const multi = n > 1;
  const title = status === "done" ? "All signed" : multi ? `Sign ${n} transactions` : "Sign transaction";
  const canClose = status === "failed" || phase === "signing" || phase === "pending";

  const overview = steps.map((s, i) => {
    const p = phases[i];
    const state: StepState = p === "done" ? "done" : p === "failed" ? "failed" : i === current ? "active" : "pending";
    const sub = p === "done" ? "Confirmed" : p === "failed" ? "Not signed" : p === "submitting" ? "Sending to Solana…" : p === "signing" ? "Waiting for your signature" : s.detail;
    return { title: s.title, sub, state };
  });

  const ring = phase === "failed" ? C.dangerSoft : phase === "done" ? C.gainSoft : C.blueSoft;
  const core = phase === "failed" ? C.danger : phase === "done" ? C.gain : C.blue;

  return (
    <>
      <SheetHeader title={title} onClose={onCancel} closeDisabled={!canClose} />

      {multi && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {steps.map((s, i) => (
            <ProgressSeg key={s.id} fill={phases[i] === "done" ? 1 : i === current ? 0.45 : 0} failed={phases[i] === "failed"} />
          ))}
        </View>
      )}

      <View style={{ alignItems: "center" }} accessibilityLiveRegion="polite">
        <Animated.View key={step.id} entering={SlideInRight.springify().damping(30).stiffness(320)} exiting={FadeOutLeft.duration(150)} style={{ width: "100%", alignItems: "center", gap: 16 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: ring, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: core, alignItems: "center", justifyContent: "center" }}>
              {phase === "done" ? <IconCheck size={30} sw={2.6} color={C.white} /> : <KindIcon kind={step.kind} />}
            </View>
          </View>
          <View style={{ gap: 6, alignItems: "center" }}>
            {multi && (
              <T size={12} w={600} tracking={0.08} color={C.ink3}>
                STEP {current + 1} OF {n}
              </T>
            )}
            <T size={26} w={700} tracking={-0.03} tnum center>
              {step.title}
            </T>
            <T size={15} lh={1.45} color={C.ink2} center>
              {step.detail}
            </T>
          </View>
        </Animated.View>
      </View>

      {multi && (
        <View style={{ borderRadius: 18, backgroundColor: C.surface, padding: 16 }}>
          <StatusSteps steps={overview} gap={12} />
        </View>
      )}

      <View style={{ gap: 14 }}>
        {status === "failed" && error ? (
          <>
            <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 12, borderRadius: 18, backgroundColor: C.dangerSoft, padding: 16 }}>
              <View style={{ marginTop: 2 }}>
                <IconAlert size={18} sw={1.8} color={C.danger} />
              </View>
              <T size={14} lh={1.5} color={C.danger} style={{ flex: 1 }}>
                {error.message}
                {multi && current > 0 ? " Signed steps are saved — you'll continue from here." : ""}
              </T>
            </View>
            <View style={{ gap: 4 }}>
              <PrimaryButton onPress={() => flow.retry()}>Try again</PrimaryButton>
              <Tap accessibilityRole="button" feedback="none" onPress={onCancel} style={{ height: 44, alignItems: "center", justifyContent: "center" }}>
                <T size={15} w={600} color={C.ink3}>
                  Cancel
                </T>
              </Tap>
            </View>
          </>
        ) : status === "done" ? (
          <PrimaryButton disabled label={doneLabel}>
            <IconCheck size={20} sw={2.6} color={C.white} />
            <T size={17} w={600} color={C.white}>
              {doneLabel}
            </T>
          </PrimaryButton>
        ) : phase === "submitting" ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Spinner size={16} color={C.ink3} />
              <T size={13} color={C.ink3}>
                Sending to Solana…
              </T>
            </View>
            <PrimaryButton disabled loading>
              Confirming
            </PrimaryButton>
          </>
        ) : (
          <>
            <SideButtonHint text={signHint(walletId, walletName)} />
            <PrimaryButton disabled loading>
              Waiting for signature
            </PrimaryButton>
          </>
        )}
      </View>
    </>
  );
}

function ProgressSeg({ fill, failed }: { fill: number; failed: boolean }) {
  const a = useAnimatedStyle(() => ({ width: withTiming(`${fill * 100}%`, { duration: 350 }) }), [fill]);
  return (
    <View style={{ flex: 1, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: C.line }}>
      <Animated.View style={[{ height: "100%", borderRadius: 2, backgroundColor: failed ? C.danger : C.blue }, a]} />
    </View>
  );
}
