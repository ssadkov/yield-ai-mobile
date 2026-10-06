import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useApp } from "./store";
import { computePortfolio } from "./portfolio";
import { EXPONENT_MATURITY, LIVE } from "../chain/config";
import { useFixedYield, useKaminoYield, useSafeBalances } from "../chain/state";

/** True once the persisted store has been read from AsyncStorage. */
export function useHydrated() {
  return useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
  );
}

/** The ledger shown to the user. Live: only the connected wallet's own transfers, no mock agent. */
export function useLedger() {
  const events = useApp((s) => s.events);
  const owner = useApp((s) => s.wallet?.address);
  return useMemo(() => (LIVE ? events.filter((e) => e.src === "account" && e.owner === owner) : events), [events, owner]);
}

export function usePortfolio() {
  const events = useLedger();
  const now = useNow(60_000);
  const chain = useSafeBalances();
  const apy = useKaminoYield((s) => s.apy);
  const fixedApy = useFixedYield((s) => s.apy);
  const idle = chain?.idleUsdc ?? 0;
  const kamino = chain?.kaminoUsdc ?? 0;
  const fixed = chain?.fixedUsdc ?? 0;
  return useMemo(() => {
    if (!LIVE) return computePortfolio(events, now);
    // Live: balances come from chain (Kamino and PT at cost basis); history from the ledger, no simulated yield.
    const p = computePortfolio(events, now, { accrue: false });
    const flexible = idle + kamino;
    const positions = fixed > 0 ? [{ id: "exponent-pt", amount: fixed, earned: 0, unlockAt: EXPONENT_MATURITY, openedAt: 0 }] : [];
    const total = flexible + fixed;
    // Blended yearly rate over what's invested (Kamino APY, fixed-rate APY); idle USDC earns nothing.
    const earning = (kamino > 0 && apy !== null ? kamino : 0) + (fixed > 0 && fixedApy !== null ? fixed : 0);
    const blended = earning > 0 ? ((kamino > 0 && apy !== null ? kamino * apy : 0) + (fixed > 0 && fixedApy !== null ? fixed * fixedApy : 0)) / earning : NaN;
    return { ...p, flexible, fixed: positions, fixedTotal: fixed, total, apr: blended, earnedWeek: 0, hasPositions: total > 0.004 };
  }, [events, now, idle, kamino, fixed, apy, fixedApy]);
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
