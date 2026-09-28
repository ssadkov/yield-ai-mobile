import { Buffer } from "buffer";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import nacl from "tweetnacl";

import { PetraDeeplinkAdapter } from "../model/petra-deeplink-adapter";
import {
  encryptPayload,
  parsePetraResponse,
  parsePetraSignResponseBody,
} from "../lib/petra-service";
import type { AptosWalletConfig } from "../model/types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

const config: AptosWalletConfig = {
  walletId: "petra",
  appScheme: "yieldaimobile",
  appName: "YieldAI",
  network: "mainnet",
};

const PETRA_ADDRESS = "0xabc";
const SAMPLE_HASH =
  "0xe8ace8da45f1ccf323fd980c27f0b46450f6dac387ced3ad3484ddefb82ef15cf";

function decodeData(url: string): any {
  const dataParam = new URL(url).searchParams.get("data");
  if (!dataParam) throw new Error("URL missing data param");
  return JSON.parse(Buffer.from(dataParam, "base64").toString("utf8"));
}

async function connectAdapter(adapter: PetraDeeplinkAdapter): Promise<void> {
  const connectPromise = adapter.connect();
  // connect() awaits session restore before registering pendingConnect
  await new Promise((resolve) => setTimeout(resolve, 0));
  const petraKeyPair = nacl.box.keyPair();
  const responseBody = {
    petraPublicEncryptedKey: `0x${Buffer.from(petraKeyPair.publicKey).toString("hex")}`,
    address: PETRA_ADDRESS,
  };
  const data = Buffer.from(JSON.stringify(responseBody)).toString("base64");
  adapter.handleDeeplink(
    `yieldaimobile:///api/v1/connect?response=approved&data=${data}`,
  );
  await connectPromise;
}

