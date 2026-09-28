import { renderHook, act } from "@testing-library/react-native";
import { useWalletGateway } from "../use-wallet-gateway";
import type { DetectedWallet } from "@/features/wallet-discovery";
import { Platform } from "react-native";

// Mock connectors (imported by use-wallet-registry)
const mockSolanaConnector = {
  chain: "solana",
  walletId: "phantom",
  connect: jest.fn(),
  disconnect: jest.fn(),
  signAndSendTransaction: jest.fn(),
  signTransaction: jest.fn(),
  signMessage: jest.fn(),
  handleDeeplink: jest.fn(),
  dispose: jest.fn(),
};

const mockAptosConnector = {
  chain: "aptos",
  walletId: "petra",
  connect: jest.fn(),
  disconnect: jest.fn(),
  signAndSendTransaction: jest.fn(),
  signTransaction: jest.fn(),
  signMessage: jest.fn(),
  dispose: jest.fn(),
};

jest.mock("@/features/wallet-connection-solana", () => ({
  SolanaConnector: jest.fn((config: { walletId: string }) => ({
    ...mockSolanaConnector,
    walletId: config.walletId,
  })),
  MWA_WALLET_ID: "mwa",
  SEED_VAULT_WALLET_ID: "seed-vault",
  DEEPLINK_WALLET_IDS: new Set(["phantom", "solflare", "backpack"]),
  WC_WALLET_IDS: new Set(["jupiter"]),
  ANDROID_MWA_WALLET_IDS: new Set(["solflare", "backpack", "jupiter"]),
  SUPPORTED_SOLANA_WALLET_IDS: new Set([
    "mwa",
    "seed-vault",
    "phantom",
    "solflare",
    "backpack",
    "jupiter",
  ]),
}));

jest.mock("@/features/wallet-connection-aptos", () => ({
  AptosConnector: jest.fn(() => mockAptosConnector),
}));

jest.mock("@/features/solana-device", () => ({
  useSolanaDevice: () => ({ isSolanaPhone: false, isChecking: false }),
}));

jest.mock("../../lib/deeplink-handler", () => ({
  createDeeplinkHandler: jest.fn(() => ({ subscribe: jest.fn(() => jest.fn()) })),
}));

const mockWallets: DetectedWallet[] = [
  { id: "phantom", name: "Phantom", scheme: "phantom", androidPackage: "app.phantom", ecosystem: "solana", icon: 0, isInstalled: true },
];

