
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StrategyId } from "./strategies";
import { STRATEGIES } from "./strategies";
import type { WalletId } from "../wallet/types";
import { addDays, startOfDay } from "./format";
import { DEVNET } from "../devnet/config";

export type ConnectedWallet = { id: WalletId; name: string; address: string };

export type AccountEvent = {
  id: string;
  src: "account";
  kind: "deposit" | "withdraw";
  strategy: StrategyId;
  amount: number;
  ts: number;
  txIds: string[];
  first?: boolean;
  /** Fixed deposits only */
  unlockAt?: number;
  /** Wallet that made it (Devnet keeps one history per wallet). */
  owner?: string;
};

export type AgentEvent = {
  id: string;
  src: "agent";
  kind: "action" | "check";
  title: string;
  /** Short line in the feed */
  detail: string;
  /** Longer reason on the agent log */
  why: string;
  delta?: string;
  /** Token icons for the pair, e.g. ["usd1", "usdc"] */
  coins?: [string, string];
  txCount?: number;
  ts: number;
};

export type LedgerEvent = AccountEvent | AgentEvent;

export type Withdrawal = {
  id: string;
  amount: number;
  to: string;
  requestedAt: number;
  txId: string;
  completedAt?: number;
};

export type MockApproval = "ask" | "auto";

type State = {
  onboarded: boolean;
  wallet: ConnectedWallet | null;
  /** USDC sitting in the user's wallet (mock). TODO(backend): read from /api/solana/portfolio */
  walletUsdc: number;
  events: LedgerEvent[];
  withdrawals: Record<string, Withdrawal>;
  mockApproval: MockApproval;
};

type Actions = {
  setOnboarded: () => void;
  connect: (w: ConnectedWallet) => void;
  disconnect: () => void;
  recordDeposit: (d: { strategy: StrategyId; amount: number; txIds: string[]; agent?: boolean }) => AccountEvent;
  requestWithdrawal: (d: { amount: number; txIds: string[] }) => Withdrawal;
  completeWithdrawal: (id: string) => void;
  setMockApproval: (m: MockApproval) => void;
  loadDemo: () => void;
  reset: () => void;
};

export const MOCK_WALLET_USDC = 1240;
export const DEMO_ADDRESS = "7xQpB8mZt3kVn2cRwJ5hLd9sYfE4aUoG6iNvKr1m4Ld";

export function uid(prefix = "") {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return prefix + r.slice(0, 16);
}

const initial: State = {
  onboarded: false,
  wallet: null,
  walletUsdc: 0,
  events: [],
  withdrawals: {},
  mockApproval: "ask",
};

