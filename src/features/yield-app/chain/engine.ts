import { Buffer } from "buffer";
import { WalletError, getDriver } from "../wallet";
import { SafeApiError, assertNetwork, safeApi, sol, usdcString, type Cost, type PlanResponse, type ReadyPlan, type SafeApi, type TxStatus } from "./api";
import { CLUSTER, DEVNET, EXPECTED_NETWORK } from "./config";
import { isResolved, loadJournal, openEntry, putEntry, updateEntry, useJournal, type JournalEntry, type OpKind } from "./journal";
import { blockHeight, sendRaw } from "./rpc";
import { TxCheckError, checkSigned, checkUnsigned } from "./tx";

/**
 * One signed transaction: plan → check → wallet signs → journal → send → confirm.
 * The wallet only signs; the app sends the exact signed bytes itself so they are on disk first.
 * Multi-step protocol flows (protocols.ts) chain several of these.
 */

export type OperationInput = { kind: "deposit" | "withdraw"; amountUsd: number; all?: boolean };
export type PlanInfo = { op: OpKind; amount: string; cost: Cost; plan: ReadyPlan };
export type Phase = "signing" | "submitting";
export type Hooks = { onPlan?: (p: PlanInfo) => void; onPhase: (p: Phase) => void };

export type Deps = {
  api: SafeApi;
  /** Reconnects the wallet before planning: the blockhash clock starts with the plan. */
  prepare: () => Promise<void>;
  /** base64 unsigned → base64 signed */
  sign: (txBase64: string) => Promise<string>;
  /** base64 signed → signature; throws on RPC errors */
  send: (txBase64: string, opts?: { skipPreflight?: boolean }) => Promise<string>;
  /** Current block height of the RPC the app sends to. */
  blockHeight: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  pollMs: number;
  /** Give up waiting (the entry stays open and is checked again later). */
  maxWaitMs: number;
};

export const defaultDeps: Deps = {
  api: safeApi,
  prepare: () => getDriver().prepareSigning(),
  sign: (tx) => getDriver().signTransaction(tx),
  send: sendRaw,
  blockHeight,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs: 2000,
  maxWaitMs: 120_000,
};

const UNCONFIRMED_MSG = "We couldn't confirm this transaction yet. It may still go through. Check your balance before trying again.";
const SOL_NAME = DEVNET ? "devnet SOL" : "SOL";
const SOL_HINT = DEVNET ? " Top up at faucet.solana.com." : "";

