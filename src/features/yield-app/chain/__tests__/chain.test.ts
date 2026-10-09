import { Buffer } from "buffer";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { SafeApiError, usdcString, type PlanResponse, type SafeApi, type SafeState, type TxStatus } from "../api";
import { EXPECTED_NETWORK } from "../config";
import { runOperation, type Deps } from "../engine";
import { openEntry, updateEntry, useJournal } from "../journal";
import { RpcError } from "../rpc";
import { TxCheckError, checkSigned, checkUnsigned, parseTx } from "../tx";
import { exponentExit, kaminoReturn, kaminoWithdraw } from "../protocols";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../wallet", () => ({ ...jest.requireActual("../../wallet/types"), getDriver: jest.fn() }));

/** Real unsigned deposit from the Devnet API (owner 8xwj…, 1 USDC). */
const FIXTURE_TX =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAECHZWoxIveFsRQgzANr4+WgbqqUxPOv39b9Rg7J+Q7Q0V+Pl2A/ENAnit/x4O/mhHCEROFETmx4ws2dHSqmrcvI3ouIErtBEF5NEjJFyBYL+b8G/e1uNTH+oaRxTECwh8wwqLbAjQUk6mWHNMjljg0HpGqWhOH+MgXscDtbca2cHbAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAAB2PhH+Myu3W2k8vT11PDiSJCC6d2DKPzVL57r/z4t4XDtELLORIVfxOpM9ATQoLQMrX/7NAaLb8bd5BgjfAC6nBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKm3jtTSTvqB1NXi5G9Z5DtHPlF2qGmor0UUbdI7bPx7FwIEAAUCQA0DAAUGAAEGAgMHEPIjxolS4fK2QEIPAAAAAAAA";
const FIXTURE_OWNER = "8xwjNX3hWwG9BEBVL3SCZqtsqPGgA8ARXq7eSzCTee9A";
const FIXTURE_BLOCKHASH = "DMXvuf7LKRyk2Rkvf4HvQf5Qocawuvd7nTFia9UV4WeA";
const PROGRAM = EXPECTED_NETWORK.programId;

/** Signature slot (1 + 64) + v0 prefix + header + key count = first account key. */
const KEY0 = 1 + 64 + 1 + 3 + 1;

const kp = nacl.sign.keyPair();
const OWNER = bs58.encode(kp.publicKey);

/** The fixture with our test key as fee payer. */
function unsignedFor(pub: Uint8Array = kp.publicKey) {
  const b = Buffer.from(FIXTURE_TX, "base64");
  b.set(pub, KEY0);
  return b;
}

function sign(txBase64: string, secret = kp.secretKey) {
  const b = Buffer.from(txBase64, "base64");
  const msg = parseTx(b).message;
  b.set(nacl.sign.detached(msg, secret), 1);
  return b.toString("base64");
}

describe("transaction checks", () => {
  it("reads the real Devnet deposit and accepts it for its owner", () => {
    const tx = checkUnsigned(Buffer.from(FIXTURE_TX, "base64"), { owner: FIXTURE_OWNER, blockhash: FIXTURE_BLOCKHASH, programId: PROGRAM });
    expect(tx.version).toBe(0);
    expect(tx.accountKeys[0]).toBe(FIXTURE_OWNER);
    expect(tx.programIds).toEqual(["ComputeBudget111111111111111111111111111111", PROGRAM]);
  });

  it("rejects another fee payer, blockhash or program", () => {
    const bytes = Buffer.from(FIXTURE_TX, "base64");
    expect(() => checkUnsigned(bytes, { owner: OWNER, blockhash: FIXTURE_BLOCKHASH, programId: PROGRAM })).toThrow("fee payer");
    expect(() => checkUnsigned(bytes, { owner: FIXTURE_OWNER, blockhash: OWNER, programId: PROGRAM })).toThrow("blockhash");
    expect(() => checkUnsigned(bytes, { owner: FIXTURE_OWNER, blockhash: FIXTURE_BLOCKHASH, programId: OWNER })).toThrow(TxCheckError);
    expect(() => checkUnsigned(bytes.subarray(0, 120), { owner: FIXTURE_OWNER, blockhash: FIXTURE_BLOCKHASH, programId: PROGRAM })).toThrow(TxCheckError);
  });

  it("accepts only a valid owner signature", () => {
    const unsigned = unsignedFor().toString("base64");
    const signed = sign(unsigned);
    expect(checkSigned(signed, { owner: OWNER, blockhash: FIXTURE_BLOCKHASH })).toBe(bs58.encode(Buffer.from(signed, "base64").subarray(1, 65)));
    expect(() => checkSigned(unsigned, { owner: OWNER, blockhash: FIXTURE_BLOCKHASH })).toThrow("valid signature");
    expect(() => checkSigned(sign(unsigned, nacl.sign.keyPair().secretKey), { owner: OWNER, blockhash: FIXTURE_BLOCKHASH })).toThrow("valid signature");
  });
});

