import { Platform } from "react-native";
import { canConnect, createNativeDriver, nativeWalletId, useWalletEnv } from "../native-driver";
import { WalletError } from "../types";

jest.mock("@/features/wallet-connection-solana", () => ({ MWA_WALLET_ID: "mwa", SEED_VAULT_WALLET_ID: "seed-vault" }));

const seeker = { isSolanaPhone: true, phantomInstalled: true };
const android = { isSolanaPhone: false, phantomInstalled: true };

describe("nativeWalletId", () => {
  beforeAll(() => {
    Platform.OS = "android";
  });

  it("uses Seed Vault on a Seeker and MWA elsewhere", () => {
    expect(nativeWalletId("seed-vault", seeker)).toBe("seed-vault");
    expect(nativeWalletId("seed-vault", android)).toBe("mwa");
    expect(nativeWalletId("mwa", android)).toBe("mwa");
  });

  it("uses the Phantom connector on a Seeker, MWA on other Android phones", () => {
    expect(nativeWalletId("phantom", seeker)).toBe("phantom");
    expect(nativeWalletId("phantom", android)).toBe("mwa");
  });

  it("rejects Phantom on a Seeker without the app, and wallets the app can't use", () => {
    expect(() => nativeWalletId("phantom", { ...seeker, phantomInstalled: false })).toThrow(WalletError);
    expect(() => nativeWalletId("metamask", seeker)).toThrow("Not available in the app yet.");
    expect(() => nativeWalletId("privy", seeker)).toThrow(WalletError);
  });
});

describe("canConnect", () => {
  afterEach(() => {
    Platform.OS = "android";
  });

  it("routes MWA-capable Solana wallets through the MWA picker on a regular Android phone", () => {
    Platform.OS = "android";
    for (const id of ["solflare", "backpack", "jupiter"] as const) {
      expect(nativeWalletId(id, android)).toBe("mwa");
    }
    expect(canConnect("solflare", seeker)).toBe(false);
  });

  it("marks wallets without a connector as not connectable (\"Soon\")", () => {
    Platform.OS = "android";
    for (const id of ["metamask", "privy", "trust", "okx", "bitget", "coinbase", "rainbow", "uniswap", "glow", "petra"] as const) {
      expect(canConnect(id, android)).toBe(false);
    }
    expect(canConnect("seed-vault", seeker)).toBe(true);
    expect(canConnect("mwa", android)).toBe(true);
    // Phantom missing on a Seeker is an install problem, not "Soon".
    expect(canConnect("phantom", { ...seeker, phantomInstalled: false })).toBe(true);
  });

  it("uses each wallet's own connector on iOS", () => {
    Platform.OS = "ios";
    expect(nativeWalletId("solflare", android)).toBe("solflare");
    expect(nativeWalletId("jupiter", android)).toBe("jupiter");
    expect(canConnect("trust", android)).toBe(false);
  });
});

describe("native driver", () => {
  const service = { connect: jest.fn(), disconnect: jest.fn(), signMessage: jest.fn() };

  beforeEach(() => {
    Platform.OS = "android";
    jest.clearAllMocks();
    service.connect.mockResolvedValue({ address: "Addr1", chain: "solana", walletId: "seed-vault" });
    service.signMessage.mockResolvedValue("sig");
    useWalletEnv.setState({ service: service as never, ...seeker });
  });

  it("reconnects silently before signing when the connector has no session (after a restart)", async () => {
    const driver = createNativeDriver(() => "seed-vault");
    const phases: string[] = [];
    const sig = await driver.signAndSubmit({ id: "d", kind: "deposit", title: "Deposit $100", detail: "USDC into Flexible" }, (p) => phases.push(p), "Seed Vault");
    expect(sig).toBe("sig");
    expect(service.connect).toHaveBeenCalledWith("solana", "seed-vault");
    expect(service.signMessage).toHaveBeenCalledWith("solana", "Yield AI (test): Deposit $100 — USDC into Flexible", "utf8");
    expect(phases).toEqual(["signing", "submitting"]);

    // Second signature reuses the session.
    await driver.signAndSubmit({ id: "d2", kind: "deposit", title: "x", detail: "y" }, () => {}, "Seed Vault");
    expect(service.connect).toHaveBeenCalledTimes(1);
  });

  it("maps a declined signature to USER_REJECTED", async () => {
    const driver = createNativeDriver(() => "seed-vault");
    await driver.connect("seed-vault", "Seed Vault");
    service.signMessage.mockRejectedValueOnce(new Error("User declined the request"));
    await expect(driver.signAndSubmit({ id: "d", kind: "deposit", title: "t", detail: "d" }, () => {}, "Seed Vault")).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("fails clearly while wallets are still loading", async () => {
    useWalletEnv.setState({ service: null });
    await expect(createNativeDriver(() => "seed-vault").connect("seed-vault", "Seed Vault")).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
  });
});
