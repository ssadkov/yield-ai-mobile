import {
  isWalletCallbackUrl,
  resolveWalletCallbackChain,
} from "../wallet-callback-url";

describe("wallet callback URL helpers", () => {
  it("recognizes Petra connect redirects", () => {
    const url =
      "yieldaimobile:///api/v1/connect?response=approved&data=abc";

    expect(resolveWalletCallbackChain(url)).toBe("aptos");
    expect(isWalletCallbackUrl(url)).toBe(true);
  });

  it("recognizes path-only Petra redirects", () => {
    expect(resolveWalletCallbackChain("/api/v1/response?response=approved")).toBe(
      "aptos",
    );
  });

  it("recognizes Petra redirects when api is parsed as host", () => {
    expect(
      resolveWalletCallbackChain(
        "yieldaimobile://api/v1/response?response=approved&data=abc",
      ),
    ).toBe("aptos");
    expect(
      resolveWalletCallbackChain(
        "yieldaimobile://api/v1/disconnect?response=approved",
      ),
    ).toBe("aptos");
  });

  it("recognizes legacy Aptos path callbacks", () => {
    expect(resolveWalletCallbackChain("yieldaimobile://onAptosConnect")).toBe(
      "aptos",
    );
  });

  it("recognizes Solana path callbacks", () => {
    expect(resolveWalletCallbackChain("yieldaimobile://onConnect?data=abc")).toBe(
      "solana",
    );
  });

  it("recognizes Solana query-param callbacks", () => {
    expect(
      resolveWalletCallbackChain(
        "yieldaimobile:///?walletCallback=onSignTransaction&data=abc",
      ),
    ).toBe("solana");
  });

  it("ignores non-wallet URLs", () => {
    expect(resolveWalletCallbackChain("yieldaimobile://settings")).toBeNull();
    expect(isWalletCallbackUrl("https://yieldaimobile.app")).toBe(false);
  });
});
