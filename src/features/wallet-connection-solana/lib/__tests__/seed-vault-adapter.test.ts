import { Buffer } from "buffer";
import bs58 from "bs58";
import { PermissionsAndroid, Platform } from "react-native";
import { SeedVault } from "@solana-mobile/seed-vault-lib";
import { SeedVaultAdapter } from "../seed-vault-adapter";
import type { SolanaWalletConfig } from "../../model/types";

jest.mock("@solana-mobile/seed-vault-lib", () => ({
  SeedVaultPermissionAndroid: "com.solanamobile.seedvault.ACCESS_SEED_VAULT",
  SeedVault: {
    isSeedVaultAvailable: jest.fn(),
    getAuthorizedSeeds: jest.fn(),
    authorizeNewSeed: jest.fn(),
    getUserWallets: jest.fn(),
    getAccounts: jest.fn(),
    deauthorizeSeed: jest.fn(),
    signTransaction: jest.fn(),
    signMessage: jest.fn(),
  },
}));

const mockSeedVault = jest.mocked(SeedVault) as jest.Mocked<Record<
  keyof typeof SeedVault,
  jest.Mock
>>;

function setPlatformOS(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

const config: SolanaWalletConfig = {
  walletId: "seed-vault",
  appScheme: "testapp",
  cluster: "devnet",
  appName: "Test App",
};

const publicKey = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));
const signature = Uint8Array.from(Array.from({ length: 64 }, (_, i) => 64 - i));
const derivationPath = "bip44://m/44'/501'/0'/0'";

function buildLegacyTransaction(): Uint8Array {
  return Uint8Array.from([
    1,
    ...new Array(64).fill(0),
    1,
    0,
    0,
    1,
    ...publicKey,
    ...new Array(32).fill(7),
    0,
  ]);
}

function buildVersionedTransaction(): Uint8Array {
  return Uint8Array.from([
    1,
    ...new Array(64).fill(0),
    0x80,
    1,
    0,
    0,
    1,
    ...publicKey,
    ...new Array(32).fill(7),
    0,
    0,
  ]);
}