describe("usdcString", () => {
  it("formats decimal strings for the API", () => {
    expect(usdcString(1)).toBe("1");
    expect(usdcString(0.4)).toBe("0.4");
    expect(usdcString(0.1 + 0.2)).toBe("0.3");
    expect(usdcString(12.345678)).toBe("12.345678");
    expect(() => usdcString(0)).toThrow(SafeApiError);
    expect(() => usdcString(0.0000001)).toThrow(SafeApiError);
  });
});

/* ——— Operation engine ——— */

const net = { ...EXPECTED_NETWORK };

function state(over: Partial<SafeState> = {}): SafeState {
  return {
    owner: { type: "solana", address: OWNER },
    network: net,
    safe: "Safe1111111111111111111111111111111111111111",
    usdcAta: "x",
    exists: true,
    usdcAccountExists: true,
    walletSolLamports: "20000000",
    idleUsdc: "1.000000",
    ownerUsdcAta: "y",
    walletUsdc: "2.000000",
    updatedAt: 0,
    ...over,
  };
}

function ready(amount = "1.000000", extra: object = {}): PlanResponse {
  return {
    status: "ready",
    planId: "plan1",
    state: state(),
    cost: { rentLamports: "0", networkFeeLamports: "5000", totalLamports: "5000", walletSolLamports: "20000000", feePayer: OWNER, priorityFeeLamports: "0" },
    blockhash: FIXTURE_BLOCKHASH,
    lastValidBlockHeight: 100,
    steps: [{ id: "deposit", kind: "deposit", title: "Deposit", transaction: unsignedFor().toString("base64"), requiredSigners: [OWNER] }],
    createdAt: 0,
    amount,
    ...extra,
  } as PlanResponse;
}

function status(s: TxStatus["status"], over: Partial<TxStatus> = {}): TxStatus {
  return { signature: "sig", network: net, status: s, error: null, blockhashExpired: false, ...over };
}

function deps(over: Partial<SafeApi> = {}, statuses: TxStatus[] = [status("confirmed"), status("finalized")]) {
  const queue = [...statuses];
  const api: SafeApi = {
    config: jest.fn(),
    safe: jest.fn(async () => state()),
    creationPlan: jest.fn(async () => ready(undefined, { amount: undefined, initialDepositUsdc: "1.000000" })),
    depositPlan: jest.fn(async () => ready()),
    withdrawalPlan: jest.fn(async () => ready("0.400000")),
    txStatus: jest.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0])),
    kaminoYield: jest.fn(),
    exponentYield: jest.fn(),
    kaminoPosition: jest.fn(),
    kaminoDepositPlan: jest.fn(async () => ready("1.000000")),
    kaminoRedeemPlan: jest.fn(),
    kaminoReturnPlan: jest.fn(),
    exponentPosition: jest.fn(async () => ({ state: state(), setupRequired: false, position: null })),
    exponentSetupPlan: jest.fn(async () => ready("0")),
    exponentInvestPlan: jest.fn(async () => ready("1.000000")),
    exponentExitPlan: jest.fn(),
    ...over,
  };
  const d: Deps = {
    api,
    prepare: jest.fn(async () => {}),
    sign: jest.fn(async (tx: string) => sign(tx)),
    send: jest.fn(async () => "sig"),
    blockHeight: jest.fn(async () => 50),
    sleep: async () => {},
    pollMs: 0,
    maxWaitMs: 60_000,
  };
  return d;
}

