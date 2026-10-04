import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";
import { moneyAuto } from "../lib/format";
import { useApp } from "../lib/store";
import type { TxStep } from "../wallet";
import { assertNetwork, safeApi, sol, type SafeState } from "./api";
import { DEVNET } from "./config";
import { defaultDeps, reconcile, runOperation, type PlanInfo } from "./engine";
import { loadJournal, openEntry, useJournal } from "./journal";

/** On-chain Safe and wallet balances for the connected owner, read from GET /safes. */
type SafeStore = {
  owner: string | null;
  safe: SafeState | null;
  loading: boolean;
  error: string | null;
};

export const useSafe = create<SafeStore>(() => ({ owner: null, safe: null, loading: false, error: null }));

export async function refreshSafe(owner = useApp.getState().wallet?.address) {
  if (!DEVNET || !owner) return;
  if (useSafe.getState().owner !== owner) useSafe.setState({ owner, safe: null });
  useSafe.setState({ loading: true });
  try {
    const safe = await safeApi.safe(owner);
    assertNetwork(safe.network);
    if (useSafe.getState().owner === owner) useSafe.setState({ safe, loading: false, error: null });
  } catch (e) {
    if (useSafe.getState().owner === owner) useSafe.setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Numbers for the screens. null while the first read is in flight. */
export function useSafeBalances() {
  const safe = useSafe((s) => s.safe);
  const owner = useApp((s) => s.wallet?.address);
  if (!safe || safe.owner.address !== owner) return null;
  return { walletUsdc: Number(safe.walletUsdc), idleUsdc: Number(safe.idleUsdc), solLamports: safe.walletSolLamports, exists: safe.exists };
}

/**
 * Mounted once. For the connected wallet: loads the journal, resumes any transaction
 * left unconfirmed (timeout, app restart), and keeps balances fresh.
 */
export function useDevnetRuntime() {
  const owner = useApp((s) => s.wallet?.address);
  useEffect(() => {
    if (!DEVNET || !owner) return;
    let alive = true;
    (async () => {
      refreshSafe(owner);
      await loadJournal();
      const open = openEntry(owner);
      if (open && alive) {
        await reconcile(open);
        if (alive) refreshSafe(owner);
      }
    })();
    const sub = AppState.addEventListener("change", async (s) => {
      if (s !== "active") return;
      refreshSafe(owner);
      // Back from the background (or the network came back): settle anything left open.
      const open = openEntry(owner);
      if (open) {
        await reconcile(open);
        refreshSafe(owner);
      }
    });
    // Balances move when a transaction lands.
    const unsub = useJournal.subscribe((s, prev) => {
      const changed = s.entries.some((e) => e.owner === owner && (e.status === "confirmed" || e.status === "finalized") && prev.entries.find((p) => p.id === e.id)?.status !== e.status);
      if (changed) refreshSafe(owner);
    });
    return () => {
      alive = false;
      sub.remove();
      unsub();
    };
  }, [owner]);
}

/** The exact USDC amount of a signed transaction (e.g. "all" resolved at plan time). */
export function signedAmount(signature: string | undefined, fallback: number) {
  return useJournal.getState().entries.find((e) => e.id === signature)?.amountUsd ?? fallback;
}

function costLine(p: PlanInfo) {
  const rent = Number(p.cost.rentLamports) > 0 ? " incl. account rent" : "";
  return `Network cost ${sol(p.cost.totalLamports)}${rent} · Solana Devnet`;
}

export function devnetDepositSteps(amount: number): TxStep[] {
  const owner = useApp.getState().wallet?.address ?? "";
  const creating = useSafe.getState().safe?.exists === false;
  return [
    {
      id: "devnet-deposit",
      kind: creating ? "setup" : "deposit",
      title: `Deposit ${moneyAuto(amount)}`,
      detail: creating ? "Creates your Safe and deposits in one signature" : "USDC into your Safe",
      run: (onPhase, setDetail) =>
        runOperation({ kind: "deposit", amountUsd: amount }, owner, {
          onPhase,
          onPlan: (p) => setDetail(`${p.op === "create" ? "Creates your Safe and deposits. " : ""}${costLine(p)}`),
        }, defaultDeps),
    },
  ];
}

export function devnetWithdrawSteps(amount: number, all: boolean): TxStep[] {
  const owner = useApp.getState().wallet?.address ?? "";
  return [
    {
      id: "devnet-withdraw",
      kind: "withdraw",
      title: all ? "Withdraw all" : `Withdraw ${moneyAuto(amount)}`,
      detail: "Idle USDC from your Safe to your wallet",
      run: (onPhase, setDetail) =>
        runOperation({ kind: "withdraw", amountUsd: amount, all }, owner, {
          onPhase,
          onPlan: (p) => setDetail(`${moneyAuto(Number(p.amount))} to your wallet. ${costLine(p)}`),
        }, defaultDeps),
    },
  ];
}