describe("SeedVaultAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOS("android");
    jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
    jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(
      PermissionsAndroid.RESULTS.GRANTED,
    );
    mockSeedVault.isSeedVaultAvailable.mockResolvedValue(true);
    mockSeedVault.getAuthorizedSeeds.mockResolvedValue([]);
    mockSeedVault.authorizeNewSeed.mockResolvedValue({ authToken: "auth-1" });
    mockSeedVault.getUserWallets.mockResolvedValue([
      {
        id: "account-1",
        name: "Main Wallet",
        derivationPath,
        publicKeyEncoded: Buffer.from(publicKey).toString("base64"),
      },
    ]);
    mockSeedVault.getAccounts.mockResolvedValue([]);
  });

  it("connects to an authorized Seed Vault user wallet", async () => {
    const adapter = new SeedVaultAdapter(config);

    const account = await adapter.connect();

    expect(mockSeedVault.authorizeNewSeed).toHaveBeenCalled();
    expect(mockSeedVault.getUserWallets).toHaveBeenCalledWith("auth-1");
    expect(account).toEqual({
      address: bs58.encode(publicKey),
      chain: "solana",
    });
  });

  it("reuses a previously authorized seed", async () => {
    mockSeedVault.getAuthorizedSeeds.mockResolvedValue([
      { authToken: "auth-existing" },
    ]);
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();

    expect(mockSeedVault.authorizeNewSeed).not.toHaveBeenCalled();
    expect(mockSeedVault.getUserWallets).toHaveBeenCalledWith("auth-existing");
  });

  it("authorizes a seed when the authorized-seed URI grant is unavailable", async () => {
    mockSeedVault.getAuthorizedSeeds.mockRejectedValue(
      new Error(
        "Permission Denial: requires ACCESS_SEED_VAULT_PRIVILEGED, or grantUriPermission()",
      ),
    );
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();

    expect(mockSeedVault.authorizeNewSeed).toHaveBeenCalled();
  });

  it("passes all native arguments when falling back to Seed Vault accounts", async () => {
    mockSeedVault.getUserWallets.mockResolvedValue([]);
    mockSeedVault.getAccounts.mockResolvedValue([
      {
        derivationPath,
        publicKeyEncoded: Buffer.from(publicKey).toString("base64"),
      },
    ]);
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();

    expect(mockSeedVault.getAccounts).toHaveBeenCalledWith(
      "auth-1",
      undefined,
      undefined,
    );
  });

  it("rolls back a new seed authorization when account lookup fails", async () => {
    mockSeedVault.getUserWallets.mockResolvedValue([]);
    mockSeedVault.getAccounts.mockRejectedValue(
      new Error("Native account lookup failed"),
    );
    const adapter = new SeedVaultAdapter(config);

    await expect(adapter.connect()).rejects.toThrow("Native account lookup failed");

    expect(mockSeedVault.deauthorizeSeed).toHaveBeenCalledWith("auth-1");
  });

  it("requests Seed Vault permission when it has not been granted", async () => {
    jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();

    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      "com.solanamobile.seedvault.ACCESS_SEED_VAULT",
      expect.objectContaining({
        title: "Seed Vault Permission",
      }),
    );
  });

  it("fails when Seed Vault permission is denied", async () => {
    jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
    jest.mocked(PermissionsAndroid.request).mockResolvedValue(
      PermissionsAndroid.RESULTS.DENIED,
    );
    const adapter = new SeedVaultAdapter(config);

    await expect(adapter.connect()).rejects.toThrow("Seed Vault permission was denied");
    expect(mockSeedVault.authorizeNewSeed).not.toHaveBeenCalled();
  });

  it("signs a transaction and returns signed transaction bytes as base64", async () => {
    mockSeedVault.signTransaction.mockResolvedValue({
      signatures: [Buffer.from(signature).toString("base64")],
      resolvedDerivationPaths: [derivationPath],
    });
    const transaction = buildLegacyTransaction();
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();
    const signedTransactionBase64 = await adapter.signTransaction(transaction);
    const signedTransaction = Buffer.from(signedTransactionBase64, "base64");

    expect(mockSeedVault.signTransaction).toHaveBeenCalledWith(
      "auth-1",
      derivationPath,
      Buffer.from(transaction.subarray(65)).toString("base64"),
    );
    expect(signedTransaction.subarray(1, 65)).toEqual(Buffer.from(signature));
  });

  it("signs only the message bytes of a versioned transaction", async () => {
    mockSeedVault.signTransaction.mockResolvedValue({
      signatures: [Buffer.from(signature).toString("base64")],
      resolvedDerivationPaths: [derivationPath],
    });
    const transaction = buildVersionedTransaction();
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();
    const signedTransactionBase64 = await adapter.signTransaction(transaction);
    const signedTransaction = Buffer.from(signedTransactionBase64, "base64");

    expect(mockSeedVault.signTransaction).toHaveBeenCalledWith(
      "auth-1",
      derivationPath,
      Buffer.from(transaction.subarray(65)).toString("base64"),
    );
    expect(signedTransaction.subarray(1, 65)).toEqual(Buffer.from(signature));
  });

  it("returns message signatures as base64", async () => {
    mockSeedVault.signMessage.mockResolvedValue({
      signatures: [Buffer.from(signature).toString("base64")],
      resolvedDerivationPaths: [derivationPath],
    });
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();
    const result = await adapter.signMessage(Uint8Array.from([1, 2, 3]));

    expect(result).toBe(Buffer.from(signature).toString("base64"));
    expect(mockSeedVault.signMessage).toHaveBeenCalledWith(
      "auth-1",
      derivationPath,
      Buffer.from([1, 2, 3]).toString("base64"),
    );
  });

  it("deauthorizes the seed on disconnect", async () => {
    const adapter = new SeedVaultAdapter(config);

    await adapter.connect();
    await adapter.disconnect();

    expect(mockSeedVault.deauthorizeSeed).toHaveBeenCalledWith("auth-1");
  });
});
