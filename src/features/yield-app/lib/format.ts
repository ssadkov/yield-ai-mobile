const DAY = 86_400_000;

export function money(n: number, opts: { cents?: boolean } = {}) {
  const cents = opts.cents ?? true;
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return (
    (v < 0 ? "−$" : "$") +
    Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
  );
}

/** Like the design mocks: "$1,000" for whole amounts, "$1,004.80" otherwise. */
export function moneyAuto(n: number) {
  return money(n, { cents: Math.round(n * 100) % 100 !== 0 });
}

/** "$1,005" + ".04" for the big balance with small cents. */
export function splitMoney(n: number): [string, string] {
  const [whole, cents] = money(n).split(".");
  return [whole, "." + (cents ?? "00")];
}

export function shortAddress(address: string) {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, days: number) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function daysBetween(a: number, b: number) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

// Fixed names: locales disagree ("Sep" vs "Sept"), the design uses 3 letters.
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sep 21" */
export function monthDay(ts: number) {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "3 Jan" */
export function dayMonth(ts: number) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "3 Jan 2027" */
export function dayMonthYear(ts: number) {
  return `${dayMonth(ts)} ${new Date(ts).getFullYear()}`;
}

/** "14:02" */
export function clock(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Today / Yesterday / "Tue, 23 Sep" */
export function dayLabel(ts: number, now = Date.now()) {
  const diff = daysBetween(ts, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${WEEKDAYS[new Date(ts).getDay()]}, ${dayMonth(ts)}`;
}

export function relativeMinutes(ts: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function pct(apr: number) {
  return (apr * 100).toFixed(2) + "%";
}