const hooks = () => ({ onPhase: jest.fn(), onPlan: jest.fn() });

describe("runOperation", () => {
  beforeEach(() => useJournal.setState({ entries: [], loaded: true }));

  it("creates the Safe with the first deposit in one signature, journaling before send", async () => {
    const d = deps({ safe: jest.fn(async () => state({ exists: false })) });
    (d.send as jest.Mock).mockImplementation(async () => {
      expect(useJournal.getState().entries[0]?.status).toBe("signed");
      return "sig";
    });
    const h = hooks();
    const sig = await runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, h, d);
    expect(d.api.creationPlan).toHaveBeenCalledWith(OWNER, "1");
    expect(d.api.depositPlan).not.toHaveBeenCalled();
    expect(d.sign).toHaveBeenCalledTimes(1);
    expect(h.onPlan).toHaveBeenCalledWith(expect.objectContaining({ op: "create" }));
    const e = useJournal.getState().entries[0];
    expect(e.signature).toBe(sig);
    expect(e.op).toBe("create");
    expect(e.amountUsd).toBe(1);
  });

  it("falls back to a deposit plan when the Safe appeared meanwhile", async () => {
    const d = deps({
      safe: jest.fn(async () => state({ exists: false })),
      creationPlan: jest.fn(async () => ({ status: "already_exists", state: state(), steps: [] }) as PlanResponse),
    });
    await runOperation({ kind: "deposit", amountUsd: 2 }, OWNER, hooks(), d);
    expect(d.api.depositPlan).toHaveBeenCalledWith(OWNER, "2");
  });

  it("withdraws all as the exact amount planned", async () => {
    const d = deps({ withdrawalPlan: jest.fn(async () => ready("0.600000")) });
    await runOperation({ kind: "withdraw", amountUsd: 0.6, all: true }, OWNER, hooks(), d);
    expect(d.api.withdrawalPlan).toHaveBeenCalledWith(OWNER, "all");
    expect(useJournal.getState().entries[0]).toMatchObject({ amount: "all", amountUsd: 0.6 });
  });

  it("reports an empty withdrawal without signing", async () => {
    const d = deps({ withdrawalPlan: jest.fn(async () => ({ status: "empty", state: state(), steps: [] }) as PlanResponse) });
    await expect(runOperation({ kind: "withdraw", amountUsd: 1, all: true }, OWNER, hooks(), d)).rejects.toThrow("Nothing to withdraw");
    expect(d.sign).not.toHaveBeenCalled();
  });

  it("refuses a plan for another network or fee payer before the wallet sees it", async () => {
    const wrongNet = deps({ depositPlan: jest.fn(async () => ({ ...ready(), state: state({ network: { ...net, programId: OWNER } }) }) as PlanResponse) });
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), wrongNet)).rejects.toThrow("different network");
    const otherPayer = deps({ depositPlan: jest.fn(async () => ({ ...ready(), steps: [{ ...(ready() as any).steps[0], transaction: unsignedFor(nacl.sign.keyPair().publicKey).toString("base64") }] }) as PlanResponse) });
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), otherPayer)).rejects.toThrow("fee payer");
    expect(wrongNet.sign).not.toHaveBeenCalled();
    expect(otherPayer.sign).not.toHaveBeenCalled();
  });

  it("explains missing SOL from the API error", async () => {
    const d = deps({
      depositPlan: jest.fn(async () => {
        throw new SafeApiError("INSUFFICIENT_SOL", "x", 422, { cost: { totalLamports: "8600360", walletSolLamports: "1000000" } });
      }),
    });
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toThrow("need 0.00860036 SOL, you have 0.001 SOL");
  });

  it("marks a preflight rejection as failed and lets the next operation run", async () => {
    const d = deps();
    (d.send as jest.Mock).mockRejectedValueOnce(new Error("Solana RPC -32002: Transaction simulation failed"));
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toMatchObject({ code: "FAILED" });
    expect(useJournal.getState().entries[0].status).toBe("failed");
    expect(openEntry(OWNER)).toBeNull();
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).resolves.toBeTruthy();
  });

  it("fails right away when the API transport refuses the transaction", async () => {
    // The Mainnet /rpc answers {error:{code:"INVALID_TRANSACTION"}} with a 4xx: nothing was broadcast.
    const d = deps();
    (d.send as jest.Mock).mockRejectedValueOnce(new RpcError("Solana RPC INVALID_TRANSACTION: Expected one signed owner v0 transaction", 400, "INVALID_TRANSACTION"));
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toThrow("Expected one signed owner v0 transaction");
    expect(useJournal.getState().entries[0].status).toBe("failed");
    expect(d.api.txStatus).not.toHaveBeenCalled();
  });

  it("waits out an RPC node that hasn't seen the blockhash yet", async () => {
    const d = deps();
    (d.send as jest.Mock)
      .mockRejectedValueOnce(new Error("Solana RPC -32002: Transaction simulation failed: Blockhash not found"))
      .mockRejectedValueOnce(new Error("Solana RPC -32002: Transaction simulation failed: Blockhash not found"));
    await expect(runOperation({ kind: "withdraw", amountUsd: 0.5 }, OWNER, hooks(), d)).resolves.toBeTruthy();
    expect(d.send).toHaveBeenCalledTimes(3);
    expect(useJournal.getState().entries[0].status).not.toBe("failed");
  });

  it("ignores a block height that can't be real (an RPC reporting the slot)", async () => {
    // Seen on Mainnet: getBlockHeight answered with the slot, ~22M above lastValidBlockHeight.
    const d = deps();
    d.blockHeight = jest.fn(async () => 22_000_000);
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).resolves.toBeTruthy();
    expect(d.send).toHaveBeenCalled();
  });

  it("doesn't send a transaction that expired while the wallet was open", async () => {
    const d = deps();
    d.blockHeight = jest.fn(async () => 101);
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toThrow("expired before it was sent");
    expect(d.send).not.toHaveBeenCalled();
    expect(openEntry(OWNER)).toBeNull();
  });

  it("never calls a 'Blockhash not found' send failed: the transaction can still land", async () => {
    // Seen on a Seeker: the RPC answered "Blockhash not found" yet forwarded the transaction, and it finalized.
    const landed = deps();
    landed.blockHeight = jest.fn().mockResolvedValueOnce(50).mockResolvedValue(101);
    (landed.send as jest.Mock).mockRejectedValue(new Error("Solana RPC -32002: Transaction simulation failed: Blockhash not found"));
    await expect(runOperation({ kind: "withdraw", amountUsd: 0.5 }, OWNER, hooks(), landed)).resolves.toBeTruthy();
    expect(landed.send).toHaveBeenCalledTimes(1);

    useJournal.setState({ entries: [], loaded: true });
    const lost = deps({}, [status("unknown_or_expired", { blockhashExpired: true })]);
    lost.blockHeight = jest.fn().mockResolvedValueOnce(50).mockResolvedValue(101);
    (lost.send as jest.Mock).mockRejectedValue(new Error("Solana RPC -32002: Transaction simulation failed: Blockhash not found"));
    await expect(runOperation({ kind: "withdraw", amountUsd: 0.5 }, OWNER, hooks(), lost)).rejects.toMatchObject({ code: "UNCONFIRMED" });
    expect(openEntry(OWNER)?.status).toBe("unknown");
  });

  it("falls back to sending without preflight when the node keeps lagging", async () => {
    const d = deps();
    (d.send as jest.Mock).mockImplementation(async (_tx: string, opts?: { skipPreflight?: boolean }) => {
      if (!opts?.skipPreflight) throw new Error("Solana RPC -32002: Transaction simulation failed: Blockhash not found");
      return "sig";
    });
    await expect(runOperation({ kind: "withdraw", amountUsd: 0.5 }, OWNER, hooks(), d)).resolves.toBeTruthy();
    expect((d.send as jest.Mock).mock.calls.at(-1)?.[1]).toEqual({ skipPreflight: true });
  });

  it("survives a send timeout: polls the saved signature and re-sends the same bytes", async () => {
    const d = deps({}, [status("pending"), status("pending"), status("pending"), status("pending"), status("confirmed"), status("finalized")]);
    (d.send as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
    await runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d);
    const sent = (d.send as jest.Mock).mock.calls.map((c) => c[0]);
    expect(sent.length).toBeGreaterThan(1);
    expect(new Set(sent).size).toBe(1);
    expect(d.sign).toHaveBeenCalledTimes(1);
  });

  it("never starts a new transfer after an unknown result until the user has checked it", async () => {
    const d = deps({}, [status("unknown_or_expired", { blockhashExpired: true, reconciliationRequired: true })]);
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toMatchObject({ code: "UNCONFIRMED" });
    const e = useJournal.getState().entries[0];
    expect(e.status).toBe("unknown");

    // Restart: same journal, still no record of the signature.
    (d.api.depositPlan as jest.Mock).mockClear();
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toMatchObject({ code: "PENDING" });
    expect(d.api.depositPlan).not.toHaveBeenCalled();

    await updateEntry(e.id, { acknowledged: true });
    (d.api.txStatus as jest.Mock).mockResolvedValue(status("finalized"));
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).resolves.toBeTruthy();
  });

  it("finishes an interrupted transaction before the next one", async () => {
    const d = deps({}, [status("finalized")]);
    await updateEntry("none", {});
    useJournal.setState({
      entries: [{ id: "old", op: "deposit", amount: "1", amountUsd: 1, owner: OWNER, cluster: "devnet", planId: "p", signature: "old", signedTx: "AA==", blockhash: FIXTURE_BLOCKHASH, lastValidBlockHeight: 1, createdAt: 1, updatedAt: 1, status: "submitted" }],
    });
    await runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d);
    expect(useJournal.getState().entries.find((x) => x.id === "old")?.status).toBe("finalized");
  });

  it("reports a transaction that failed on chain", async () => {
    const d = deps({}, [status("finalized", { error: { InstructionError: [1, "Custom"] } })]);
    await expect(runOperation({ kind: "deposit", amountUsd: 1 }, OWNER, hooks(), d)).rejects.toThrow("failed on Solana");
    expect(useJournal.getState().entries[0].status).toBe("failed");
  });
});

