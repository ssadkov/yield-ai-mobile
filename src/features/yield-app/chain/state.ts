import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";
import { dayMonthYear, moneyAuto } from "../lib/format";
import { useApp } from "../lib/store";
import { STRATEGIES, type Strategy, type StrategyId } from "../lib/strategies";
import type { TxStep } from "../wallet";
import { assertNetwork, safeApi, sol, type ExponentPosition, type KaminoPosition, type SafeState } from "./api";
import { EXPONENT_MATURITY, LIVE, MAINNET, NET, PT_DECIMALS } from "./config";
import { defaultDeps, reconcile, runOperation, type PlanInfo } from "./engine";
import { loadJournal, openEntry, useJournal } from "./journal";
import { createSafe, exponentExit, exponentInvest, exponentSetup, kaminoInvest, kaminoWithdraw, type ProtocolHooks } from "./protocols";

/** On-chain state for the connected owner: Safe and wallet (GET /safes), plus Mainnet positions. */
type SafeStore = {
  owner: string | null;
  safe: SafeState | null;
  kamino: KaminoPosition | null;
  exponent: ExponentPosition | null;
  loading: boolean;
  error: string | null;
};

export const useSafe = create<SafeStore>(() => ({ owner: null, safe: null, kamino: null, exponent: null, loading: false, error: null }));

/** Kamino's published APY (Mainnet). Unavailable is shown as such, never as 0%. */
type YieldStore = { apy: number | null; fetchedAt: number | null; unavailable: boolean };
export const useKaminoYield = create<YieldStore>(() => ({ apy: null, fetchedAt: null, unavailable: false }));

/**
 * Exponent's indicative fixed rate for 100 USDC (Mainnet): APR for the label, APY for compounding,
 * and the projected net USDC at maturity for estimates. Refreshed at its expiresAt.
 */
type FixedYieldStore = { apr: number | null; apy: number | null; netPerUsdc: number | null; expiresAt: number | null; unavailable: boolean };
export const useFixedYield = create<FixedYieldStore>(() => ({ apr: null, apy: null, netPerUsdc: null, expiresAt: null, unavailable: false }));

export async function refreshFixedYield() {
  if (!MAINNET) return;
  try {
    const y = await safeApi.exponentYield();
    const apr = Number(y.aprRatio);
    const apy = Number(y.apyRatio);
    const net = Number(y.projectedNetUsdc) / Number(y.referenceAmountUsdc);
    if (y.status !== "available" || !Number.isFinite(apr) || !Number.isFinite(apy)) throw new Error("unavailable");
    useFixedYield.setState({ apr, apy, netPerUsdc: Number.isFinite(net) ? net : null, expiresAt: y.expiresAt, unavailable: false });
  } catch {
    // An expired rate isn't shown as current.
    useFixedYield.setState({ apr: null, apy: null, netPerUsdc: null, unavailable: true, expiresAt: Date.now() + 30_000 });
  }
}

export async function refreshKaminoYield() {
  if (!MAINNET) return;
  try {
    const y = await safeApi.kaminoYield();
    const apy = Number(y.apyRatio);
    if (y.status !== "available" || !Number.isFinite(apy)) throw new Error("unavailable");
    useKaminoYield.setState({ apy, fetchedAt: y.fetchedAt, unavailable: false });
  } catch {
    useKaminoYield.setState({ unavailable: true });
  }
}

export async function refreshSafe(owner = useApp.getState().wallet?.address) {
  if (!LIVE || !owner) return;
  if (useSafe.getState().owner !== owner) useSafe.setState({ owner, safe: null, kamino: null, exponent: null });
  useSafe.setState({ loading: true });
  try {
    const safe = await safeApi.safe(owner);
    assertNetwork(safe.network);
    let kamino: KaminoPosition | null = null;
    let exponent: ExponentPosition | null = null;
    if (MAINNET && safe.exists) {
      // Positions are extra detail: a failed read keeps the last one rather than showing zero.
      const [k, x] = await Promise.allSettled([safeApi.kaminoPosition(owner), safeApi.exponentPosition(owner)]);
      kamino = k.status === "fulfilled" ? k.value : useSafe.getState().kamino;
      exponent = x.status === "fulfilled" ? x.value : useSafe.getState().exponent;
    }
    if (useSafe.getState().owner === owner) useSafe.setState({ safe, kamino, exponent, loading: false, error: null });
  } catch (e) {
    if (useSafe.getState().owner === owner) useSafe.setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
  }
}

