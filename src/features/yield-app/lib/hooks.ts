import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useApp } from "./store";
import { computePortfolio } from "./portfolio";
import { DEVNET } from "../devnet/config";
import { useSafeBalances } from "../devnet/state";

/** True once the persisted store has been read from AsyncStorage. */
export function useHydrated() {
  return useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
  );
}

/** The ledger shown to the user. On Devnet: only the connected wallet's own transfers, no mock agent. */
export function useLedger() {
  const events = useApp((s) => s.events);
  const owner = useApp((s) => s.wallet?.address);
  return useMemo(() => (DEVNET ? events.filter((e) => e.src === "account" && e.owner === owner) : events), [events, owner]);
}

export function usePortfolio() {
  const events = useLedger();
  const now = useNow(60_000);
  const chain = useSafeBalances();
  const idle = chain?.idleUsdc ?? 0;
  return useMemo(() => {
    if (!DEVNET) return computePortfolio(events, now);
    // Devnet: the balance is the Safe's idle USDC on chain; history comes from the ledger, no yield.
    const p = computePortfolio(events, now, { accrue: false });
    return { ...p, flexible: idle, fixed: [], fixedTotal: 0, total: idle, apr: 0, earnedWeek: 0, hasPositions: idle > 0 };
  }, [events, now, idle]);
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