function setPlatformOS(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

describe("useWalletGateway", () => {
  let sendCommandToWeb: jest.Mock;

  beforeEach(() => {
    setPlatformOS("ios");
    jest.clearAllMocks();
    sendCommandToWeb = jest.fn();
  });

  it("returns handleWalletCommandFromWeb function", () => {
    const { result } = renderHook(() =>
      useWalletGateway(sendCommandToWeb, mockWallets),
    );
    expect(typeof result.current.handleWalletCommandFromWeb).toBe("function");
  });

  describe("installed_wallets sync", () => {
    it("pushes installed_wallets when sync is enabled", () => {
      renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets, true),
      );

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: mockWallets,
      });
    });

    it("pushes updated wallets when discovery result changes", () => {
      const updatedWallets: DetectedWallet[] = [
        ...mockWallets,
        {
          id: "solflare",
          name: "Solflare",
          scheme: "solflare",
          androidPackage: "com.solflare.mobile",
          ecosystem: "solana",
          icon: 0,
          isInstalled: true,
        },
      ];

      const { rerender } = renderHook(
        (props: { wallets: DetectedWallet[] }) =>
          useWalletGateway(sendCommandToWeb, props.wallets, true),
        { initialProps: { wallets: mockWallets } },
      );

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: mockWallets,
      });

      sendCommandToWeb.mockClear();
      rerender({ wallets: updatedWallets });

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: updatedWallets,
      });
    });

    it("exposes only the generic Solana MWA target on Android", () => {
      setPlatformOS("android");

      renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets, true),
      );

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: [
          expect.objectContaining({
            id: "mwa",
            name: "Solana Wallet",
            ecosystem: "solana",
            isInstalled: true,
          }),
        ],
      });
    });

    it("exposes only Seed Vault as the Solana target on Solana Android devices", () => {
      setPlatformOS("android");

      renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets, true, undefined, true),
      );

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: [
          expect.objectContaining({
            id: "seed-vault",
            name: "Seed Vault",
            ecosystem: "solana",
            isInstalled: true,
          }),
        ],
      });
    });

    it("keeps Phantom out of the installed_wallets payload on Solana Android devices", () => {
      setPlatformOS("android");

      renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets, true, undefined, true),
      );

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", {
        wallets: [
          expect.objectContaining({
            id: "seed-vault",
            ecosystem: "solana",
          }),
        ],
      });
    });
  });

  describe("connect_wallet", () => {
    it("sends wallet_connected on success", async () => {
      mockSolanaConnector.connect.mockResolvedValue({
        address: "ABC123",
        chain: "solana",
        walletId: "phantom",
      });

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", {
          chain: "solana",
          walletId: "phantom",
        });
      });

      expect(mockSolanaConnector.connect).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC123",
        chain: "solana",
        walletId: "phantom",
      });
    });

    it("sends wallet_error on failure", async () => {
      mockSolanaConnector.connect.mockRejectedValue(new Error("User rejected"));

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", {
          chain: "solana",
          walletId: "phantom",
        });
      });

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", expect.objectContaining({ message: "User rejected" }));
    });

    it("defaults missing Solana walletId to Phantom", async () => {
      mockSolanaConnector.connect.mockResolvedValue({
        address: "ABC123",
        chain: "solana",
        walletId: "phantom",
      });
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", { chain: "solana" });
      });

      expect(mockSolanaConnector.connect).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC123",
        chain: "solana",
        walletId: "phantom",
      });
    });

    it("routes missing Solana walletId to generic MWA on Android", async () => {
      setPlatformOS("android");
      mockSolanaConnector.connect.mockResolvedValue({
        address: "ABC123",
        chain: "solana",
        walletId: "mwa",
      });
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", {
          chain: "solana",
        });
      });

      expect(mockSolanaConnector.connect).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC123",
        chain: "solana",
        walletId: "mwa",
      });
    });

    it("routes missing Solana walletId to Seed Vault on Solana Android devices", async () => {
      setPlatformOS("android");
      mockSolanaConnector.connect.mockResolvedValue({
        address: "ABC123",
        chain: "solana",
        walletId: "seed-vault",
      });
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets, false, undefined, true),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", {
          chain: "solana",
        });
      });

      expect(mockSolanaConnector.connect).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC123",
        chain: "solana",
        walletId: "seed-vault",
      });
    });

    it("routes explicit Phantom on a Solana Android device when installed", async () => {
      setPlatformOS("android");
      mockSolanaConnector.connect.mockResolvedValue({
        address: "ABC123",
        chain: "solana",
        walletId: "phantom",
      });
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets, false, undefined, true),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", {
          chain: "solana",
          walletId: "phantom",
        });
      });

      expect(mockSolanaConnector.connect).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_connected", {
        address: "ABC123",
        chain: "solana",
        walletId: "phantom",
      });
    });

    it("sends wallet_error when chain is missing", () => {
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );
      result.current.handleWalletCommandFromWeb("connect_wallet", {});
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", expect.objectContaining({ code: "INVALID_PAYLOAD" }));
    });

    it("sends wallet_error for unsupported chain", async () => {
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("connect_wallet", {
          chain: "evm",
          walletId: "metamask",
        });
      });

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", expect.objectContaining({ code: "CHAIN_NOT_SUPPORTED" }));
    });
  });

  describe("disconnect_wallet", () => {
    it("sends wallet_disconnected on success", async () => {
      mockSolanaConnector.disconnect.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("disconnect_wallet", { chain: "solana" });
      });

      expect(mockSolanaConnector.disconnect).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_disconnected", { chain: "solana" });
    });
  });

  describe("sign_transaction", () => {
    it("calls signAndSendTransaction by default and sends transaction_submitted", async () => {
      mockSolanaConnector.signAndSendTransaction.mockResolvedValue("sig_abc");

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      const txBase64 = Buffer.from([1, 2, 3]).toString("base64");

      await act(async () => {
        result.current.handleWalletCommandFromWeb("sign_transaction", {
          chain: "solana",
          transaction: txBase64,
          requestId: "req_001",
        });
      });

      expect(mockSolanaConnector.signAndSendTransaction).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_submitted", { signature: "sig_abc", requestId: "req_001" });
    });

    it("keeps transaction deduplication across a wallet-discovery rerender", async () => {
      let resolveSign!: (signature: string) => void;
      mockSolanaConnector.signAndSendTransaction.mockReturnValue(
        new Promise((resolve) => {
          resolveSign = resolve;
        }),
      );
      const { result, rerender } = renderHook(
        (props: { wallets: DetectedWallet[] }) =>
          useWalletGateway(sendCommandToWeb, props.wallets),
        { initialProps: { wallets: mockWallets } },
      );
      const payload = {
        chain: "solana",
        transaction: Buffer.from([1, 2, 3]).toString("base64"),
        requestId: "req_duplicate",
      };

      result.current.handleWalletCommandFromWeb("sign_transaction", payload);
      rerender({ wallets: [...mockWallets] });
      result.current.handleWalletCommandFromWeb("sign_transaction", payload);

      expect(mockSolanaConnector.signAndSendTransaction).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSign("sig_once");
      });

      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_submitted", {
        signature: "sig_once",
        requestId: "req_duplicate",
      });
    });

    it("calls signTransaction when send=false", async () => {
      mockSolanaConnector.signTransaction.mockResolvedValue("signed_tx");

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("sign_transaction", {
          chain: "solana",
          transaction: Buffer.from([4, 5]).toString("base64"),
          requestId: "req_002",
          send: false,
        });
      });

      expect(mockSolanaConnector.signTransaction).toHaveBeenCalled();
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_signed", {
        transaction: "signed_tx",
        signedTransaction: "signed_tx",
        signature: "signed_tx",
        requestId: "req_002",
      });
    });

    it("calls signAndSendTransaction for explicit sign_and_submit_transaction", async () => {
      mockSolanaConnector.signAndSendTransaction.mockResolvedValue("sig_submit");

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("sign_and_submit_transaction", {
          chain: "solana",
          transaction: Buffer.from([6, 7]).toString("base64"),
          requestId: "req_submit",
          send: false,
        });
      });

      expect(mockSolanaConnector.signAndSendTransaction).toHaveBeenCalledWith(Buffer.from([6, 7]));
      expect(sendCommandToWeb).toHaveBeenCalledWith("transaction_submitted", { signature: "sig_submit", requestId: "req_submit" });
    });
  });

  describe("sign_message", () => {
    it("sends message_signed on success", async () => {
      mockSolanaConnector.signMessage.mockResolvedValue("msg_sig");

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      const msgBase64 = Buffer.from("hello").toString("base64");

      await act(async () => {
        result.current.handleWalletCommandFromWeb("sign_message", {
          chain: "solana",
          message: msgBase64,
          requestId: "req_003",
        });
      });

      expect(mockSolanaConnector.signMessage).toHaveBeenCalledWith(Buffer.from("hello"));
      expect(sendCommandToWeb).toHaveBeenCalledWith("message_signed", { signature: "msg_sig", requestId: "req_003" });
    });

    it("signs plaintext messages as utf8", async () => {
      mockSolanaConnector.signMessage.mockResolvedValue("msg_sig");

      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      await act(async () => {
        result.current.handleWalletCommandFromWeb("sign_message", {
          chain: "solana",
          message: "Hello from Yield AI",
          requestId: "req_utf8",
        });
      });

      expect(mockSolanaConnector.signMessage).toHaveBeenCalledWith(
        Buffer.from("Hello from Yield AI", "utf8"),
      );
      expect(sendCommandToWeb).toHaveBeenCalledWith("message_signed", {
        signature: "msg_sig",
        requestId: "req_utf8",
      });
    });
  });

  describe("get_installed_wallets", () => {
    it("sends installed_wallets with detected wallets", () => {
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      result.current.handleWalletCommandFromWeb("get_installed_wallets");

      expect(sendCommandToWeb).toHaveBeenCalledWith("installed_wallets", { wallets: mockWallets });
    });
  });

  describe("unknown command", () => {
    it("sends wallet_error with UNKNOWN_COMMAND code", () => {
      const { result } = renderHook(() =>
        useWalletGateway(sendCommandToWeb, mockWallets),
      );

      result.current.handleWalletCommandFromWeb("unknown_action", {
        requestId: "req_999",
      });

      expect(sendCommandToWeb).toHaveBeenCalledWith("wallet_error", {
        code: "UNKNOWN_COMMAND",
        message: "Unknown bridge command: unknown_action",
        commandType: "unknown_action",
        requestId: "req_999",
      });
    });
  });
});
