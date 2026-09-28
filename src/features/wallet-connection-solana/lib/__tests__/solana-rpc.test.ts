describe("submitSignedTransaction", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;
  const fetchMock = jest.fn();
  let submitSignedTransaction: typeof import("../solana-rpc").submitSignedTransaction;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
    delete process.env.EXPO_PUBLIC_SOLANA_RPC_URL_MAINNET_BETA;
    delete process.env.EXPO_PUBLIC_SOLANA_RPC_URL_DEVNET;
    delete process.env.EXPO_PUBLIC_SOLANA_RPC_URL_TESTNET;
    global.fetch = fetchMock as typeof fetch;
    ({ submitSignedTransaction } = require("../solana-rpc") as typeof import("../solana-rpc"));
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("submits signed transaction as base64 and returns signature", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: "tx_sig" }),
    });

    await expect(
      submitSignedTransaction("signed_tx_base64", "devnet"),
    ).resolves.toBe("tx_sig");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.devnet.solana.com",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        "signed_tx_base64",
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "processed",
        },
      ],
    });
  });

  it("uses cluster-specific RPC URL from env", async () => {
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL_MAINNET_BETA =
      "https://mainnet.helius-rpc.com/?api-key=test";
    jest.resetModules();
    ({ submitSignedTransaction } = require("../solana-rpc") as typeof import("../solana-rpc"));
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: "tx_sig" }),
    });

    await submitSignedTransaction("signed_tx_base64", "mainnet-beta");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mainnet.helius-rpc.com/?api-key=test",
      expect.any(Object),
    );
  });

  it("uses generic RPC URL from env when cluster-specific URL is missing", async () => {
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL =
      "https://devnet.helius-rpc.com/?api-key=test";
    jest.resetModules();
    ({ submitSignedTransaction } = require("../solana-rpc") as typeof import("../solana-rpc"));
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: "tx_sig" }),
    });

    await submitSignedTransaction("signed_tx_base64", "devnet");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://devnet.helius-rpc.com/?api-key=test",
      expect.any(Object),
    );
  });

  it("throws JSON-RPC errors", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        error: { code: -32002, message: "Transaction simulation failed" },
      }),
    });

    await expect(
      submitSignedTransaction("signed_tx_base64", "mainnet-beta"),
    ).rejects.toThrow("Solana RPC -32002: Transaction simulation failed");
  });

  it("throws HTTP errors", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
    });

    await expect(
      submitSignedTransaction("signed_tx_base64", "testnet"),
    ).rejects.toThrow("Solana RPC HTTP 429");
  });
});
