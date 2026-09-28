import { Buffer } from "buffer";
import bs58 from "bs58";

export function signedTransactionBase58ToBase64(transaction: string): string {
  return Buffer.from(bs58.decode(transaction)).toString("base64");
}
