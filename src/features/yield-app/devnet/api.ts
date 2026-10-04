import { API_BASE, CLUSTER, EXPECTED_NETWORK } from "./config";

/** Yield AI Solana Safe API v1 (docs/yield-ai-v2-solana-safe-api.md in yield-ai-os-sol). */

export type Network = { cluster: string; chain: string; genesis: string; programId: string; usdcMint: string };

export type SafeState = {
  owner: { type: "solana"; address: string };
  network: Network;
  safe: string;
  usdcAta: string;
  exists: boolean;
  usdcAccountExists: boolean;
  /** lamports */
  walletSolLamports: string;
  /** USDC, six decimals */
  idleUsdc: string;
  ownerUsdcAta: string;
  walletUsdc: string;
  updatedAt: number;
};

export type Cost = {
  rentLamports: string;
  networkFeeLamports: string;
  totalLamports: string;
  walletSolLamports: string;
  feePayer: string;
  priorityFeeLamports: string;
};

export type PlanStep = { id: string; kind: string; title: string; transaction: string; transactionVersion?: number; requiredSigners?: string[] };

export type ReadyPlan = {
  status: "ready";
  planId: string;
  state: SafeState;
  cost: Cost;
  blockhash: string;
  lastValidBlockHeight: number;
  steps: PlanStep[];
  createdAt: number;
  /** deposit / withdraw */
  amount?: string;
  /** creation with a first deposit */
  initialDepositUsdc?: string;
};

export type PlanResponse = ReadyPlan | { status: "already_exists" | "empty"; state: SafeState; steps: [] };

export type TxStatusValue = "pending" | "processed" | "confirmed" | "finalized" | "failed" | "unknown_or_expired";

export type TxStatus = {
  signature: string;
  network: Network;
  status: TxStatusValue;
  error: unknown;
  blockhashExpired?: boolean;
  reconciliationRequired?: boolean;
};

export type Config = { version: number; network: Network; capabilities: Record<string, unknown> };

export class SafeApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 0,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SafeApiError";
  }
}

const TIMEOUT_MS = 20_000;

async function request<T>(path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new SafeApiError("NETWORK", "Can't reach Yield AI. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON error page.
  }
  if (!res.ok || json?.error) {
    const e = json?.error;
    throw new SafeApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? `Yield AI API error ${res.status}`, res.status, e?.details);
  }
  return json as T;
}

/** Refuses anything that is not the pinned Devnet program and mint. */
export function assertNetwork(net: Network | undefined) {
  const bad = (Object.keys(EXPECTED_NETWORK) as (keyof Network)[]).find((k) => net?.[k] !== EXPECTED_NETWORK[k]);
  if (bad) throw new SafeApiError("NETWORK_MISMATCH", `The server answered for a different network (${bad}). Nothing was signed.`);
}

const owner = (address: string) => ({ type: "solana" as const, address });

export const safeApi = {
  config: () => request<Config>("/config"),
  safe: (address: string) => request<SafeState>(`/safes?ownerType=solana&address=${encodeURIComponent(address)}&cluster=${CLUSTER}`),
  creationPlan: (address: string, initialDepositUsdc?: string) =>
    request<PlanResponse>("/safes/creation-plan", { cluster: CLUSTER, owner: owner(address), ...(initialDepositUsdc ? { initialDepositUsdc } : {}) }),
  depositPlan: (address: string, amount: string) => request<PlanResponse>("/deposits/plan", { cluster: CLUSTER, owner: owner(address), amount }),
  withdrawalPlan: (address: string, amount: string) => request<PlanResponse>("/withdrawals/plan", { cluster: CLUSTER, owner: owner(address), amount }),
  txStatus: (signature: string, lastValidBlockHeight: number) =>
    request<TxStatus>(`/transactions/${encodeURIComponent(signature)}?cluster=${CLUSTER}&lastValidBlockHeight=${lastValidBlockHeight}`),
};

export type SafeApi = typeof safeApi;

/** "1.5" for 1.5. The API takes positive decimal strings with at most six decimals. */
export function usdcString(n: number): string {
  if (!Number.isFinite(n) || n <= 0) throw new SafeApiError("INVALID_AMOUNT", "Enter an amount above zero.");
  const s = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (s === "0") throw new SafeApiError("INVALID_AMOUNT", "Enter an amount above zero.");
  return s;
}

export function sol(lamports: string | number | undefined) {
  const n = Number(lamports ?? 0) / 1e9;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL`;
}