export type Balances = {
  walletUsdc: number;
  idleUsdc: number;
  /** Kamino cost basis (USDC put in, after withdrawals): the API reports no live value yet. */
  kaminoUsdc: number;
  /** Exponent PT position cost basis. */
  fixedUsdc: number;
  ptRaw: string;
  /** null until known: the fixed-rate position needs its one-time setup first. */
  fixedSetupRequired: boolean | null;
  solLamports: string;
  exists: boolean;
};

const usd6 = (raw: string | undefined) => Number(raw ?? 0) / 1e6;

/** Numbers for the screens. null while the first read is in flight. */
export function useSafeBalances(): Balances | null {
  const { safe, kamino, exponent } = useSafe();
  const owner = useApp((s) => s.wallet?.address);
  if (!safe || safe.owner.address !== owner) return null;
  return {
    walletUsdc: Number(safe.walletUsdc),
    idleUsdc: Number(safe.idleUsdc),
    kaminoUsdc: kamino && kamino.sharesRaw !== "0" ? Number(kamino.principalUsdc) : 0,
    fixedUsdc: exponent?.position && exponent.position.trackedPt !== "0" ? usd6(exponent.position.principalUsdc) : 0,
    ptRaw: exponent?.position?.trackedPt ?? "0",
    fixedSetupRequired: safe.exists ? (exponent ? exponent.setupRequired : null) : true,
    solLamports: safe.walletSolLamports,
    exists: safe.exists,
  };
}

export function ptAmount(raw: string) {
  return Number(raw) / 10 ** PT_DECIMALS;
}

/**
 * Mounted once. For the connected wallet: loads the journal, resumes any transaction
 * left unconfirmed (timeout, app restart), and keeps balances fresh.
 */
