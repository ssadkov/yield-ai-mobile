import { Buffer } from "buffer";
import bs58 from "bs58";
import { Linking } from "react-native";

jest.mock("@/core/walletconnect", () => ({
  getWalletConnectClient: jest.fn(),
  openWalletWithWcUri: jest.fn().mockResolvedValue(undefined),
  resolveWalletRedirectUri: jest.fn(() => "jupiter://"),
}));

import {
  getWalletConnectClient,
  openWalletWithWcUri,
  resolveWalletRedirectUri,
} from "@/core/walletconnect";
import { WalletConnectAdapter } from "../model/walletconnect-adapter";
import type { SolanaWalletConfig } from "../model/types";

const MOCK_ADDRESS = "BxxxxAAAAaaaaBBBBccccDDDDeeeeFFFFggggHHHHiiii";
const SOLANA_MAINNET_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function makeSession(overrides: Partial<any> = {}) {
  return {
    topic: "topic-123",
    expiry: Math.floor(Date.now() / 1000) + 3600,
    namespaces: {
      solana: {
        accounts: [`${SOLANA_MAINNET_CHAIN}:${MOCK_ADDRESS}`],
        methods: ["solana_signTransaction"],
        events: [],
      },
    },
    peer: {
      metadata: { name: "Jupiter Mobile", redirect: { native: "jupiter://" } },
    },
    ...overrides,
  };
}

function makeClient(overrides: Partial<any> = {}) {
  const session = makeSession();
  return {
    session: { getAll: jest.fn(() => []) },
    connect: jest.fn().mockResolvedValue({
      uri: "wc:topic-123@2?relay-protocol=irn&symKey=abcd",
      approval: jest.fn().mockResolvedValue(session),
    }),
    request: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const config: SolanaWalletConfig = {
  walletId: "jupiter",
  appScheme: "yieldaimobile",
  cluster: "mainnet-beta",
  appName: "YieldAI",
};

describe("WalletConnectAdapter", () => {
  let linkingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    linkingSpy = jest
      .spyOn(Linking, "openURL")
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    linkingSpy.mockRestore();
  });

  describe("connect", () => {
    it("creates a new session when none exist and returns the Solana address", async () => {
      const client = makeClient();
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);

      const adapter = new WalletConnectAdapter(config);
      const account = await adapter.connect();

      expect(client.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          optionalNamespaces: expect.objectContaining({
            solana: expect.objectContaining({
              chains: [SOLANA_MAINNET_CHAIN],
            }),
          }),
        }),
      );
      expect(openWalletWithWcUri).toHaveBeenCalledWith(
        "jupiter",
        "wc:topic-123@2?relay-protocol=irn&symKey=abcd",
      );
      expect(account).toEqual({ address: MOCK_ADDRESS, chain: "solana" });
    });

    it("reuses an existing live session", async () => {
      const existing = makeSession();
      const client = makeClient({
        session: { getAll: jest.fn(() => [existing]) },
      });
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);

      const adapter = new WalletConnectAdapter(config);
      const account = await adapter.connect();

      expect(client.connect).not.toHaveBeenCalled();
      expect(openWalletWithWcUri).not.toHaveBeenCalled();
      expect(account).toEqual({ address: MOCK_ADDRESS, chain: "solana" });
    });

    it("reuses an existing Solana session even when peer name differs", async () => {
      const existing = makeSession({
        peer: {
          metadata: { name: "Mobile Wallet", redirect: { native: "jupiter://" } },
        },
      });
      const client = makeClient({
        session: { getAll: jest.fn(() => [existing]) },
      });
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);

      const adapter = new WalletConnectAdapter(config);
      const account = await adapter.connect();

      expect(client.connect).not.toHaveBeenCalled();
      expect(openWalletWithWcUri).not.toHaveBeenCalled();
      expect(account).toEqual({ address: MOCK_ADDRESS, chain: "solana" });
    });

    it("does not reuse an expired session", async () => {
      const expired = makeSession({
        expiry: Math.floor(Date.now() / 1000) - 10,
      });
      const client = makeClient({
        session: { getAll: jest.fn(() => [expired]) },
      });
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);

      const adapter = new WalletConnectAdapter(config);
      await adapter.connect();

      expect(client.connect).toHaveBeenCalled();
    });
  });

  describe("signing", () => {
    async function connectedAdapter() {
      const client = makeClient();
      client.request = jest.fn();
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);
      const adapter = new WalletConnectAdapter(config);
      await adapter.connect();
      return { adapter, client };
    }

    it("signTransaction sends base64 payload and returns signed transaction", async () => {
      const { adapter, client } = await connectedAdapter();
      client.request.mockResolvedValue({ transaction: "signed-tx-base64" });

      const tx = new Uint8Array([1, 2, 3, 4]);
      const result = await adapter.signTransaction(tx);

      expect(client.request).toHaveBeenCalledWith({
        topic: "topic-123",
        chainId: SOLANA_MAINNET_CHAIN,
        request: {
          method: "solana_signTransaction",
          params: { transaction: Buffer.from(tx).toString("base64") },
        },
      });
      expect(resolveWalletRedirectUri).toHaveBeenCalled();
      expect(linkingSpy).toHaveBeenCalledWith("jupiter://");
      expect(result).toBe("signed-tx-base64");
    });

    it("signAndSendTransaction returns signature", async () => {
      const { adapter, client } = await connectedAdapter();
      client.request.mockResolvedValue({ signature: "sigBase58" });

      const result = await adapter.signAndSendTransaction(new Uint8Array([1]));

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            method: "solana_signAndSendTransaction",
          }),
        }),
      );
      expect(result).toBe("sigBase58");
    });

    it("signMessage sends base58-encoded message with pubkey", async () => {
      const { adapter, client } = await connectedAdapter();
      client.request.mockResolvedValue({ signature: "msgSigBase58" });

      const msg = new Uint8Array([72, 101, 108, 108, 111]);
      const result = await adapter.signMessage(msg);

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          request: {
            method: "solana_signMessage",
            params: { pubkey: MOCK_ADDRESS, message: bs58.encode(msg) },
          },
        }),
      );
      expect(result).toBe("msgSigBase58");
    });

    it("throws when signing before connect", async () => {
      (getWalletConnectClient as jest.Mock).mockResolvedValue(makeClient());
      const adapter = new WalletConnectAdapter(config);
      await expect(adapter.signTransaction(new Uint8Array([1]))).rejects.toThrow(
        /not connected/i,
      );
    });
  });

  describe("disconnect", () => {
    it("calls client.disconnect with current topic", async () => {
      const client = makeClient();
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);
      const adapter = new WalletConnectAdapter(config);
      await adapter.connect();

      await adapter.disconnect();

      expect(client.disconnect).toHaveBeenCalledWith(
        expect.objectContaining({ topic: "topic-123" }),
      );
    });

    it("is a no-op when not connected", async () => {
      const client = makeClient();
      (getWalletConnectClient as jest.Mock).mockResolvedValue(client);
      const adapter = new WalletConnectAdapter(config);

      await expect(adapter.disconnect()).resolves.toBeUndefined();
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });
});
