import { Buffer } from "buffer";
import bs58 from "bs58";
import { signedTransactionBase58ToBase64 } from "../signed-transaction-encoding";

describe("signedTransactionBase58ToBase64", () => {
  it("normalizes wallet deeplink signed transactions to base64", () => {
    const bytes = Buffer.from([1, 2, 3, 4, 5]);
    const base58Transaction = bs58.encode(bytes);

    expect(signedTransactionBase58ToBase64(base58Transaction)).toBe(
      bytes.toString("base64"),
    );
  });
});