export function friendlyError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  if (e instanceof TxCheckError) return new WalletError("FAILED", `Stopped before signing: ${e.message}`);
  if (e instanceof SafeApiError) {
    const d = e.details as any;
    switch (e.code) {
      case "INSUFFICIENT_SOL": {
        const need = d?.cost?.totalLamports ?? d?.requiredLamports;
        const have = d?.cost?.walletSolLamports;
        if (need && have) return new WalletError("FAILED", `Not enough ${SOL_NAME} for fees: need ${sol(need)}, you have ${sol(have)}.${SOL_HINT}`);
        if (need) return new WalletError("FAILED", `Not enough ${SOL_NAME} for fees: need ${sol(need)}.${SOL_HINT}`);
        return new WalletError("FAILED", `Not enough ${SOL_NAME} for fees.${SOL_HINT}`);
      }
      case "INSUFFICIENT_USDC":
        return new WalletError("FAILED", `Not enough USDC${d?.availableUsdc ? `: available ${Number(d.availableUsdc)}` : ""}.`);
      case "AMOUNT_BELOW_MINIMUM":
        return new WalletError("FAILED", "That's below the minimum. Use at least $1.");
      case "SAFE_NOT_CREATED":
        return new WalletError("FAILED", "Your Safe isn't confirmed yet. Wait a moment and try again.");
      case "SIMULATION_FAILED":
        return new WalletError("FAILED", "The transaction wouldn't go through right now. Try again.");
      case "KAMINO_UNAVAILABLE":
      case "LOOKUP_TABLE_UNAVAILABLE":
        return new WalletError("FAILED", "Kamino can't take this right now. Try again in a minute.");
      case "EXPONENT_UNAVAILABLE":
      case "EXPONENT_ROUTE_UNAVAILABLE":
        return new WalletError("FAILED", "The fixed-rate market isn't available right now. Try again later.");
      case "INSUFFICIENT_SHARES":
      case "INSUFFICIENT_PT":
        return new WalletError("FAILED", "Your position is smaller than that. Refresh and try again.");
      default:
        return new WalletError("FAILED", e.message);
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new WalletError("UNKNOWN", msg || "Something went wrong.");
}

/** A response the wallet may sign: right network, ready, one step, only the owner signs and pays. */
export function readyPlan(res: PlanResponse, owner: string): ReadyPlan {
  if (res.state) assertNetwork(res.state.network);
  if (res.status !== "ready") throw new WalletError("FAILED", "Nothing to sign. Refresh and try again.");
  const signers = res.steps[0]?.requiredSigners;
  if (res.steps.length !== 1 || (signers && (signers.length !== 1 || signers[0] !== owner)) || res.cost.feePayer !== owner) {
    throw new WalletError("FAILED", "Stopped before signing: unexpected transaction plan.");
  }
  return res;
}

async function corePlan(input: OperationInput, owner: string, api: SafeApi): Promise<{ op: OpKind; plan: ReadyPlan }> {
  let op: OpKind;
  let res;
  if (input.kind === "withdraw") {
    op = "withdraw";
    res = await api.withdrawalPlan(owner, input.all ? "all" : usdcString(input.amountUsd));
  } else {
    const amount = usdcString(input.amountUsd);
    const safe = await api.safe(owner);
    assertNetwork(safe.network);
    op = "deposit";
    if (!safe.exists) {
      // Creation and the first deposit go in one transaction and one signature.
      res = await api.creationPlan(owner, amount);
      op = "create";
      if (res.status === "already_exists") {
        op = "deposit";
        res = await api.depositPlan(owner, amount);
      }
    } else {
      res = await api.depositPlan(owner, amount);
    }
  }
  if (res.status === "empty") throw new WalletError("FAILED", "Nothing to withdraw. Your Safe has no idle USDC.");
  return { op, plan: readyPlan(res, owner) };
}

function isPreflightRejection(msg: string) {
  // -32002 preflight simulation failed, -32003 signature verification failed: the node did not broadcast.
  return /Solana RPC -3200[23]\b/.test(msg) && !/already been processed/i.test(msg);
}

/** The RPC node is behind the one that built the plan: the blockhash is fresh, just not seen there yet. */
const BLOCKHASH_LAG = /Blockhash not found/i;
const LAG_RETRIES = 6;

/**
 * Sends the saved bytes. The first send reports a definite rejection; re-sends skip preflight
 * (the status polling decides) and ignore errors.
 */
async function broadcast(entry: JournalEntry, deps: Deps, first: boolean) {
  try {
    if (first) await sendWithLagRetry(entry, deps);
    else await deps.send(entry.signedTx, { skipPreflight: true });
    if (entry.status === "signed") await updateEntry(entry.id, { status: "submitted" });
  } catch (e) {
    if (e instanceof WalletError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/already been processed/i.test(msg)) {
      if (entry.status === "signed") await updateEntry(entry.id, { status: "submitted" });
      return;
    }
    if (first && isPreflightRejection(msg)) {
      await updateEntry(entry.id, { status: "failed", error: msg });
      throw new WalletError("FAILED", `Solana rejected the transaction. No funds moved. (${msg.replace(/^Solana RPC -?\d+:\s*/, "").slice(0, 140)})`);
    }
    // Network trouble: the status polling below finds out, and re-sends while the blockhash is valid.
  }
}

async function sendWithLagRetry(entry: JournalEntry, deps: Deps) {
  for (let i = 0; ; i++) {
    try {
      return await deps.send(entry.signedTx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!BLOCKHASH_LAG.test(msg)) throw e;
      // Not proof that nothing was sent: the public RPC has been seen forwarding the transaction
      // anyway and it landed. The status polling decides; past lastValidBlockHeight stop re-sending.
      const height = await heightNear(entry.lastValidBlockHeight, deps);
      log("blockhash not found", { try: i, height, lastValid: entry.lastValidBlockHeight });
      if (height !== null && height > entry.lastValidBlockHeight) return;
      // Still lagging after a few seconds: hand it to the leader without preflight.
      if (i >= LAG_RETRIES) return await deps.send(entry.signedTx, { skipPreflight: true });
      await deps.sleep(1500);
    }
  }
}

/**
 * A plan lives ~150 blocks. A height thousands of blocks away from its lastValidBlockHeight is a
 * misreporting RPC (e.g. a slot number), not an expiry: ignore it and let the status polling decide.
 */
const PLAUSIBLE_BLOCKS = 5000;
async function heightNear(lastValid: number, deps: Deps): Promise<number | null> {
  const h = await deps.blockHeight().catch(() => null);
  if (h === null || Math.abs(h - lastValid) > PLAUSIBLE_BLOCKS) {
    if (h !== null) log("implausible block height ignored", { height: h, lastValid });
    return null;
  }
  return h;
}

function log(event: string, data?: object) {
  console.log(`[chain] ${event}`, data ? JSON.stringify(data) : "");
}

const current = (id: string) => useJournal.getState().entries.find((e) => e.id === id)!;

/**
 * Polls the saved signature until `until` (or finalized). Throws FAILED for a failed
 * transaction and UNCONFIRMED when the result can't be known.
 */
export async function settle(id: string, until: "confirmed" | "finalized", deps: Deps = defaultDeps): Promise<JournalEntry> {
  const started = Date.now();
  for (let poll = 0; ; poll++) {
    const e = current(id);
    let st: TxStatus | null = null;
    try {
      st = await deps.api.txStatus(e.signature, e.lastValidBlockHeight);
    } catch {
      // Status API unreachable: keep trying until maxWaitMs.
    }
    if (st) {
      const failed = st.status === "failed" || (!!st.error && (st.status === "confirmed" || st.status === "finalized"));
      if (failed) {
        await updateEntry(id, { status: "failed", error: typeof st.error === "string" ? st.error : JSON.stringify(st.error) });
        throw new WalletError("FAILED", "The transaction failed on Solana. No funds moved.");
      }
      if (st.status === "finalized") return (await updateEntry(id, { status: "finalized", error: undefined }))!;
      if (st.status === "confirmed") {
        const next = e.status === "confirmed" ? e : (await updateEntry(id, { status: "confirmed" }))!;
        if (until === "confirmed") return next;
      } else if (st.status === "processed") {
        if (e.status === "signed" || e.status === "submitted") await updateEntry(id, { status: "processed" });
      } else if (st.status === "unknown_or_expired") {
        await updateEntry(id, { status: "unknown" });
        throw new WalletError("UNCONFIRMED", UNCONFIRMED_MSG);
      } else if (st.status === "pending" && !st.blockhashExpired && poll % 3 === 0 && poll > 0) {
        await broadcast(current(id), deps, false);
      }
    }
    if (Date.now() - started > deps.maxWaitMs) throw new WalletError("UNCONFIRMED", UNCONFIRMED_MSG);
    await deps.sleep(deps.pollMs);
  }
}

/** Re-checks an unresolved entry (after a restart, or before a new operation). Never throws. */
export async function reconcile(entry: JournalEntry, deps: Deps = defaultDeps): Promise<JournalEntry> {
  try {
    if (entry.status === "signed") await broadcast(entry, deps, false);
    await settle(entry.id, "finalized", deps);
  } catch {
    // The entry keeps its status; the UI shows it.
  }
  return current(entry.id);
}

/** Refuses to start while an earlier transaction of this wallet is unsettled. */
export async function ensureNothingOpen(owner: string, deps: Deps) {
  await loadJournal();
  // Confirmed without error is final enough to build the next step on (finality follows in ~15 s).
  const open = useJournal
    .getState()
    .entries.filter((e) => e.owner === owner && !isResolved(e) && e.status !== "confirmed")
    .pop();
  if (!open) return;
  const after = await reconcile(open, { ...deps, maxWaitMs: Math.min(deps.maxWaitMs, 30_000) });
  if (!isResolved(after)) {
    throw new WalletError(
      "PENDING",
      after.status === "unknown"
        ? "We couldn't confirm your last transaction. Check it on the home screen before starting a new one."
        : "Your last transaction is still confirming. Try again in a moment.",
    );
  }
}

export type PlanMeta = { op: OpKind; amount: string; amountUsd: number; returnFor?: string };

/** Checks, signs, journals, sends and confirms one ready plan. Resolves with the confirmed entry. */
export async function executePlan(p: ReadyPlan, meta: PlanMeta, owner: string, hooks: Hooks, deps: Deps = defaultDeps): Promise<JournalEntry> {
  const step = p.steps[0];
  hooks.onPlan?.({ op: meta.op, amount: meta.amount, cost: p.cost, plan: p });

  let signature: string;
  let signedTx: string;
  try {
    checkUnsigned(Buffer.from(step.transaction, "base64"), { owner, blockhash: p.blockhash, programId: EXPECTED_NETWORK.programId });
    hooks.onPhase("signing");
    const t0 = Date.now();
    log("plan", { op: meta.op, planId: p.planId, lastValid: p.lastValidBlockHeight });
    signedTx = await deps.sign(step.transaction);
    log("signed", { ms: Date.now() - t0 });
    signature = checkSigned(signedTx, { owner, blockhash: p.blockhash });
  } catch (e) {
    throw friendlyError(e);
  }

  // Wallets here only sign, so nobody has sent it yet. Past lastValidBlockHeight it can never land:
  // say so plainly instead of leaving an "unknown" transfer (Devnet gives ~30 s to approve).
  const height = await heightNear(p.lastValidBlockHeight, deps);
  if (height !== null && height > p.lastValidBlockHeight) {
    log("expired before send", { height, lastValid: p.lastValidBlockHeight });
    throw new WalletError("FAILED", "Approval took too long and the transaction expired before it was sent. Nothing moved. Try again and approve right away.");
  }
  // Exponent quotes expire on their own (~90 s); a stale one isn't sent.
  if (p.quoteExpiresAtUnixSeconds && Date.now() / 1000 > p.quoteExpiresAtUnixSeconds) {
    log("quote expired before send", { expiresAt: p.quoteExpiresAtUnixSeconds });
    throw new WalletError("FAILED", "The price quote expired before it was sent. Nothing moved. Try again and approve right away.");
  }

  const now = Date.now();
  const entry: JournalEntry = {
    id: signature,
    op: meta.op,
    amount: meta.amount,
    amountUsd: meta.amountUsd,
    owner,
    cluster: CLUSTER,
    planId: p.planId,
    signature,
    signedTx,
    blockhash: p.blockhash,
    lastValidBlockHeight: p.lastValidBlockHeight,
    createdAt: now,
    updatedAt: now,
    status: "signed",
    ...(meta.returnFor ? { returnFor: meta.returnFor } : {}),
  };
  try {
    await putEntry(entry);
  } catch {
    throw new WalletError("FAILED", "Couldn't save the signed transaction on this phone, so it wasn't sent. Try again.");
  }

  hooks.onPhase("submitting");
  await broadcast(entry, deps, true);
  const confirmed = await settle(entry.id, "confirmed", deps);
  // Finalization continues in the background; new operations wait for it.
  settle(entry.id, "finalized", deps).catch(() => {});
  return confirmed;
}

/** Idle USDC: wallet → Safe (creating it with the first deposit) or Safe → wallet. */
export async function runOperation(input: OperationInput, owner: string, hooks: Hooks, deps: Deps = defaultDeps): Promise<string> {
  await ensureNothingOpen(owner, deps);
  let planned;
  try {
    hooks.onPhase("signing");
    await deps.prepare();
    planned = await corePlan(input, owner, deps.api);
  } catch (e) {
    throw friendlyError(e);
  }
  const { op, plan: p } = planned;
  const amount = input.kind === "withdraw" && input.all ? "all" : (p.amount ?? p.initialDepositUsdc ?? "");
  const amountUsd = Number(p.amount ?? p.initialDepositUsdc ?? input.amountUsd);
  const entry = await executePlan(p, { op, amount, amountUsd }, owner, hooks, deps);
  return entry.signature;
}
