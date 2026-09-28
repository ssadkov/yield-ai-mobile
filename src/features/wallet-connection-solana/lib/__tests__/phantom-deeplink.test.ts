import bs58 from "bs58";
import nacl from "tweetnacl";
import { Platform } from "react-native";
import { openUrlInPackage } from "wallet-availability";

import { PhantomDeeplinkAdapter } from "../phantom-deeplink";
import { encryptPayload } from "../phantom-service";
import type { SolanaWalletConfig } from "../../model/types";

jest.mock("wallet-availability", () => ({
  openUrlInPackage: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-linking", () => ({
  createURL: jest.fn(
    (
      _path: string,
      options: { scheme: string; queryParams: Record<string, string> },
    ) =>
      `${options.scheme}:///?${new URLSearchParams(
        options.queryParams,
      ).toString()}`,
  ),
}));

const config: SolanaWalletConfig = {
  walletId: "phantom",
  appScheme: "yieldaimobile",
  cluster: "mainnet-beta",
  appName: "YieldAI",
};

const mockOpenUrlInPackage = jest.mocked(openUrlInPackage);

function setPlatformOS(os: "android" | "ios"): void {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

function buildConnectResponse(
  connectUrl: string,
  address = "PhantomAddress",
): string {
  const dAppPublicKeyParam = new URL(connectUrl).searchParams.get(
    "dapp_encryption_public_key",
  );
  if (!dAppPublicKeyParam) {
    throw new Error("Connect URL is missing dapp_encryption_public_key");
  }

  const phantomKeyPair = nacl.box.keyPair();
  const sharedSecret = nacl.box.before(
    bs58.decode(dAppPublicKeyParam),
    phantomKeyPair.secretKey,
  );
  const { data, nonce } = encryptPayload(
    { public_key: address, session: "PhantomSession" },
    sharedSecret,
  );
  const params = new URLSearchParams({
    walletCallback: "onConnect",
    phantom_encryption_public_key: bs58.encode(phantomKeyPair.publicKey),
    data,
    nonce,
  });

  return `yieldaimobile:///?${params.toString()}`;
}

describe("PhantomDeeplinkAdapter on Android", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    setPlatformOS("android");
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    setPlatformOS("ios");
  });

  it("opens the Phantom protocol deeplink without clearing its task and logs the URL", async () => {
    const adapter = new PhantomDeeplinkAdapter(config);
    const connectPromise = adapter.connect();

    expect(mockOpenUrlInPackage).toHaveBeenCalledTimes(1);
    const connectUrl = String(mockOpenUrlInPackage.mock.calls[0][0]);
    expect(connectUrl).toMatch(/^phantom:\/\/v1\/connect\?/);
    expect(mockOpenUrlInPackage).toHaveBeenCalledWith(
      connectUrl,
      "app.phantom",
      false,
    );
    expect(logSpy).toHaveBeenCalledWith("[Phantom] deeplink:", connectUrl);

    adapter.handleDeeplink(buildConnectResponse(connectUrl));
    await expect(connectPromise).resolves.toEqual({
      address: "PhantomAddress",
      chain: "solana",
    });
  });

  it("reuses an in-flight connect request instead of replacing its encryption key", async () => {
    const adapter = new PhantomDeeplinkAdapter(config);
    const firstConnect = adapter.connect();
    const secondConnect = adapter.connect();

    expect(mockOpenUrlInPackage).toHaveBeenCalledTimes(1);
    const connectUrl = String(mockOpenUrlInPackage.mock.calls[0][0]);
    adapter.handleDeeplink(buildConnectResponse(connectUrl));

    await expect(Promise.all([firstConnect, secondConnect])).resolves.toEqual([
      { address: "PhantomAddress", chain: "solana" },
      { address: "PhantomAddress", chain: "solana" },
    ]);
  });

  it("returns the active session without opening another connect deeplink", async () => {
    const adapter = new PhantomDeeplinkAdapter(config);
    const firstConnect = adapter.connect();
    const connectUrl = String(mockOpenUrlInPackage.mock.calls[0][0]);
    adapter.handleDeeplink(buildConnectResponse(connectUrl));
    await firstConnect;

    await expect(adapter.connect()).resolves.toEqual({
      address: "PhantomAddress",
      chain: "solana",
    });
    expect(mockOpenUrlInPackage).toHaveBeenCalledTimes(1);
  });

  it("cancelling an unanswered connect lets the next connect open Phantom again", async () => {
    const adapter = new PhantomDeeplinkAdapter(config);
    const abandoned = adapter.connect();
    const staleUrl = String(mockOpenUrlInPackage.mock.calls[0][0]);

    adapter.cancelConnect();
    await expect(abandoned).rejects.toThrow("Connection cancelled");

    // A late answer to the cancelled request is ignored.
    adapter.handleDeeplink(buildConnectResponse(staleUrl, "StaleAddress"));

    const retry = adapter.connect();
    expect(mockOpenUrlInPackage).toHaveBeenCalledTimes(2);
    const retryUrl = String(mockOpenUrlInPackage.mock.calls[1][0]);
    adapter.handleDeeplink(buildConnectResponse(retryUrl));
    await expect(retry).resolves.toEqual({ address: "PhantomAddress", chain: "solana" });
  });
});
