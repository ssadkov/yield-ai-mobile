import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol";
import { MwaAdapter } from "../mwa-adapter";
import type { SolanaWalletConfig } from "../../model/types";

const mockTransact = jest.mocked(transact);

jest.mock("@solana-mobile/mobile-wallet-adapter-protocol", () => ({
  transact: jest.fn(),
}));

const config: SolanaWalletConfig = {
  walletId: "mwa",
  appScheme: "testapp",
  cluster: "devnet",
  appName: "Test App",
};
const walletUriBase = "https://wallet.example/associate";

describe("MwaAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses generic MWA wallet selection", async () => {
    const authorize = jest.fn().mockResolvedValue({
      auth_token: "auth-token",
      accounts: [{ address: new Uint8Array([1, 2, 3]) }],
      wallet_uri_base: walletUriBase,
    });
    mockTransact.mockImplementation(async (callback: any) =>
      callback({ authorize }),
    );

    const adapter = new MwaAdapter(config);
    await adapter.connect();

    expect(mockTransact).toHaveBeenCalledTimes(1);
    expect(mockTransact).toHaveBeenCalledWith(expect.any(Function));
    expect(authorize).toHaveBeenCalledWith({
      identity: {
        name: "Test App",
        uri: "https://yieldai.app",
      },
      chain: "solana:devnet",
      auth_token: undefined,
    });
  });

  it("sends transactions to MWA as base64 payloads", async () => {
    const authorize = jest.fn().mockResolvedValue({
      auth_token: "auth-token",
      accounts: [{ address: new Uint8Array([1, 2, 3]) }],
      wallet_uri_base: walletUriBase,
    });
    const signTransactions = jest.fn().mockResolvedValue({
      signed_payloads: ["signed_tx_base64"],
    });
    mockTransact.mockImplementation(async (callback: any) =>
      callback({ authorize, signTransactions }),
    );

    const adapter = new MwaAdapter(config);
    await adapter.connect();
    const result = await adapter.signTransaction(new Uint8Array([4, 5, 6]));

    expect(result).toBe("signed_tx_base64");
    expect(mockTransact).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(mockTransact).toHaveBeenNthCalledWith(2, expect.any(Function), {
      baseUri: walletUriBase,
    });
    expect(authorize).toHaveBeenLastCalledWith({
      identity: {
        name: "Test App",
        uri: "https://yieldai.app",
      },
      chain: "solana:devnet",
      auth_token: "auth-token",
    });
    expect(signTransactions).toHaveBeenCalledWith({
      payloads: [Buffer.from([4, 5, 6]).toString("base64")],
    });
  });

  it("sends messages to MWA with base64 address and payload", async () => {
    const authorize = jest.fn().mockResolvedValue({
      auth_token: "auth-token",
      accounts: [{ address: "AQID" }],
      wallet_uri_base: walletUriBase,
    });
    const signMessages = jest.fn().mockResolvedValue({
      signed_payloads: ["signature_base64"],
    });
    mockTransact.mockImplementation(async (callback: any) =>
      callback({ authorize, signMessages }),
    );

    const adapter = new MwaAdapter(config);
    await adapter.connect();
    const result = await adapter.signMessage(new Uint8Array([7, 8, 9]));

    expect(result).toBe("signature_base64");
    expect(signMessages).toHaveBeenCalledWith({
      addresses: ["AQID"],
      payloads: [Buffer.from([7, 8, 9]).toString("base64")],
    });
  });

  it("uses the connected wallet URI when disconnecting", async () => {
    const authorize = jest.fn().mockResolvedValue({
      auth_token: "auth-token",
      accounts: [{ address: new Uint8Array([1, 2, 3]) }],
      wallet_uri_base: "https://phantom.app/ul/v1",
    });
    const deauthorize = jest.fn().mockResolvedValue({});
    mockTransact.mockImplementation(async (callback: any) =>
      callback({ authorize, deauthorize }),
    );

    const adapter = new MwaAdapter(config);
    await adapter.connect();
    await adapter.disconnect();

    expect(mockTransact).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(mockTransact).toHaveBeenNthCalledWith(2, expect.any(Function), {
      baseUri: "https://phantom.app/ul/v1",
    });
    expect(deauthorize).toHaveBeenCalledWith({ auth_token: "auth-token" });
  });

  it("falls back to generic MWA sessions when the wallet does not return a URI", async () => {
    const authorize = jest.fn().mockResolvedValue({
      auth_token: "auth-token",
      accounts: [{ address: new Uint8Array([1, 2, 3]) }],
    });
    const signTransactions = jest.fn().mockResolvedValue({
      signed_payloads: ["signed_tx_base64"],
    });
    mockTransact.mockImplementation(async (callback: any) =>
      callback({ authorize, signTransactions }),
    );

    const adapter = new MwaAdapter(config);
    await adapter.connect();
    await adapter.signTransaction(new Uint8Array([4, 5, 6]));

    expect(mockTransact).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(mockTransact).toHaveBeenNthCalledWith(2, expect.any(Function));
  });
});
