import { Buffer } from "buffer";
import { getBlockHeight, submitSignedTransaction } from "@/features/wallet-connection-solana";
import { WalletError, getDriver } from "../wallet";
import { SafeApiError, assertNetwork, safeApi, sol, usdcString, type Cost, type ReadyPlan, type SafeApi, type TxStatus } from "./api";
import { EXPECTED_NETWORK } from "./config";
import { isResolved, loadJournal, openEntry, putEntry, updateEntry, useJournal, type JournalEntry, type OpKind } from "./journal";
import { TxCheckError, checkSigned, checkUnsigned } from "./tx";

/**
 * One idle-USDC operation: plan → check → wallet signs → journal → send → confirm.
 * The wallet only signs; the app sends the exact signed bytes itself so they are on disk first.
 */

export type OperationInput = { kind: "deposit" | "withdraw"; amountUsd: number; all?: boolean };
export type PlanInfo = { op: OpKind; amount: string; cost: Cost };

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
  send: (tx, opts) => submitSignedTransaction(tx, "devnet", opts),
  blockHeight: () => getBlockHeight("devnet"),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs: 2000,
  maxWaitMs: 120_000,
};

const UNCONFIRMED_MSG = "We couldn't confirm this transaction yet. It may still go through. Check your balance before trying again.";

export function friendlyError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  if (e instanceof TxCheckError) return new WalletError("FAILED", `Stopped before signing: ${e.message}`);
  if (e instanceof SafeApiError) {
    const d = e.details as any;
    switch (e.code) {
      case "INSUFFICIENT_SOL": {
        const need = d?.cost?.totalLamports;
        const have = d?.cost?.walletSolLamports;
        return new WalletError("FAILED", need ? `Not enough devnet SOL for fees: need ${sol(need)}, you have ${sol(have)}. Top up at faucet.solana.com.` : "Not enough devnet SOL for fees. Top up at faucet.solana.com.");
      }
      case "INSUFFICIENT_USDC":
        return new WalletError("FAILED", `Not enough USDC${d?.availableUsdc ? `: available ${Number(d.availableUsdc)}` : ""}.`);
      case "SAFE_NOT_CREATED":
        return new WalletError("FAILED", "Your Safe isn't confirmed yet. Wait a moment and try again.");
      case "SIMULATION_FAILED":
        return new WalletError("FAILED", "The transaction wouldn't go through right now. Try again.");
      default:
        return new WalletError("FAILED", e.message);
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new WalletError("UNKNOWN", msg || "Something went wrong.");
}

async function plan(input: OperationInput, owner: string, api: SafeApi): Promise<{ op: OpKind; plan: ReadyPlan }> {
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
  assertNetwork(res.state?.network);
  if (res.status === "empty") throw new WalletError("FAILED", "Nothing to withdraw. Your Safe has no idle USDC.");
  if (res.status !== "ready") throw new WalletError("FAILED", "Nothing to sign. Refresh and try again.");
  const signers = res.steps[0]?.requiredSigners;
  if (res.steps.length !== 1 || (signers && (signers.length !== 1 || signers[0] !== owner)) || res.cost.feePayer !== owner) {
    throw new WalletError("FAILED", "Stopped before signing: unexpected transaction plan.");
  }
  return { op, plan: res };
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
      const height = await deps.blockHeight().catch(() => null);
      log("blockhash not found", { try: i, height, lastValid: entry.lastValidBlockHeight });
      if (height !== null && height > entry.lastValidBlockHeight) return;
      // Still lagging after a few seconds: hand it to the leader without preflight.
      if (i >= LAG_RETRIES) return await deps.send(entry.signedTx, { skipPreflight: true });
      await deps.sleep(1500);
    }
  }
}

function log(event: string, data?: object) {
  console.log(`[devnet] ${event}`, data ? JSON.stringify(data) : "");
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

export async function runOperation(
  input: OperationInput,
  owner: string,
  hooks: { onPlan?: (p: PlanInfo) => void; onPhase: (p: "signing" | "submitting") => void },
  deps: Deps = defaultDeps,
): Promise<string> {
  await loadJournal();
  const open = openEntry(owner);
  if (open) {
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

  let planned;
  try {
    hooks.onPhase("signing");
    await deps.prepare();
    planned = await plan(input, owner, deps.api);
  } catch (e) {
    throw friendlyError(e);
  }
  const { op, plan: p } = planned;
  const step = p.steps[0];
  hooks.onPlan?.({ op, amount: p.amount ?? p.initialDepositUsdc ?? String(input.amountUsd), cost: p.cost });

  let signature: string;
  let signedTx: string;
  try {
    checkUnsigned(Buffer.from(step.transaction, "base64"), { owner, blockhash: p.blockhash, programId: EXPECTED_NETWORK.programId });
    hooks.onPhase("signing");
    const t0 = Date.now();
    log("plan", { op, planId: p.planId, lastValid: p.lastValidBlockHeight });
    signedTx = await deps.sign(step.transaction);
    log("signed", { ms: Date.now() - t0 });
    signature = checkSigned(signedTx, { owner, blockhash: p.blockhash });
  } catch (e) {
    throw friendlyError(e);
  }

  // Wallets here only sign, so nobody has sent it yet. Past lastValidBlockHeight it can never land:
  // say so plainly instead of leaving an "unknown" transfer (Devnet gives ~30 s to approve).
  const height = await deps.blockHeight().catch(() => null);
  if (height !== null && height > p.lastValidBlockHeight) {
    log("expired before send", { height, lastValid: p.lastValidBlockHeight });
    throw new WalletError("FAILED", "Approval took too long and the transaction expired before it was sent. Nothing moved. Try again and approve right away.");
  }

  const now = Date.now();
  const entry: JournalEntry = {
    id: signature,
    op,
    amount: input.kind === "withdraw" && input.all ? "all" : (p.amount ?? p.initialDepositUsdc ?? ""),
    amountUsd: Number(p.amount ?? p.initialDepositUsdc ?? input.amountUsd),
    owner,
    cluster: "devnet",
    planId: p.planId,
    signature,
    signedTx,
    blockhash: p.blockhash,
    lastValidBlockHeight: p.lastValidBlockHeight,
    createdAt: now,
    updatedAt: now,
    status: "signed",
  };
  try {
    await putEntry(entry);
  } catch {
    throw new WalletError("FAILED", "Couldn't save the signed transaction on this phone, so it wasn't sent. Try again.");
  }

  hooks.onPhase("submitting");
  await broadcast(entry, deps, true);
  await settle(entry.id, "confirmed", deps);
  // Finalization continues in the background; new operations wait for it.
  settle(entry.id, "finalized", deps).catch(() => {});
  return signature;
}
