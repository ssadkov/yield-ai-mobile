import { Buffer } from "buffer";
import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * Minimal Solana wire-format reader: enough to check an API transaction before the
 * wallet sees it, and the wallet's signature before the app sends it.
 */

export type ParsedTx = {
  signatures: Uint8Array[];
  message: Uint8Array;
  version: "legacy" | number;
  requiredSignatures: number;
  accountKeys: string[];
  blockhash: string;
  programIds: string[];
  /** First 8 bytes of each instruction's data, hex (Anchor discriminator for Safe instructions). */
  tags: string[];
};

export class TxCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxCheckError";
  }
}

/** Top-level programs besides the Safe itself. Kamino/Exponent/Orca run only as Safe CPIs. */
const PROGRAMS_ALLOWED = new Set(["ComputeBudget111111111111111111111111111111", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"]);

/** Reviewed Safe instructions, sha256("global:<name>")[0..8]: the same set the API transport accepts. */
const SAFE_INSTRUCTIONS = new Set([
  "bf99cf74c74c5128", // initialize_with_limits
  "f223c68952e1f2b6", // deposit
  "b712469c946da122", // withdraw
  "7751160472bb1791", // set_allocation
  "ed08bcbb73633155", // kamino_deposit
  "c765292dd562e0c8", // kamino_withdraw
  "c4c9649eb2d4c058", // init_exponent_position
  "6316f677cd016021", // exponent_buy_pt
  "d3e59aaa87a37dc5", // exponent_sell_pt
  "20031055deef270a", // exponent_redeem_pt
]);

const MAX_PACKET = 1232;

function shortVec(b: Uint8Array, at: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 3; i++) {
    if (at + i >= b.length) break;
    const byte = b[at + i];
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) return [value, at + i + 1];
  }
  throw new TxCheckError("Malformed transaction.");
}

function take(b: Uint8Array, at: number, n: number): Uint8Array {
  if (at + n > b.length) throw new TxCheckError("Malformed transaction.");
  return b.subarray(at, at + n);
}

export function parseTx(bytes: Uint8Array): ParsedTx {
  let [nSigs, at] = shortVec(bytes, 0);
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < nSigs; i++, at += 64) signatures.push(take(bytes, at, 64));
  const message = bytes.subarray(at);

  let p = 0;
  let version: ParsedTx["version"] = "legacy";
  if (message[0] & 0x80) {
    version = message[0] & 0x7f;
    p = 1;
  }
  const header = take(message, p, 3);
  p += 3;
  let nKeys: number;
  [nKeys, p] = shortVec(message, p);
  const accountKeys: string[] = [];
  for (let i = 0; i < nKeys; i++, p += 32) accountKeys.push(bs58.encode(take(message, p, 32)));
  const blockhash = bs58.encode(take(message, p, 32));
  p += 32;
  let nIx: number;
  [nIx, p] = shortVec(message, p);
  const programIds: string[] = [];
  const tags: string[] = [];
  for (let i = 0; i < nIx; i++) {
    const idx = take(message, p, 1)[0];
    p += 1;
    // Program ids must be static keys (lookup tables can't hold them).
    if (idx >= accountKeys.length) throw new TxCheckError("Transaction calls a program outside its account list.");
    programIds.push(accountKeys[idx]);
    let n: number;
    [n, p] = shortVec(message, p);
    p += n;
    [n, p] = shortVec(message, p);
    tags.push(Buffer.from(message.subarray(p, p + Math.min(n, 8))).toString("hex"));
    p += n;
  }
  if (p > message.length) throw new TxCheckError("Malformed transaction.");
  return { signatures, message, version, requiredSignatures: header[0], accountKeys, blockhash, programIds, tags };
}

function checkSigner(tx: ParsedTx, owner: string, blockhash: string) {
  if (tx.requiredSignatures !== 1 || tx.signatures.length !== 1) throw new TxCheckError("Transaction must need only your signature.");
  if (tx.accountKeys[0] !== owner) throw new TxCheckError("Transaction fee payer is not your wallet.");
  if (tx.blockhash !== blockhash) throw new TxCheckError("Transaction blockhash doesn't match the plan.");
}

/** The server's unsigned v0 transaction: your wallet signs and pays, only reviewed Safe instructions run. */
export function checkUnsigned(bytes: Uint8Array, opts: { owner: string; blockhash: string; programId: string }): ParsedTx {
  if (bytes.length > MAX_PACKET) throw new TxCheckError("Transaction is larger than a Solana packet.");
  const tx = parseTx(bytes);
  if (tx.version !== 0) throw new TxCheckError("Expected a version 0 transaction.");
  checkSigner(tx, opts.owner, opts.blockhash);
  const unknown = tx.programIds.find((id) => id !== opts.programId && !PROGRAMS_ALLOWED.has(id));
  if (unknown) throw new TxCheckError(`Transaction calls an unexpected program (${unknown.slice(0, 6)}…).`);
  if (!tx.programIds.includes(opts.programId)) throw new TxCheckError("Transaction doesn't call the Yield AI program.");
  const foreign = tx.programIds.findIndex((id, i) => id === opts.programId && !SAFE_INSTRUCTIONS.has(tx.tags[i]));
  if (foreign >= 0) throw new TxCheckError("Transaction calls an unreviewed Yield AI instruction.");
  return tx;
}

/** What the wallet returned: same payer and blockhash, and a valid signature by the owner. Returns the base58 signature. */
export function checkSigned(signedBase64: string, opts: { owner: string; blockhash: string }): string {
  const tx = parseTx(Buffer.from(signedBase64, "base64"));
  checkSigner(tx, opts.owner, opts.blockhash);
  const sig = tx.signatures[0];
  if (!nacl.sign.detached.verify(tx.message, sig, bs58.decode(opts.owner))) {
    throw new TxCheckError("The wallet returned a transaction without a valid signature.");
  }
  return bs58.encode(sig);
}
