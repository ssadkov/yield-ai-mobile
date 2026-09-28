import { createWebViewCommandHandler } from "../webview-command-handler";
import { WalletConnectionError } from "../../model/types";
import type { WalletService } from "../../model/wallet-service";
import type { DetectedWallet } from "@/features/wallet-discovery";
import { Platform } from "react-native";

const MWA_WALLET_ID = "mwa";
const SEED_VAULT_WALLET_ID = "seed-vault";

function createMockService(): jest.Mocked<WalletService> {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    signTransaction: jest.fn(),
    signMessage: jest.fn(),
  } as unknown as jest.Mocked<WalletService>;
}

const mockWallets: DetectedWallet[] = [
  {
    id: "phantom",
    name: "Phantom",
    scheme: "phantom",
    androidPackage: "app.phantom",
    ecosystem: "solana",
    icon: 0,
    isInstalled: true,
  },
];

function setPlatformOS(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

describe("createWebViewCommandHandler", () => {
  let service: jest.Mocked<WalletService>;
  let sendCommandToWeb: jest.Mock;
  let handleCommand: (
    type: string,
    payload?: Record<string, unknown>,
  ) => void;

  beforeEach(() => {
    setPlatformOS("ios");
    jest.clearAllMocks();
    service = createMockService();
    sendCommandToWeb = jest.fn();
    handleCommand = createWebViewCommandHandler(service, sendCommandToWeb, mockWallets);
  });

  describe("connect_wallet", () => {
    it("sends wallet_connected on success", async () => {
      const account = { address: "ABC", chain: "solana", walletId: "phantom" };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", { chain: "solana", walletId: "phantom" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", "phantom");
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC",
        chain: "solana",
        walletId: "phantom",
      });
    });

    it("defaults missing Aptos walletId to Petra", async () => {
      const account = { address: "0xabc", chain: "aptos", walletId: "petra" };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", { chain: "aptos" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("aptos", "petra");
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "0xabc",
        chain: "aptos",
        walletId: "petra",
      });
    });

    it("routes Solana connect through generic MWA on Android", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(service, sendCommandToWeb, mockWallets);
      const account = { address: "ABC", chain: "solana", walletId: MWA_WALLET_ID };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", { chain: "solana", walletId: "jupiter" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", MWA_WALLET_ID);
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC",
        chain: "solana",
        walletId: MWA_WALLET_ID,
      });
    });

    it("routes Solana connect through Seed Vault on Solana Android devices", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        mockWallets,
        SEED_VAULT_WALLET_ID,
      );
      const account = {
        address: "ABC",
        chain: "solana",
        walletId: SEED_VAULT_WALLET_ID,
      };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", { chain: "solana", walletId: "jupiter" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", SEED_VAULT_WALLET_ID);
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC",
        chain: "solana",
        walletId: SEED_VAULT_WALLET_ID,
      });
    });

    it("allows an explicitly enabled Phantom target on Solana Android devices", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        mockWallets,
        SEED_VAULT_WALLET_ID,
        new Set(["phantom"]),
      );
      const account = {
        address: "ABC",
        chain: "solana",
        walletId: "phantom",
      };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", {
        chain: "solana",
        walletId: "phantom",
      });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", "phantom");
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC",
        chain: "solana",
        walletId: "phantom",
      });
    });

    it("keeps routing explicit Phantom to MWA on regular Android devices", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        mockWallets,
      );
      service.connect.mockResolvedValue({
        address: "ABC",
        chain: "solana",
        walletId: MWA_WALLET_ID,
      });

      handleCommand("connect_wallet", {
        chain: "solana",
        walletId: "phantom",
      });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", MWA_WALLET_ID);
    });

    it("keeps routing explicit Phantom to Seed Vault when Phantom is not enabled", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        mockWallets,
        SEED_VAULT_WALLET_ID,
      );
      service.connect.mockResolvedValue({
        address: "ABC",
        chain: "solana",
        walletId: SEED_VAULT_WALLET_ID,
      });

      handleCommand("connect_wallet", {
        chain: "solana",
        walletId: "phantom",
      });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith(
        "solana",
        SEED_VAULT_WALLET_ID,
      );
    });

    it("keeps Seed Vault as the default when Phantom is enabled", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        mockWallets,
        SEED_VAULT_WALLET_ID,
        new Set(["phantom"]),
      );
      service.connect.mockResolvedValue({
        address: "ABC",
        chain: "solana",
        walletId: SEED_VAULT_WALLET_ID,
      });

      handleCommand("connect_wallet", { chain: "solana" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith(
        "solana",
        SEED_VAULT_WALLET_ID,
      );
    });

    it("maps chain all connect to Petra", async () => {
      const account = { address: "0xabc", chain: "aptos", walletId: "petra" };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", { chain: "all" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("aptos", "petra");
    });

    it("maps chain all connect to generic MWA on Android", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(service, sendCommandToWeb, mockWallets);
      const account = { address: "ABC", chain: "solana", walletId: MWA_WALLET_ID };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", { chain: "all" });
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", MWA_WALLET_ID);
    });

    it("defaults missing chain connect to the Android Solana target", async () => {
      setPlatformOS("android");
      handleCommand = createWebViewCommandHandler(
        service,
        sendCommandToWeb,
        mockWallets,
        SEED_VAULT_WALLET_ID,
      );
      const account = {
        address: "ABC",
        chain: "solana",
        walletId: SEED_VAULT_WALLET_ID,
      };
      service.connect.mockResolvedValue(account);

      handleCommand("connect_wallet", {});
      await flushPromises();

      expect(service.connect).toHaveBeenCalledWith("solana", SEED_VAULT_WALLET_ID);
    });

    it("sends wallet_error on failure", async () => {
      service.connect.mockRejectedValue(new Error("User rejected"));

      handleCommand("connect_wallet", { chain: "solana", walletId: "phantom" });
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledWith(
        "wallet_error",
        expect.objectContaining({ message: "User rejected" }),
      );
    });

    it("preserves native wallet error code on failure", async () => {
      const error = new Error("-1/authorization request failed") as Error & {
        code: number;
      };
      error.code = -1;
      service.connect.mockRejectedValue(error);

      handleCommand("connect_wallet", { chain: "solana", walletId: "mwa" });
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "-1",
        message: "-1/authorization request failed",
      });
    });

    it("sends wallet_error with code from WalletConnectionError", async () => {
      service.connect.mockRejectedValue(
        new WalletConnectionError("CHAIN_NOT_SUPPORTED", "No connector"),
      );

      handleCommand("connect_wallet", { chain: "evm", walletId: "metamask" });
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "CHAIN_NOT_SUPPORTED",
        message: "No connector",
      });
    });

    it("sends INVALID_PAYLOAD when chain missing", async () => {
      handleCommand("connect_wallet", {});
      await flushPromises();

      expect(service.connect).not.toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith(
        "wallet_error",
        expect.objectContaining({ code: "INVALID_PAYLOAD" }),
      );
    });
  });

  describe("disconnect_wallet", () => {
    it("sends wallet_disconnected on success", async () => {
      service.disconnect.mockResolvedValue(undefined);

      handleCommand("disconnect_wallet", { chain: "solana" });
      await flushPromises();

      expect(service.disconnect).toHaveBeenCalledWith("solana");
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_disconnected", {
        chain: "solana",
      });
    });

    it("sends INVALID_PAYLOAD when chain missing", () => {
      handleCommand("disconnect_wallet", {});

      expect(sendCommandToWeb).toHaveBeenCalledWith(
        "wallet_error",
        expect.objectContaining({ code: "INVALID_PAYLOAD" }),
      );
    });

    it("disconnects Aptos and Solana for chain all", async () => {
      service.disconnect.mockResolvedValue(undefined);

      handleCommand("disconnect_wallet", { chain: "all" });
      await flushPromises();

      expect(service.disconnect).toHaveBeenCalledWith("aptos");
      expect(service.disconnect).toHaveBeenCalledWith("solana");
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_disconnected", {
        chain: "all",
      });
    });

    it("reports SIGN_IN_PROGRESS for chain all disconnect", async () => {
      service.disconnect.mockImplementation(async (chain) => {
        if (chain === "aptos") {
          throw new WalletConnectionError(
            "SIGN_IN_PROGRESS",
            "Cannot disconnect while signing",
          );
        }
      });

      handleCommand("disconnect_wallet", { chain: "all" });
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "SIGN_IN_PROGRESS",
        message: "Cannot disconnect while signing",
      });
    });
  });

  describe("sign_transaction", () => {
    it("sends transaction_submitted on success (send=true by default)", async () => {
      service.signTransaction.mockResolvedValue("sig_abc");

      handleCommand("sign_transaction", {
        chain: "solana",
        transaction: "AQID",
        requestId: "req_001",
      });
      await flushPromises();

      expect(service.signTransaction).toHaveBeenCalledWith(
        "solana",
        "AQID",
        true,
      );
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_submitted", {
        signature: "sig_abc",
        requestId: "req_001",
      });
    });

    it("ignores a duplicate in-flight transaction request", async () => {
      let resolveSign!: (signature: string) => void;
      service.signTransaction.mockReturnValue(
        new Promise((resolve) => {
          resolveSign = resolve;
        }),
      );
      const payload = {
        chain: "solana",
        transaction: "AQID",
        requestId: "req_duplicate",
      };

      handleCommand("sign_transaction", payload);
      handleCommand("sign_transaction", payload);

      expect(service.signTransaction).toHaveBeenCalledTimes(1);

      resolveSign("sig_once");
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledTimes(1);
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_submitted", {
        signature: "sig_once",
        requestId: "req_duplicate",
      });
    });

    it("passes send=false when specified", async () => {
      service.signTransaction.mockResolvedValue("signed_tx");

      handleCommand("sign_transaction", {
        chain: "solana",
        transaction: "AQID",
        requestId: "req_002",
        send: false,
      });
      await flushPromises();

      expect(service.signTransaction).toHaveBeenCalledWith(
        "solana",
        "AQID",
        false,
      );
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_signed", {
        transaction: "signed_tx",
        signedTransaction: "signed_tx",
        signature: "signed_tx",
        requestId: "req_002",
      });
    });

    it("forces send=true for explicit sign_and_submit_transaction", async () => {
      service.signTransaction.mockResolvedValue("sig_submit");

      handleCommand("sign_and_submit_transaction", {
        chain: "solana",
        transaction: "AQID",
        requestId: "req_submit",
        send: false,
      });
      await flushPromises();

      expect(service.signTransaction).toHaveBeenCalledWith(
        "solana",
        "AQID",
        true,
      );
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_submitted", {
        signature: "sig_submit",
        requestId: "req_submit",
      });
    });

    it("includes requestId in error response", async () => {
      service.signTransaction.mockRejectedValue(new Error("fail"));

      handleCommand("sign_transaction", {
        chain: "solana",
        transaction: "AQID",
        requestId: "req_003",
      });
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledWith(
        "wallet_error",
        expect.objectContaining({ requestId: "req_003" }),
      );
    });

    it("marks Aptos wallet disconnected when Petra session expires", async () => {
      service.signTransaction.mockRejectedValue(
        new Error("Petra request timed out. Reconnect Petra in the app, then retry."),
      );

      handleCommand("sign_and_submit_transaction", {
        chain: "aptos",
        transaction: "AQID",
        requestId: "req_petra_timeout",
      });
      await flushPromises();

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "WALLET_SESSION_EXPIRED",
        message: "Petra request timed out. Reconnect Petra in the app, then retry.",
        requestId: "req_petra_timeout",
      });
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_disconnected", {
        chain: "aptos",
        reason: "session_expired",
      });
    });
  });

  describe("sign_message", () => {
    it("sends message_signed on success", async () => {
      service.signMessage.mockResolvedValue("msg_sig");

      handleCommand("sign_message", {
        chain: "solana",
        message: "aGVsbG8=",
        requestId: "req_004",
      });
      await flushPromises();

      expect(service.signMessage).toHaveBeenCalledWith(
        "solana",
        "aGVsbG8=",
        undefined,
      );
      expect(sendCommandToWeb).toHaveBeenCalledWith("message_signed", {
        signature: "msg_sig",
        requestId: "req_004",
      });
    });

    it("passes explicit message encoding when provided", async () => {
      service.signMessage.mockResolvedValue("msg_sig");

      handleCommand("sign_message", {
        chain: "solana",
        message: "Hello from Yield AI",
        requestId: "req_utf8",
        encoding: "utf8",
      });
      await flushPromises();

      expect(service.signMessage).toHaveBeenCalledWith(
        "solana",
        "Hello from Yield AI",
        "utf8",
      );
    });
  });

  describe("get_installed_wallets", () => {
    it("sends installed_wallets with detected wallets", () => {
      handleCommand("get_installed_wallets");

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: mockWallets,
      });
    });
  });

  describe("unknown command", () => {
    const originalDev = __DEV__;

    afterEach(() => {
      (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    });

    it("sends wallet_error with UNKNOWN_COMMAND code in dev", () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      handleCommand("unknown_action", { requestId: "req_999" });

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "UNKNOWN_COMMAND",
        message: "Unknown bridge command: unknown_action",
        commandType: "unknown_action",
        requestId: "req_999",
      });
    });

    it("sends generic INVALID_REQUEST in production", () => {
      (global as { __DEV__?: boolean }).__DEV__ = false;
      handleCommand("unknown_action", { requestId: "req_999" });

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "INVALID_REQUEST",
        message: "Invalid bridge request",
        requestId: "req_999",
      });
    });
  });
});

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
