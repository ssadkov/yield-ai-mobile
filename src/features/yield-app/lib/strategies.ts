export type StrategyId = "flexible" | "fixed";

export type Strategy = {
  id: StrategyId;
  name: string;
  /** Short line under the name */
  sub: string;
  /** Line under the name on the strategy picker */
  pickerSub: string;
  apr: number;
  aprLabel: "APR" | "FIXED APR";
  lockDays?: number;
};

// TODO(backend): Flexible APR must come from the live Solana yield source (variable).
// TODO(product): 14.00% for Fixed · 100 days is a design placeholder — real rate TBD.
export const STRATEGIES: Record<StrategyId, Strategy> = {
  flexible: {
    id: "flexible",
    name: "Flexible",
    sub: "Withdraw any time",
    pickerSub: "Variable rate",
    apr: 0.0632,
    aprLabel: "APR",
  },
  fixed: {
    id: "fixed",
    name: "Fixed · 100 days",
    sub: "Rate locked at deposit",
    pickerSub: "Rate locked at deposit",
    apr: 0.14,
    aprLabel: "FIXED APR",
    lockDays: 100,
  },
};

export function strategyGain(id: StrategyId, amount: number) {
  const s = STRATEGIES[id];
  return s.lockDays ? (amount * s.apr * s.lockDays) / 365 : amount * s.apr;
}
