import { WalletError } from "../wallet";
import { SafeApiError, usdcString, type PlanResponse } from "./api";
import { defaultDeps, ensureNothingOpen, executePlan, friendlyError, readyPlan, type Deps, type Hooks } from "./engine";
import { useJournal } from "./journal";

/**
 * Mainnet protocol flows on top of executePlan. Each function is one step on the signing
 * screen and may ask for more than one signature (Kamino redemption legs + returns).
 * docs/yield-ai-v2-owner-protocol-api.md in yield-ai-os-sol.
 */

export type ProtocolHooks = Hooks & { onProgress?: (text: string) => void };

/** Kamino can split a redemption over reserves; the API caps it, so do we. */
const MAX_KAMINO_LEGS = 8;

/** Plans that read the Safe right after its creation can briefly lag the confirmation. */
async function withSafeRetry<T>(fn: () => Promise<T>, deps: Deps): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const lagging = e instanceof SafeApiError && ["SAFE_NOT_CREATED", "REDEMPTION_NOT_CONFIRMED", "RPC_BEHIND_REDEMPTION", "STATE_NOT_READY"].includes(e.code);
      if (!lagging || i >= 5) throw e;
      await deps.sleep(2500);
    }
  }
}

async function start(owner: string, hooks: ProtocolHooks, deps: Deps) {
  await ensureNothingOpen(owner, deps);
  hooks.onPhase("signing");
  try {
    await deps.prepare();
  } catch (e) {
    throw friendlyError(e);
  }
}

async function plan(fn: () => Promise<PlanResponse>, owner: string, deps: Deps) {
  try {
    return readyPlan(await withSafeRetry(fn, deps), owner);
  } catch (e) {
    throw friendlyError(e);
  }
}

