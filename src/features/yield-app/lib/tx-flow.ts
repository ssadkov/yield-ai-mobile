
import { useCallback, useRef, useState } from "react";
import { getDriver, toWalletError, type TxPhase, type TxStep, type WalletError } from "../wallet";
import { STRATEGIES, type StrategyId } from "./strategies";
import { dayMonthYear, addDays, moneyAuto } from "./format";

/**
 * Transaction plans. TODO(backend): the real instruction set per strategy is unknown;
 * the mock splits a first deposit into a one-time setup + the deposit to exercise the
 * multi-signature flow.
 */
export function depositPlan(strategy: StrategyId, amount: number, isFirst: boolean): TxStep[] {
  const steps: TxStep[] = [];
  if (isFirst) {
    steps.push({ id: "setup", kind: "setup", title: "Set up your account", detail: "One time. Creates your Yield AI vault on Solana." });
  }
  if (strategy === "fixed") {
    const until = dayMonthYear(addDays(Date.now(), STRATEGIES.fixed.lockDays!));
    steps.push({ id: "lock", kind: "lock", title: `Lock ${moneyAuto(amount)}`, detail: `Fixed ${(STRATEGIES.fixed.apr * 100).toFixed(2)}% APR until ${until}` });
  } else {
    steps.push({ id: "deposit", kind: "deposit", title: `Deposit ${moneyAuto(amount)}`, detail: "USDC into Flexible" });
  }
  return steps;
}

export function withdrawPlan(amount: number): TxStep[] {
  return [{ id: "withdraw", kind: "withdraw", title: `Withdraw ${moneyAuto(amount)}`, detail: "From Flexible to your wallet" }];
}

export type FlowStatus = "idle" | "running" | "failed" | "done";

/** `onDone` fires once every step is confirmed — after the first run or after a retry. */
export function useTxFlow(walletName: string, onDone: (signatures: string[]) => void) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [phases, setPhases] = useState<TxPhase[]>([]);
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [error, setError] = useState<WalletError | null>(null);
  const sigs = useRef<string[]>([]);
  const cancelled = useRef(false);

  const runFrom = useCallback(
    async (plan: TxStep[], from: number): Promise<string[] | null> => {
      cancelled.current = false;
      setStatus("running");
      setError(null);
      for (let i = from; i < plan.length; i++) {
        const setPhase = (p: TxPhase) =>
          setPhases((prev) => {
            const next = [...prev];
            next[i] = p;
            return next;
          });
        try {
          const sig = await getDriver().signAndSubmit(plan[i], setPhase, walletName);
          if (cancelled.current) return null;
          sigs.current[i] = sig;
          setPhase("done");
        } catch (e) {
          if (cancelled.current) return null;
          setPhase("failed");
          setError(toWalletError(e));
          setStatus("failed");
          return null;
        }
      }
      setStatus("done");
      const all = [...sigs.current];
      onDoneRef.current(all);
      return all;
    },
    [walletName],
  );

  const start = useCallback(
    (plan: TxStep[]) => {
      sigs.current = [];
      setSteps(plan);
      setPhases(plan.map(() => "pending"));
      return runFrom(plan, 0);
    },
    [runFrom],
  );

  /** Resumes from the failed step; confirmed steps are not signed again. */
  const retry = useCallback(() => {
    const from = phases.findIndex((p) => p !== "done");
    setPhases((prev) => prev.map((p, i) => (i >= from ? "pending" : p)));
    return runFrom(steps, Math.max(0, from));
  }, [phases, steps, runFrom]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    setStatus("idle");
    setError(null);
    setSteps([]);
    setPhases([]);
  }, []);

  const current = Math.max(0, phases.findIndex((p) => p !== "done"));
  return { steps, phases, status, error, current: status === "done" ? steps.length - 1 : current, start, retry, cancel };
}

export type TxFlow = ReturnType<typeof useTxFlow>;

