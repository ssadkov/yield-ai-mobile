import type { WalletService } from "@/core/wallet";
import { WalletConnectionError } from "@/core/wallet";
import type { DetectedWallet } from "@/features/wallet-discovery";
import type { BridgeCommandFromWebHandler } from "@/shared/types";
import { Platform } from "react-native";

const MWA_WALLET_ID = "mwa";

function errorToPayload(error: unknown): Record<string, unknown> {
  if (error instanceof WalletConnectionError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    if (/Petra request timed out|Reconnect Petra/i.test(error.message)) {
      return { code: "WALLET_SESSION_EXPIRED", message: error.message };
    }
    const nativeCode = (error as Error & { code?: unknown }).code;
    if (typeof nativeCode === "string" || typeof nativeCode === "number") {
      return { code: String(nativeCode), message: error.message };
    }
    return { code: "UNKNOWN", message: error.message };
  }
  return { code: "UNKNOWN", message: String(error) };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function messageEncoding(value: unknown): "base64" | "utf8" | undefined {
  return value === "base64" || value === "utf8" ? value : undefined;
}

function shouldMarkWalletDisconnected(
  chain: string,
  errorPayload: Record<string, unknown>,
): boolean {
  return chain === "aptos" && errorPayload.code === "WALLET_SESSION_EXPIRED";
}

function defaultWalletIdForChain(
  chain: string,
  wallets: DetectedWallet[],
  androidSolanaWalletId: string,
): string | undefined {
  if (chain === "aptos") return "petra";
  if (chain === "solana") {
    if (Platform.OS === "android") return androidSolanaWalletId;
    return (
      wallets.find((wallet) => wallet.ecosystem === "solana" && wallet.isInstalled)
        ?.id ?? "phantom"
    );
  }
  return undefined;
}

function normalizeConnectTarget(
  chain: string | undefined,
  walletId: string | undefined,
  wallets: DetectedWallet[],
  androidSolanaWalletId: string,
  allowedAndroidSolanaWalletIds: ReadonlySet<string>,
): { chain: string; walletId: string } | null {
  if (!chain) {
    if (Platform.OS !== "android") return null;
    return { chain: "solana", walletId: androidSolanaWalletId };
  }

  // The web app's top-level native connect button sends `chain: "all"`.
  // Native cannot safely open multiple external wallet apps at once. Android
  // has a system Solana wallet route, so use that instead of the RN picker.
  const resolvedChain =
    chain === "all" ? (Platform.OS === "android" ? "solana" : "aptos") : chain;
  const resolvedWalletId =
    resolvedChain === "solana" && Platform.OS === "android"
      ? walletId && allowedAndroidSolanaWalletIds.has(walletId)
        ? walletId
        : androidSolanaWalletId
      : walletId ?? defaultWalletIdForChain(
          resolvedChain,
          wallets,
          androidSolanaWalletId,
        );
  if (!resolvedWalletId) return null;
  return { chain: resolvedChain, walletId: resolvedWalletId };
}

function disconnectTargets(chain: string): string[] {
  if (chain === "all") return ["aptos", "solana"];
  return [chain];
}

function isSignInProgressError(reason: unknown): boolean {
  return (
    reason instanceof WalletConnectionError &&
    reason.code === "SIGN_IN_PROGRESS"
  );
}

async function disconnectWalletTargets(
  service: WalletService,
  chain: string,
): Promise<void> {
  const targets = disconnectTargets(chain);
  if (targets.length === 1) {
    await service.disconnect(targets[0]);
    return;
  }

  const results = await Promise.allSettled(
    targets.map((target) => service.disconnect(target)),
  );
  const signInProgress = results.find(
    (result) =>
      result.status === "rejected" && isSignInProgressError(result.reason),
  );
  if (signInProgress?.status === "rejected") {
    throw signInProgress.reason;
  }

  if (results.some((result) => result.status === "fulfilled")) {
    return;
  }

  const firstRejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (firstRejected) throw firstRejected.reason;
}

/**
 * Routes commands from WebView to WalletService and sends results
 * back to the web layer via sendCommandToWeb callback.
 */
export function createWebViewCommandHandler(
  service: WalletService,
  sendCommandToWeb: (type: string, payload: Record<string, unknown>) => void,
  wallets: DetectedWallet[],
  androidSolanaWalletId = MWA_WALLET_ID,
  allowedAndroidSolanaWalletIds: ReadonlySet<string> = new Set(),
  inFlightTransactionRequests: Set<string> = new Set(),
): BridgeCommandFromWebHandler {
  return (commandType, commandPayload) => {
    switch (commandType) {
      case "connect_wallet": {
        const chain = str(commandPayload?.chain);
        const walletId = str(commandPayload?.walletId);
        const target = normalizeConnectTarget(
          chain,
          walletId,
          wallets,
          androidSolanaWalletId,
          allowedAndroidSolanaWalletIds,
        );
        if (!target) {
          sendCommandToWeb("wallet_error", {
            code: "INVALID_PAYLOAD",
            message: "Missing chain or walletId",
          });
          return;
        }
        service
          .connect(target.chain, target.walletId)
          .then((account) => {
            sendCommandToWeb("wallet_connected", {
              address: account.address,
              chain: account.chain,
              walletId: account.walletId,
            });
          })
          .catch((error) => {
            sendCommandToWeb("wallet_error", errorToPayload(error));
          });
        break;
      }

      case "disconnect_wallet": {
        const chain = str(commandPayload?.chain);
        if (!chain) {
          sendCommandToWeb("wallet_error", {
            code: "INVALID_PAYLOAD",
            message: "Missing chain",
          });
          return;
        }
        disconnectWalletTargets(service, chain)
          .then(() => {
            sendCommandToWeb("wallet_disconnected", { chain });
          })
          .catch((error) => {
            sendCommandToWeb("wallet_error", errorToPayload(error));
          });
        break;
      }

      case "sign_transaction":
      case "sign_and_submit_transaction": {
        const chain = str(commandPayload?.chain);
        const transaction = str(commandPayload?.transaction);
        const requestId = str(commandPayload?.requestId);
        const send =
          commandType === "sign_and_submit_transaction"
            ? true
            : commandPayload?.send !== false;
        if (!chain || !transaction || !requestId) {
          sendCommandToWeb("wallet_error", {
            code: "INVALID_PAYLOAD",
            message: "Missing chain, transaction, or requestId",
            requestId,
          });
          return;
        }

        const requestKey = `${chain}:${requestId}`;
        if (inFlightTransactionRequests.has(requestKey)) {
          if (__DEV__) {
            console.log("[WalletGateway] Ignoring duplicate transaction request:", {
              chain,
              requestId,
            });
          }
          return;
        }
        inFlightTransactionRequests.add(requestKey);

        service
          .signTransaction(chain, transaction, send)
          .then((result) => {
            if (send) {
              sendCommandToWeb("transaction_submitted", {
                signature: result,
                requestId,
              });
              return;
            }

            sendCommandToWeb("transaction_signed", {
              transaction: result,
              signedTransaction: result,
              signature: result,
              requestId,
            });
          })
          .catch((error) => {
            const errorPayload = {
              ...errorToPayload(error),
              requestId,
            };
            sendCommandToWeb("wallet_error", errorPayload);
            if (shouldMarkWalletDisconnected(chain, errorPayload)) {
              sendCommandToWeb("wallet_disconnected", {
                chain,
                reason: "session_expired",
              });
            }
          })
          .finally(() => {
            inFlightTransactionRequests.delete(requestKey);
          });
        break;
      }

      case "sign_message": {
        const chain = str(commandPayload?.chain);
        const message = str(commandPayload?.message);
        const requestId = str(commandPayload?.requestId);
        const encoding = messageEncoding(commandPayload?.encoding);
        if (!chain || !message || !requestId) {
          sendCommandToWeb("wallet_error", {
            code: "INVALID_PAYLOAD",
            message: "Missing chain, message, or requestId",
            requestId,
          });
          return;
        }
        service
          .signMessage(chain, message, encoding)
          .then((signature) => {
            sendCommandToWeb("message_signed", { signature, requestId });
          })
          .catch((error) => {
            sendCommandToWeb("wallet_error", {
              ...errorToPayload(error),
              requestId,
            });
          });
        break;
      }

      case "get_installed_wallets": {
        sendCommandToWeb("installed_wallets", { wallets });
        break;
      }

      default: {
        const requestId = str(commandPayload?.requestId);
        if (__DEV__) {
          sendCommandToWeb("wallet_error", {
            code: "UNKNOWN_COMMAND",
            message: `Unknown bridge command: ${commandType}`,
            commandType,
            requestId,
          });
          console.warn("[WalletGateway] Unknown bridge command:", commandType);
          return;
        }

        sendCommandToWeb("wallet_error", {
          code: "INVALID_REQUEST",
          message: "Invalid bridge request",
          requestId,
        });
        break;
      }
    }
  };
}