export const useApp = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      setOnboarded: () => set({ onboarded: true }),

      connect: (wallet) =>
        set((s) => ({
          wallet,
          onboarded: true,
          // Fresh mock wallet gets spendable USDC once.
          walletUsdc: s.wallet || s.events.length ? s.walletUsdc : MOCK_WALLET_USDC,
        })),

      disconnect: () => set({ wallet: null }),

      recordDeposit: ({ strategy, amount, txIds, agent: withAgent = true }) => {
        const now = Date.now();
        const owner = get().wallet?.address;
        const first = !get().events.some((e) => e.src === "account" && e.kind === "deposit" && (!DEVNET || e.owner === owner));
        const dep: AccountEvent = {
          id: uid("dep_"),
          src: "account",
          kind: "deposit",
          strategy,
          amount,
          ts: now,
          txIds,
          first,
          owner,
          unlockAt: strategy === "fixed" ? addDays(now, STRATEGIES.fixed.lockDays!) : undefined,
        };
        // TODO(backend): agent actions come from the agent log API.
        const agent: AgentEvent = {
          id: uid("agt_"),
          src: "agent",
          kind: "action",
          title: strategy === "fixed" ? "Locked a fixed rate" : "Moved new USDC into loops",
          detail:
            strategy === "fixed"
              ? `${fmt(amount)} at ${(STRATEGIES.fixed.apr * 100).toFixed(2)}% for 100 days`
              : `${fmt(amount)} split across 3 loops`,
          why:
            strategy === "fixed"
              ? `Received ${fmt(amount)} USDC and locked it at the fixed rate until maturity.`
              : `Received ${fmt(amount)} USDC. Split it across 3 stablecoin loops at the best current APR.`,
          coins: ["usdc", "usd1"],
          txCount: 3,
          ts: now + 60_000,
        };
        set((s) => ({ events: [...s.events, dep, ...(withAgent ? [agent] : [])], walletUsdc: Math.max(0, s.walletUsdc - amount) }));
        return dep;
      },

      requestWithdrawal: ({ amount, txIds }) => {
        const now = Date.now();
        const w: Withdrawal = {
          id: uid("wd_"),
          amount,
          to: get().wallet?.address ?? DEMO_ADDRESS,
          requestedAt: now,
          txId: txIds[0] ?? "",
        };
        const ev: AccountEvent = {
          id: w.id,
          src: "account",
          kind: "withdraw",
          strategy: "flexible",
          amount,
          ts: now,
          txIds,
          owner: get().wallet?.address,
        };
        set((s) => ({ events: [...s.events, ev], withdrawals: { ...s.withdrawals, [w.id]: w } }));
        return w;
      },

      completeWithdrawal: (id) =>
        set((s) => {
          const w = s.withdrawals[id];
          if (!w || w.completedAt) return s;
          return {
            withdrawals: { ...s.withdrawals, [id]: { ...w, completedAt: Date.now() } },
            walletUsdc: s.walletUsdc + w.amount,
          };
        }),

      setMockApproval: (mockApproval) => set({ mockApproval }),

      // Keeps a real connected wallet; the demo only fills history and balances.
      loadDemo: () => set((s) => {
        const demo = demoState();
        return { ...demo, wallet: s.wallet ?? demo.wallet, mockApproval: s.mockApproval };
      }),

      reset: () => set((s) => ({ ...initial, mockApproval: s.mockApproval })),
    }),
    {
      name: "yai-seeker-v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Demo portfolio that reproduces the design mocks (Home, Activity). Dates are relative to today. */
export function demoState(now = Date.now()): State {
  const today = startOfDay(now);
  const at = (daysAgo: number, h: number, m: number) => addDays(today, -daysAgo) + (h * 60 + m) * 60_000;
  const act = (
    daysAgo: number,
    h: number,
    m: number,
    coins: [string, string],
    title: string,
    detail: string,
    why: string,
    delta?: string,
  ): AgentEvent => ({ id: uid("agt_"), src: "agent", kind: "action", title, detail, why, delta, coins, ts: at(daysAgo, h, m) });
  const idle = (daysAgo: number, h: number, detail: string, why: string): AgentEvent => ({
    id: uid("agt_"),
    src: "agent",
    kind: "check",
    title: "Checked, no action",
    detail,
    why,
    ts: at(daysAgo, h, 0),
  });

  const account = (kind: "deposit" | "withdraw", amount: number, ts: number, first?: boolean): AccountEvent => ({
    id: uid(kind === "deposit" ? "dep_" : "wd_"),
    src: "account",
    kind,
    strategy: "flexible",
    amount,
    ts,
    txIds: [uid("tx")],
    first,
  });

  const events: LedgerEvent[] = [
    account("deposit", 500, at(15, 18, 40), true),
    { ...act(15, 18, 42, ["usdc", "usd1"], "Deposit and first allocation", "$500 split across 3 loops", "Received $500 USDC. Split it across 3 stablecoin loops, Balanced risk."), txCount: 3 },
    account("deposit", 500, at(4, 11, 2)),
    act(4, 11, 5, ["usd1", "usd1"], "Moved new USDC into loops", "$500 split across 3 loops", "Received $500 USDC. Split it across the 3 loops to keep them balanced."),
    idle(3, 7, "All 3 loops on target", "All 3 loops within target. Current APRs still beat the alternatives."),
    act(3, 20, 5, ["echelon", "usd1"], "Compounded rewards", "+$0.40 into DLP / USD1", "Claimed rewards and added them to the DLP / USD1 loop.", "+$0.40"),
    act(2, 11, 20, ["usdc", "usd1"], "Re-looped USDC / USD1", "Leverage 3.9× → 4.0×", "Interest pushed leverage down to 3.9×. Borrowed and re-supplied to get back to the 4× target.", "3.9× → 4.0×"),
    account("withdraw", 20, at(2, 16, 10)),
    act(1, 16, 45, ["usdc", "usd1"], "Moved $120 to a higher APR", "USDC / USD1 → USD1 / USD1", "USD1 / USD1 paid 0.8% more after costs. Moved $120 there.", "$120"),
    act(1, 21, 10, ["usd1", "usd1"], "Compounded rewards", "+$0.39 into USD1 / USD1", "Claimed rewards and added them to the USD1 / USD1 loop.", "+$0.39"),
    idle(0, 8, "All 3 loops on target", "All 3 loops within target. Current APRs still beat the alternatives."),
    act(0, 9, 15, ["usdc", "usd1"], "Compounded rewards", "+$0.42 into USDC / USD1", "Claimed rewards and added them to the USDC / USD1 loop.", "+$0.42"),
    act(0, 14, 2, ["usd1", "usd1"], "Re-looped USD1 / USD1", "Leverage 3.8× → 4.0×", "Interest pushed leverage down to 3.8×. Borrowed and re-supplied to get back to the 4× target.", "3.8× → 4.0×"),
  ].filter((e) => e.ts <= now);

  return {
    onboarded: true,
    wallet: { id: "seed-vault", name: "Seed Vault", address: DEMO_ADDRESS },
    walletUsdc: MOCK_WALLET_USDC,
    events,
    withdrawals: {},
    mockApproval: "ask",
  };
}
