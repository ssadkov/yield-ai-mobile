import type { AccountEvent, LedgerEvent } from "./store";
import { STRATEGIES } from "./strategies";
import { MONTHS, addDays, daysBetween, monthDay, startOfDay } from "./format";

/**
 * Mock accrual model. TODO(backend): replace with positions + earnings history API.
 * Each position earns principal × APR / 365 per full day, with a small deterministic
 * wobble on Flexible so the daily chart looks like a variable rate.
 */

export type DayPoint = { day: number; earned: number; added: number; withdrew: number };

export type FixedPosition = {
  id: string;
  amount: number;
  earned: number;
  unlockAt: number;
  openedAt: number;
};

export type Portfolio = {
  flexible: number;
  fixed: FixedPosition[];
  fixedTotal: number;
  total: number;
  /** Weighted APR across positions (Flexible APR when empty) */
  apr: number;
  earnedWeek: number;
  days: DayPoint[];
  hasPositions: boolean;
  firstDepositAt: number | null;
};

function wobble(day: number) {
  const x = Math.sin(day / 86_400_000) * 10_000;
  return 0.8 + 0.4 * (x - Math.floor(x));
}

export function computePortfolio(events: LedgerEvent[], now = Date.now(), opts: { accrue?: boolean } = {}): Portfolio {
  const accrue = opts.accrue ?? true;
  const account = events
    .filter((e): e is AccountEvent => e.src === "account")
    .sort((a, b) => a.ts - b.ts);
  const today = startOfDay(now);
  const firstTs = account[0]?.ts ?? null;
  const start = firstTs ? startOfDay(firstTs) : today;
  const nDays = daysBetween(start, today) + 1;

  let flex = 0;
  const fixed: FixedPosition[] = [];
  const days: DayPoint[] = [];
  let i = 0;

  const flexApr = STRATEGIES.flexible.apr;
  const fixedApr = STRATEGIES.fixed.apr;

  for (let d = 0; d < nDays; d++) {
    const day = addDays(start, d);
    const next = addDays(start, d + 1);
    // Earnings accrue on the balance held at the start of the day.
    const eFlex = accrue ? flex * (flexApr / 365) * wobble(day) : 0;
    let eFixed = 0;
    for (const p of fixed) {
      if (day < p.unlockAt) {
        const e = accrue ? p.amount * (fixedApr / 365) : 0;
        p.earned += e;
        eFixed += e;
      }
    }
    flex += eFlex;
    const point: DayPoint = { day, earned: eFlex + eFixed, added: 0, withdrew: 0 };
    while (i < account.length && account[i].ts < next) {
      const ev = account[i++];
      if (ev.kind === "deposit") {
        point.added += ev.amount;
        if (ev.strategy === "fixed") {
          fixed.push({ id: ev.id, amount: ev.amount, earned: 0, unlockAt: ev.unlockAt ?? addDays(ev.ts, 100), openedAt: ev.ts });
        } else {
          flex += ev.amount;
        }
      } else {
        point.withdrew += ev.amount;
        flex = Math.max(0, flex - ev.amount);
      }
    }
    days.push(point);
  }

  const fixedTotal = fixed.reduce((s, p) => s + p.amount + p.earned, 0);
  const total = flex + fixedTotal;
  const apr = total > 0 ? (flex * flexApr + fixedTotal * fixedApr) / total : flexApr;
  const earnedWeek = days.slice(-7).reduce((s, p) => s + p.earned, 0);

  return {
    flexible: round2(flex),
    fixed: fixed.map((p) => ({ ...p, earned: round2(p.earned) })),
    fixedTotal: round2(fixedTotal),
    total: round2(total),
    apr,
    earnedWeek,
    days,
    hasPositions: total > 0.004,
    firstDepositAt: firstTs,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/* ——— Chart ranges ——— */

export type Range = "1W" | "1M" | "1Y" | "All";
export const RANGES: Range[] = ["1W", "1M", "1Y", "All"];

export type Bucket = DayPoint & { label: string; aria: string };

function sum(points: DayPoint[], day: number, label: string): Bucket {
  const b = points.reduce(
    (acc, p) => ({ ...acc, earned: acc.earned + p.earned, added: acc.added + p.added, withdrew: acc.withdrew + p.withdrew }),
    { day, earned: 0, added: 0, withdrew: 0 },
  );
  return { ...b, label, aria: `${label}, earned $${b.earned.toFixed(2)}` };
}

/** Pads the history with empty days so short histories still fill the chart. */
function lastNDays(days: DayPoint[], n: number, now: number): DayPoint[] {
  const today = startOfDay(now);
  const byDay = new Map(days.map((p) => [p.day, p]));
  return Array.from({ length: n }, (_, k) => {
    const day = addDays(today, k - n + 1);
    return byDay.get(day) ?? { day, earned: 0, added: 0, withdrew: 0 };
  });
}

function weekly(points: DayPoint[], weeks: number): Bucket[] {
  const out: Bucket[] = [];
  for (let w = 0; w < weeks; w++) {
    const chunk = points.slice(w * 7, w * 7 + 7);
    if (!chunk.length) continue;
    const a = chunk[0].day;
    const b = chunk[chunk.length - 1].day;
    const sameMonth = new Date(a).getMonth() === new Date(b).getMonth();
    const label = sameMonth ? `${monthDay(a)}–${new Date(b).getDate()}` : `${monthDay(a)}–${monthDay(b)}`;
    out.push(sum(chunk, a, label));
  }
  return out;
}

function monthly(points: DayPoint[], months: number, now: number): Bucket[] {
  const cur = new Date(now);
  const out: Bucket[] = [];
  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(cur.getFullYear(), cur.getMonth() - m, 1);
    const inMonth = points.filter((p) => {
      const pd = new Date(p.day);
      return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
    });
    const label = MONTHS[d.getMonth()] + (months > 12 ? ` ’${String(d.getFullYear()).slice(2)}` : "");
    out.push(sum(inMonth, d.getTime(), label));
  }
  return out;
}

export function bucketize(days: DayPoint[], range: Range, now = Date.now()): Bucket[] {
  switch (range) {
    case "1W":
      return lastNDays(days, 7, now).map((p) => sum([p], p.day, monthDay(p.day)));
    case "1M":
      return weekly(lastNDays(days, 28, now), 4);
    case "1Y":
      return monthly(days, 12, now);
    case "All": {
      const span = days.length;
      if (span <= 7) return bucketize(days, "1W", now);
      if (span <= 49) return weekly(lastNDays(days, Math.ceil(span / 7) * 7, now), Math.ceil(span / 7));
      const first = new Date(days[0].day);
      const cur = new Date(now);
      const months = (cur.getFullYear() - first.getFullYear()) * 12 + cur.getMonth() - first.getMonth() + 1;
      return monthly(days, months, now);
    }
  }
}
