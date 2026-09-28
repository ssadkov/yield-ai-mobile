import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useApp } from "./store";
import { computePortfolio } from "./portfolio";

/** True once the persisted store has been read from AsyncStorage. */
export function useHydrated() {
  return useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
  );
}

export function usePortfolio() {
  const events = useApp((s) => s.events);
  const now = useNow(60_000);
  return useMemo(() => computePortfolio(events, now), [events, now]);
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