describe("PetraDeeplinkAdapter", () => {
  let openURLSpy: jest.SpyInstance;
  let openedUrls: string[];

  beforeEach(() => {
    openedUrls = [];
    openURLSpy = jest
      .spyOn(Linking, "openURL")
      .mockImplementation((url) => {
        openedUrls.push(String(url));
        return Promise.resolve();
      });
  });

  afterEach(() => {
    openURLSpy.mockRestore();
    jest.useRealTimers();
  });

  describe("connect URL shape", () => {
    it("targets petra:///api/v1/connect with base64 JSON envelope", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      // Don't await — connect resolves on deeplink callback. We just want the URL.
      adapter.connect().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(openedUrls).toHaveLength(1);
      const url = openedUrls[0];
      expect(url.startsWith("petra:///api/v1/connect?data=")).toBe(true);

      const payload = decodeData(url);
      expect(payload.appInfo).toEqual({
        domain: "https://yieldaimobile.app",
        name: "YieldAI",
      });
      expect(payload.redirectLink).toBe("yieldaimobile:///api/v1/connect");
      expect(payload.dappEncryptionPublicKey).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("connect callback", () => {
    it("returns existing session without opening Petra again", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);
      const callsBefore = openedUrls.length;

      await expect(adapter.connect()).resolves.toEqual({
        address: PETRA_ADDRESS,
        chain: "aptos",
      });

      expect(openedUrls.length).toBe(callsBefore);
    });

    it("ignores stale connect deeplink when no connect is pending", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);
      const sessionBefore = (adapter as unknown as { session: { sharedSecret: Uint8Array } })
        .session.sharedSecret;

      const petraKeyPair = nacl.box.keyPair();
      const staleData = Buffer.from(
        JSON.stringify({
          petraPublicEncryptedKey: `0x${Buffer.from(petraKeyPair.publicKey).toString("hex")}`,
          address: "0xdead",
        }),
      ).toString("base64");
      adapter.handleDeeplink(
        `yieldaimobile:///api/v1/connect?response=approved&data=${staleData}`,
      );

      const sessionAfter = (adapter as unknown as { session: { walletAddress: string; sharedSecret: Uint8Array } })
        .session;
      expect(sessionAfter.walletAddress).toBe(PETRA_ADDRESS);
      expect(sessionAfter.sharedSecret).toEqual(sessionBefore);
    });

    it("derives shared secret and resolves with address on approval", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      const connectPromise = adapter.connect();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Fish out our public key from the just-opened URL so we can simulate
      // Petra computing the shared secret from its own keypair.
      const sentEnvelope = decodeData(openedUrls[0]);
      const dappPubHex: string = sentEnvelope.dappEncryptionPublicKey;
      // Adapter's own dApp keys aren't exposed; we don't need them for this
      // test — we just hand back any Petra-side public key.
      const petraKeyPair = nacl.box.keyPair();
      const responseBody = {
        petraPublicEncryptedKey: `0x${Buffer.from(petraKeyPair.publicKey).toString("hex")}`,
        address: PETRA_ADDRESS,
      };
      const data = Buffer.from(JSON.stringify(responseBody)).toString("base64");

      adapter.handleDeeplink(
        `yieldaimobile:///api/v1/connect?response=approved&data=${data}`,
      );

      await expect(connectPromise).resolves.toEqual({
        address: PETRA_ADDRESS,
        chain: "aptos",
      });
      // Sanity: the dapp pub key sent matches a hex-encoded 32-byte buffer.
      expect(dappPubHex).toHaveLength(64);
    });

    it("rejects on rejection", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      const connectPromise = adapter.connect();
      await new Promise((resolve) => setTimeout(resolve, 0));
      adapter.handleDeeplink(
        "yieldaimobile:///api/v1/connect?response=rejected",
      );
      await expect(connectPromise).rejects.toThrow(/rejected/i);
    });
  });

  describe("signMessage", () => {
    it("throws when not connected", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await expect(
        adapter.signMessage(new TextEncoder().encode("hi")),
      ).rejects.toThrow(/not connected/i);
    });

    it("resolves signature from Petra plain JSON response", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);

      const signPromise = adapter.signMessage(
        new TextEncoder().encode("Hello from Yield AI"),
      );
      const signature = "0xdeadbeef";
      const responseData = Buffer.from(
        JSON.stringify({
          address: PETRA_ADDRESS,
          message: "Hello from Yield AI",
          signature,
        }),
      ).toString("base64");

      adapter.handleDeeplink(
        `yieldaimobile:///api/v1/response?response=approved&data=${responseData}`,
      );

      await expect(signPromise).resolves.toBe(signature);
    });
  });

  describe("signAndSendTransaction", () => {
    it("uses the same dapp encryption public key as the connect handshake", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);

      const connectPubHex = decodeData(openedUrls[0]).dappEncryptionPublicKey as string;

      const txPayload = {
        type: "entry_function_payload",
        function: "0x1::aptos_account::transfer",
        type_arguments: [],
        arguments: ["0x1", "100"],
      };
      const signPromise = adapter.signAndSendTransaction(
        Buffer.from(JSON.stringify(txPayload), "utf8"),
      );

      const signUrl = openedUrls[openedUrls.length - 1];
      expect(signUrl).toContain("petra:///api/v1/signAndSubmit?data=");
      const signEnvelope = decodeData(signUrl);
      expect(signEnvelope.dappEncryptionPublicKey).toBe(connectPubHex);

      const responseData = Buffer.from(
        JSON.stringify({ hash: SAMPLE_HASH }),
      ).toString("base64");
      adapter.handleDeeplink(
        `yieldaimobile:///api/v1/response?response=approved&data=${responseData}`,
      );

      await expect(signPromise).resolves.toBe(SAMPLE_HASH);
    });

    it("resolves hash from Petra plain JSON response", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);

      const txPayload = {
        type: "entry_function_payload",
        function: "0x1::aptos_account::transfer",
        type_arguments: [],
        arguments: [],
      };
      const signPromise = adapter.signAndSendTransaction(
        Buffer.from(JSON.stringify(txPayload), "utf8"),
      );
      const responseData = Buffer.from(
        JSON.stringify({ hash: SAMPLE_HASH }),
      ).toString("base64");

      adapter.handleDeeplink(
        `yieldaimobile:///api/v1/response?response=approved&data=${responseData}`,
      );

      await expect(signPromise).resolves.toBe(SAMPLE_HASH);
    });

    it("rejects disconnect while sign is in progress", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);

      const txPayload = {
        type: "entry_function_payload",
        function: "0x1::coin::transfer",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: ["0x1", 100],
      };
      const signPromise = adapter.signAndSendTransaction(
        Buffer.from(JSON.stringify(txPayload), "utf8"),
      );

      await expect(adapter.disconnect()).rejects.toThrow(/sign request is in progress/i);

      const responseData = Buffer.from(
        JSON.stringify({ hash: SAMPLE_HASH }),
      ).toString("base64");
      adapter.handleDeeplink(
        `yieldaimobile:///api/v1/response?response=approved&data=${responseData}`,
      );

      await expect(signPromise).resolves.toBe(SAMPLE_HASH);
    });

    it("times out a sign request and clears the persisted Petra session", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);

      jest.useFakeTimers();

      const txPayload = {
        type: "entry_function_payload",
        function: "0x1::coin::transfer",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: ["0x1", 100],
      };
      const signPromise = adapter.signAndSendTransaction(
        Buffer.from(JSON.stringify(txPayload), "utf8"),
      );

      expect(adapter.hasPendingSign()).toBe(true);

      jest.advanceTimersByTime(115_000);
      await expect(signPromise).rejects.toThrow(/timed out/i);

      expect(adapter.hasPendingSign()).toBe(false);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
        "petra_deeplink_session_v1",
      );
    });
  });

  describe("disconnect", () => {
    it("uses petra redirect /disconnect and resolves without waiting for callback", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);

      const disconnectPromise = adapter.disconnect();
      await expect(disconnectPromise).resolves.toBeUndefined();

      expect(openedUrls[openedUrls.length - 1]).toContain(
        "petra:///api/v1/disconnect?data=",
      );
      const payload = decodeData(openedUrls[openedUrls.length - 1]);
      expect(payload.redirectLink).toBe("yieldaimobile:///api/v1/disconnect");

      await expect(
        adapter.signAndSendTransaction(
          Buffer.from(JSON.stringify({ type: "entry_function_payload" }), "utf8"),
        ),
      ).rejects.toThrow(/not connected/i);
    });

    it("handles Petra disconnect redirect on /api/v1/disconnect", async () => {
      const adapter = new PetraDeeplinkAdapter(config);
      await connectAdapter(adapter);
      await adapter.disconnect();

      adapter.handleDeeplink(
        "yieldaimobile:///api/v1/disconnect?response=approved",
      );

      await expect(
        adapter.signMessage(new TextEncoder().encode("hi")),
      ).rejects.toThrow(/not connected/i);
    });
  });

  describe("parsePetraResponse", () => {
    it("reads response and data", () => {
      const result = parsePetraResponse(
        "yieldaimobile:///api/v1/connect?response=approved&data=abc",
      );
      expect(result).toEqual({ approved: true, data: "abc" });
    });

    it("flags rejection", () => {
      const result = parsePetraResponse(
        "yieldaimobile:///api/v1/connect?response=rejected",
      );
      expect(result).toEqual({ approved: false, data: null });
    });
  });

  describe("parsePetraSignResponseBody", () => {
    it("accepts plain hash without shared secret", () => {
      const encoded = Buffer.from(JSON.stringify({ hash: SAMPLE_HASH })).toString(
        "base64",
      );
      expect(parsePetraSignResponseBody(encoded)).toEqual({ hash: SAMPLE_HASH });
    });
  });

  describe("encryptPayload round-trip", () => {
    it("encrypted payload can be decrypted with the shared secret", () => {
      const a = nacl.box.keyPair();
      const b = nacl.box.keyPair();
      const aShared = nacl.box.before(b.publicKey, a.secretKey);
      const bShared = nacl.box.before(a.publicKey, b.secretKey);

      const original = { hello: "world", n: 42 };
      const { payloadHex, nonceHex } = encryptPayload(original, aShared);

      // Decrypt manually using the inverse of encryptPayload's double encoding.
      const ciphertext = Buffer.from(payloadHex, "hex");
      const nonce = Buffer.from(nonceHex, "hex");
      const opened = nacl.box.open.after(ciphertext, nonce, bShared);
      expect(opened).toBeTruthy();
      const outer = JSON.parse(Buffer.from(opened!).toString("utf8"));
      const inner = JSON.parse(Buffer.from(outer, "base64").toString("utf8"));
      expect(inner).toEqual(original);
    });
  });
});