/** An empty Safe (no deposit): the first step before investing. Resolves null if it already exists. */
export async function createSafe(owner: string, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<string | null> {
  await start(owner, hooks, deps);
  let res: PlanResponse;
  try {
    res = await deps.api.creationPlan(owner);
  } catch (e) {
    throw friendlyError(e);
  }
  if (res.status === "already_exists") return null;
  const p = readyPlan(res, owner);
  return (await executePlan(p, { op: "create", amount: "0", amountUsd: 0 }, owner, hooks, deps)).signature;
}

/** Wallet USDC → Safe → Kamino, one signature. */
export async function kaminoInvest(owner: string, amountUsd: number, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<string> {
  await start(owner, hooks, deps);
  const amount = usdcString(amountUsd);
  const p = await plan(() => deps.api.kaminoDepositPlan(owner, "wallet", amount), owner, deps);
  return (await executePlan(p, { op: "kamino_deposit", amount: p.amount ?? amount, amountUsd: Number(p.amount ?? amount) }, owner, hooks, deps)).signature;
}

export type KaminoExit = { percent: string } | { all: true };

/**
 * Kamino → wallet. Partial: each redemption leg is followed by a return of exactly the USDC it
 * produced (existing idle funds stay). All: redeem every leg, then sweep all idle USDC.
 * Resolves with the signatures and the USDC sent to the wallet.
 */
export async function kaminoWithdraw(owner: string, exit: KaminoExit, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<{ signatures: string[]; usdc: number }> {
  await start(owner, hooks, deps);
  const all = "all" in exit;
  const signatures: string[] = [];
  let usdc = 0;
  let target: bigint | null = null;
  let selection: { percent: string } | { shares: string } = all ? { shares: "all" } : { percent: exit.percent };

  for (let leg = 1; leg <= MAX_KAMINO_LEGS; leg++) {
    let res: PlanResponse;
    try {
      res = await withSafeRetry(() => deps.api.kaminoRedeemPlan(owner, selection), deps);
    } catch (e) {
      throw friendlyError(e);
    }
    if (res.status === "redeemed") break;
    const p = readyPlan(res, owner);
    // Persist the first target; later legs ask for explicit remaining raw shares, never a percent again.
    target ??= BigInt(p.targetSharesRaw ?? "0");
    hooks.onProgress?.(leg === 1 ? "Redeeming from Kamino" : `Redeeming from Kamino, part ${leg}`);
    const redeemed = await executePlan(p, { op: "kamino_redeem", amount: p.legSharesRaw ?? "", amountUsd: 0 }, owner, hooks, deps);
    signatures.push(redeemed.signature);

    if (all) {
      selection = { shares: "all" };
      continue;
    }
    const got = await kaminoReturn(owner, redeemed.signature, hooks, deps);
    if (got.signature) signatures.push(got.signature);
    usdc += got.usdc;
    const remaining: bigint = (target ?? BigInt(0)) - got.burned;
    target = remaining;
    if (remaining <= BigInt(0)) break;
    selection = { shares: remaining.toString() };
  }

  if (all) {
    hooks.onProgress?.("Sending USDC to your wallet");
    let res: PlanResponse;
    try {
      res = await withSafeRetry(() => deps.api.withdrawalPlan(owner, "all"), deps);
    } catch (e) {
      throw friendlyError(e);
    }
    if (res.status !== "empty") {
      const p = readyPlan(res, owner);
      const sent = await executePlan(p, { op: "withdraw", amount: "all", amountUsd: Number(p.amount ?? 0) }, owner, hooks, deps);
      signatures.push(sent.signature);
      usdc += Number(p.amount ?? 0);
    }
  }
  if (!signatures.length) throw new WalletError("FAILED", "Nothing to withdraw from Kamino.");
  return { signatures, usdc };
}

/**
 * Sends the USDC one confirmed redemption produced to the wallet. A return is planned at most
 * once per redemption: a second one could spend other idle funds.
 */
export async function kaminoReturn(owner: string, redemption: string, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<{ signature: string | null; usdc: number; burned: bigint }> {
  const earlier = useJournal.getState().entries.find((e) => e.returnFor === redemption && e.status !== "failed");
  if (earlier) throw new WalletError("PENDING", "This redemption was already sent to your wallet. Check your balance.");
  hooks.onProgress?.("Sending USDC to your wallet");
  let res: PlanResponse;
  try {
    res = await withSafeRetry(() => deps.api.kaminoReturnPlan(owner, redemption), deps);
  } catch (e) {
    throw friendlyError(e);
  }
  const burned = BigInt(res.burnedSharesRaw ?? "0");
  if (res.status === "empty") return { signature: null, usdc: 0, burned };
  const p = readyPlan(res, owner);
  const net = Number(p.netUsdc ?? p.amount ?? 0);
  const sent = await executePlan(p, { op: "kamino_return", amount: p.netUsdc ?? "", amountUsd: net, returnFor: redemption }, owner, hooks, deps);
  return { signature: sent.signature, usdc: net, burned: BigInt(p.burnedSharesRaw ?? res.burnedSharesRaw ?? "0") };
}

/** One-time Exponent setup: token accounts and the Safe's PT position (rent, no funds move). */
export async function exponentSetup(owner: string, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<string | null> {
  await start(owner, hooks, deps);
  const pos = await withSafeRetry(() => deps.api.exponentPosition(owner), deps).catch((e) => {
    throw friendlyError(e);
  });
  if (!pos.setupRequired) return null;
  const p = await plan(() => deps.api.exponentSetupPlan(owner), owner, deps);
  return (await executePlan(p, { op: "exponent_setup", amount: "0", amountUsd: 0 }, owner, hooks, deps)).signature;
}

/** Wallet USDC → Safe → PT, one signature. */
export async function exponentInvest(owner: string, amountUsd: number, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<string> {
  await start(owner, hooks, deps);
  const amount = usdcString(amountUsd);
  let res: PlanResponse;
  try {
    res = await withSafeRetry(() => deps.api.exponentInvestPlan(owner, "wallet", amount), deps);
  } catch (e) {
    throw friendlyError(e);
  }
  if (res.status === "setup_required") throw new WalletError("FAILED", "Your fixed-rate position isn't set up yet. Try again.");
  const p = readyPlan(res, owner);
  return (await executePlan(p, { op: "exponent_buy", amount, amountUsd }, owner, hooks, deps)).signature;
}

/** PT → USDC straight to the wallet. Before maturity this is a sale at the market price. */
export async function exponentExit(owner: string, exit: KaminoExit, hooks: ProtocolHooks, deps: Deps = defaultDeps): Promise<{ signature: string; usdc: number }> {
  await start(owner, hooks, deps);
  const selection = "all" in exit ? { shares: "all" } : { percent: exit.percent };
  let res: PlanResponse;
  try {
    res = await withSafeRetry(() => deps.api.exponentExitPlan(owner, selection), deps);
  } catch (e) {
    throw friendlyError(e);
  }
  if (res.status === "empty") throw new WalletError("FAILED", "Nothing to withdraw from the fixed-rate position.");
  const p = readyPlan(res, owner);
  const min = Number(p.minimumOutputRaw ?? p.quote?.output?.minRaw ?? 0) / 1e6;
  const sent = await executePlan(p, { op: "exponent_sell", amount: p.minimumOutputRaw ?? "", amountUsd: min }, owner, hooks, deps);
  return { signature: sent.signature, usdc: min };
}