export function useChainRuntime() {
  const owner = useApp((s) => s.wallet?.address);
  useEffect(() => {
    if (!MAINNET) return;
    refreshKaminoYield();
    const t = setInterval(refreshKaminoYield, 60_000);
    return () => clearInterval(t);
  }, []);
  // The fixed rate expires on its own clock (about a minute); refresh right after it.
  const fixedExpires = useFixedYield((s) => s.expiresAt);
  useEffect(() => {
    if (!MAINNET) return;
    const wait = fixedExpires ? Math.min(5 * 60_000, Math.max(15_000, fixedExpires - Date.now() + 1000)) : 0;
    const t = setTimeout(refreshFixedYield, wait);
    return () => clearTimeout(t);
  }, [fixedExpires]);
  useEffect(() => {
    if (!LIVE || !owner) return;
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
      refreshKaminoYield();
      refreshFixedYield();
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
  return `Network cost ${sol(p.cost.totalLamports)}${rent} · ${NET.label}`;
}

function pctText(ratio: number) {
  return `${(ratio * 100).toFixed(2)}%`;
}

const owner = () => useApp.getState().wallet?.address ?? "";

type Run = NonNullable<TxStep["run"]>;

/** Adapts a protocol flow to a signing step: cost line + progress in the step's subtitle. */
function step(id: string, kind: TxStep["kind"], title: string, detail: string, fn: (hooks: ProtocolHooks) => Promise<unknown>, planNote?: (p: PlanInfo) => string): TxStep {
  const run: Run = async (onPhase, setDetail) => {
    let progress = "";
    const res = await fn({
      onPhase,
      onProgress: (text) => {
        progress = text;
        setDetail(text);
      },
      onPlan: (p) => setDetail([progress, planNote?.(p), costLine(p)].filter(Boolean).join(". ")),
    });
    if (typeof res === "string") return res;
    if (res && typeof res === "object" && "signatures" in res) return (res as { signatures: string[] }).signatures.at(-1) ?? "";
    if (res && typeof res === "object" && "signature" in res) return (res as { signature: string }).signature;
    return "";
  };
  return { id, kind, title, detail, run };
}

export const FIXED_UNTIL = dayMonthYear(EXPONENT_MATURITY);

/** Deposit steps for the real backend. Devnet: idle USDC. Mainnet: Kamino or the fixed-rate PT. */
export function liveDepositSteps(strategy: StrategyId, amount: number): TxStep[] {
  const st = useSafe.getState();
  const noSafe = st.safe?.exists === false;
  if (!MAINNET) {
    return [
      {
        id: "chain-deposit",
        kind: noSafe ? "setup" : "deposit",
        title: `Deposit ${moneyAuto(amount)}`,
        detail: noSafe ? "Creates your Safe and deposits in one signature" : "USDC into your Safe",
        run: (onPhase, setDetail) =>
          runOperation({ kind: "deposit", amountUsd: amount }, owner(), {
            onPhase,
            onPlan: (p) => setDetail(`${p.op === "create" ? "Creates your Safe and deposits. " : ""}${costLine(p)}`),
          }, defaultDeps),
      },
    ];
  }
  const steps: TxStep[] = [];
  if (noSafe) steps.push(step("create", "setup", "Set up your account", "One time. Creates your Yield AI Safe on Solana.", (h) => createSafe(owner(), h)));
  if (strategy === "flexible") {
    const apy = useKaminoYield.getState().apy;
    steps.push(step("kamino", "deposit", `Deposit ${moneyAuto(amount)}`, `USDC into Kamino${apy !== null ? ` · ${pctText(apy)} APY` : ""}`, (h) => kaminoInvest(owner(), amount, h)));
  } else {
    if (noSafe || st.exponent?.setupRequired !== false) {
      steps.push(step("exp-setup", "setup", "Open your fixed rate", "One time. Prepares your fixed-rate position.", (h) => exponentSetup(owner(), h)));
    }
    steps.push(
      step("exp-buy", "lock", `Lock ${moneyAuto(amount)}`, `Fixed rate until ${FIXED_UNTIL}`, (h) => exponentInvest(owner(), amount, h), (p) => {
        const apy = Number(p.plan.quote?.maturityPreview?.netApyAfterCurrentDexAndFutureProfitFee);
        return Number.isFinite(apy) && apy > 0 ? `About ${pctText(apy)} a year until ${FIXED_UNTIL}` : "";
      }),
    );
  }
  return steps;
}

export type WithdrawSource = "flexible" | "fixed";

/** Withdraw steps. Flexible on Mainnet redeems Kamino (and sweeps idle USDC on "All"). */
export function liveWithdrawSteps(source: WithdrawSource, amount: number, all: boolean, available: number): TxStep[] {
  const title = all ? "Withdraw all" : `Withdraw ${moneyAuto(amount)}`;
  if (MAINNET && source === "fixed") {
    const percent = all ? null : Math.min(100, (amount / available) * 100).toFixed(2);
    return [
      step("exp-sell", "withdraw", title, `Sells your fixed-rate position before ${FIXED_UNTIL} at the market price`, (h) =>
        exponentExit(owner(), percent === null ? { all: true } : { percent }, h), (p) =>
        p.plan.minimumOutputRaw ? `At least ${moneyAuto(Number(p.plan.minimumOutputRaw) / 1e6)} to your wallet` : ""),
    ];
  }
  const st = useSafe.getState();
  const kamino = MAINNET && st.kamino && st.kamino.sharesRaw !== "0" ? Number(st.kamino.principalUsdc) : 0;
  if (kamino > 0) {
    const percent = all ? null : Math.min(100, (amount / kamino) * 100).toFixed(2);
    return [
      step("kamino-out", "withdraw", title, "From Kamino to your wallet", (h) =>
        kaminoWithdraw(owner(), percent === null ? { all: true } : { percent }, h)),
    ];
  }
  return [
    {
      id: "chain-withdraw",
      kind: "withdraw",
      title,
      detail: "USDC from your Safe to your wallet",
      run: (onPhase, setDetail) =>
        runOperation({ kind: "withdraw", amountUsd: amount, all }, owner(), {
          onPhase,
          onPlan: (p) => setDetail(`${moneyAuto(Number(p.amount))} to your wallet. ${costLine(p)}`),
        }, defaultDeps),
    },
  ];
}

const DAY = 86_400_000;

/**
 * Strategy copy and rates for the screens. Mainnet: Flexible is Kamino at its published APY,
 * Fixed is the Exponent PT until maturity (its rate comes with the quote, so it shows as unknown here).
 */
export function useStrategy(id: StrategyId): Strategy {
  const apy = useKaminoYield((s) => s.apy);
  const fixedApr = useFixedYield((s) => s.apr);
  const base = STRATEGIES[id];
  if (!MAINNET) return base;
  // Kamino publishes APY; Exponent's label rate is APR.
  if (id === "flexible") return { ...base, pickerSub: "Kamino · variable rate", apr: apy ?? NaN, aprLabel: "APY" };
  return {
    ...base,
    name: "Fixed",
    sub: `Until ${FIXED_UNTIL}`,
    pickerSub: `Exponent · until ${FIXED_UNTIL}`,
    apr: fixedApr ?? NaN,
    aprLabel: "FIXED APR",
    lockDays: Math.max(1, Math.ceil((EXPONENT_MATURITY - Date.now()) / DAY)),
  };
}