describe("instruction allowlist", () => {
  it("rejects a Yield AI instruction outside the reviewed set", () => {
    const b = Buffer.from(FIXTURE_TX, "base64");
    // The deposit's data starts right after its account list: find its 8-byte tag and change it.
    const tag = Buffer.from("f223c68952e1f2b6", "hex");
    const at = b.indexOf(tag);
    expect(at).toBeGreaterThan(0);
    b[at] ^= 0xff;
    expect(() => checkUnsigned(b, { owner: FIXTURE_OWNER, blockhash: FIXTURE_BLOCKHASH, programId: PROGRAM })).toThrow("unreviewed");
  });
});

describe("Kamino withdrawal", () => {
  beforeEach(() => useJournal.setState({ entries: [], loaded: true }));

  /** The fixture with another amount byte, so every leg and return has its own signature. */
  let variant = 0;
  const distinct = (p: any) => {
    const b = unsignedFor();
    b.set([0x50 + (variant++ % 100)], b.indexOf(Buffer.from([0x40, 0x42, 0x0f, 0x00])));
    return { ...p, steps: [{ ...p.steps[0], transaction: b.toString("base64") }] };
  };
  const redeem = (target: string, leg: string, remaining: string) => distinct({ ...(ready() as any), targetSharesRaw: target, legSharesRaw: leg, remainingTargetSharesRaw: remaining });
  const ret = (burned: string, net: string) => distinct({ ...(ready(net) as any), burnedSharesRaw: burned, netUsdc: net });

  it("returns each leg's USDC and asks for the remaining raw shares, never the percent again", async () => {
    const d = deps({
      kaminoRedeemPlan: jest.fn().mockResolvedValueOnce(redeem("1000", "600", "400")).mockResolvedValueOnce(redeem("400", "400", "0")),
      kaminoReturnPlan: jest.fn().mockResolvedValueOnce(ret("600", "0.600000")).mockResolvedValueOnce(ret("400", "0.400000")),
    });
    const out = await kaminoWithdraw(OWNER, { percent: "50" }, hooks(), d);
    expect((d.api.kaminoRedeemPlan as jest.Mock).mock.calls.map((c) => c[1])).toEqual([{ percent: "50" }, { shares: "400" }]);
    expect(d.api.kaminoReturnPlan).toHaveBeenCalledTimes(2);
    expect(out.usdc).toBeCloseTo(1);
    expect(out.signatures).toHaveLength(4);
    expect(d.api.withdrawalPlan).not.toHaveBeenCalled();
  });

  it("on All redeems every leg, then sweeps idle USDC once", async () => {
    const d = deps({
      kaminoRedeemPlan: jest.fn().mockResolvedValueOnce(redeem("1000", "700", "300")).mockResolvedValueOnce(redeem("300", "300", "0")).mockResolvedValueOnce({ status: "redeemed", steps: [] }),
      withdrawalPlan: jest.fn(async () => ready("1.050000")),
    });
    const out = await kaminoWithdraw(OWNER, { all: true }, hooks(), d);
    expect((d.api.kaminoRedeemPlan as jest.Mock).mock.calls.map((c) => c[1])).toEqual([{ shares: "all" }, { shares: "all" }, { shares: "all" }]);
    expect(d.api.kaminoReturnPlan).not.toHaveBeenCalled();
    expect(d.api.withdrawalPlan).toHaveBeenCalledWith(OWNER, "all");
    expect(out.usdc).toBeCloseTo(1.05);
  });

  it("never plans a second return for the same redemption", async () => {
    const d = deps({
      kaminoRedeemPlan: jest.fn().mockResolvedValueOnce(redeem("1000", "1000", "0")),
      kaminoReturnPlan: jest.fn().mockResolvedValueOnce(ret("1000", "1.000000")),
    });
    await kaminoWithdraw(OWNER, { percent: "100" }, hooks(), d);
    const redemption = useJournal.getState().entries.find((e) => e.op === "kamino_redeem")!.signature;
    await expect(kaminoReturn(OWNER, redemption, hooks(), d)).rejects.toMatchObject({ code: "PENDING" });
    expect(d.api.kaminoReturnPlan).toHaveBeenCalledTimes(1);
  });
});

describe("Exponent exit", () => {
  beforeEach(() => useJournal.setState({ entries: [], loaded: true }));

  it("doesn't send once the price quote has expired", async () => {
    const d = deps({ exponentExitPlan: jest.fn(async () => ({ ...(ready() as any), minimumOutputRaw: "990000", quoteExpiresAtUnixSeconds: Date.now() / 1000 - 1 })) });
    await expect(exponentExit(OWNER, { all: true }, hooks(), d)).rejects.toThrow("quote expired");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("sends a fresh quote and reports the guaranteed minimum", async () => {
    const d = deps({ exponentExitPlan: jest.fn(async () => ({ ...(ready() as any), minimumOutputRaw: "990000", quoteExpiresAtUnixSeconds: Date.now() / 1000 + 60 })) });
    const out = await exponentExit(OWNER, { percent: "50" }, hooks(), d);
    expect(d.api.exponentExitPlan).toHaveBeenCalledWith(OWNER, { percent: "50" });
    expect(out.usdc).toBeCloseTo(0.99);
  });
});
