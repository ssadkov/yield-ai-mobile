
import { create } from "zustand";
import { useApp, DEMO_ADDRESS } from "../lib/store";
import { WalletError, type TxStep, type WalletDriver, type WalletId } from "./types";

/**
 * Mock wallet for the browser demo. Every request shows a clearly labelled
 * "Mock wallet" prompt (or auto-approves, see Profile → Mock wallet).
 */

export type MockPrompt =
  | { kind: "connect"; walletId: WalletId; walletName: string; resolve: () => void; reject: () => void }
  | { kind: "sign"; walletId: WalletId; walletName: string; step: TxStep; resolve: () => void; reject: () => void };

export const useMockPrompt = create<{ prompt: MockPrompt | null }>(() => ({ prompt: null }));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type AskInput =
  | { kind: "connect"; walletId: WalletId; walletName: string }
  | { kind: "sign"; walletId: WalletId; walletName: string; step: TxStep };

async function ask(p: AskInput): Promise<void> {
  if (useApp.getState().mockApproval === "auto") {
    await wait(900);
    return;
  }
  return new Promise<void>((resolve, reject) => {
    useMockPrompt.setState({
      prompt: {
        ...(p as MockPrompt),
        resolve: () => {
          useMockPrompt.setState({ prompt: null });
          resolve();
        },
        reject: () => {
          useMockPrompt.setState({ prompt: null });
          reject(new WalletError("USER_REJECTED", "You declined the request in your wallet."));
        },
      },
    });
  });
}

function fakeSignature() {
  const abc = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from({ length: 88 }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
}

export const mockDriver: WalletDriver = {
  kind: "mock",
  async connect(walletId, walletName) {
    await wait(250);
    await ask({ kind: "connect", walletId, walletName });
    return { address: DEMO_ADDRESS };
  },
  cancelConnect() {
    const { prompt } = useMockPrompt.getState();
    if (prompt?.kind === "connect") prompt.reject();
  },
  async disconnect() {
    await wait(150);
  },
  async signAndSubmit(step, onPhase, walletName) {
    onPhase("signing");
    const w = useApp.getState().wallet;
    await ask({ kind: "sign", walletId: w?.id ?? "seed-vault", walletName: walletName || w?.name || "Seed Vault", step });
    onPhase("submitting");
    await wait(1100 + Math.random() * 500);
    return fakeSignature();
  },
};
