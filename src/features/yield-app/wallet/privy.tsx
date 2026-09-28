import { useEffect, useRef, type ReactNode } from "react";
import { WalletError } from "./types";

/**
 * Privy: "Sign in with Google" plus an embedded Solana wallet Privy creates for the user.
 * Off until EXPO_PUBLIC_PRIVY_APP_ID is set (the Privy app is created by the backend dev);
 * until then the Privy row stays "Soon" and the SDK isn't even loaded.
 */
const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
const CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || undefined;
export const PRIVY_ENABLED = APP_ID.length > 0;

type PrivyActions = {
  /** Google sign-in (skipped when a session exists); resolves with the embedded Solana wallet address. */
  login(): Promise<string>;
  signMessage(text: string): Promise<string>;
  logout(): Promise<void>;
};

/** Set by <PrivyBridge> once the provider is mounted; the wallet driver calls through it. */
let actions: PrivyActions | null = null;

export function getPrivy(): PrivyActions {
  if (!actions) throw new WalletError("NOT_AVAILABLE", "Privy is still loading. Try again.");
  return actions;
}

const WALLET_WAIT_MS = 20_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wraps the app in PrivyProvider when Privy is configured; otherwise renders children as is. */
export function PrivyRoot({ children }: { children: ReactNode }) {
  if (!PRIVY_ENABLED) return <>{children}</>;
  // Loaded lazily so builds without Privy keys never touch the SDK or its polyfills.
  /* eslint-disable @typescript-eslint/no-require-imports */
  require("fast-text-encoding");
  require("@ethersproject/shims");
  const { PrivyProvider } = require("@privy-io/expo") as typeof import("@privy-io/expo");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return (
    <PrivyProvider appId={APP_ID} clientId={CLIENT_ID} config={{ embedded: { solana: { createOnLogin: "users-without-wallets" } } }}>
      <PrivyBridge />
      {children}
    </PrivyProvider>
  );
}

function PrivyBridge() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEmbeddedSolanaWallet, useLoginWithOAuth, usePrivy } = require("@privy-io/expo") as typeof import("@privy-io/expo");
  const privy = usePrivy();
  const oauth = useLoginWithOAuth();
  const solana = useEmbeddedSolanaWallet();

  // The actions read the latest hook state through refs, so they stay valid across renders.
  const state = useRef({ privy, oauth, solana });
  state.current = { privy, oauth, solana };

  useEffect(() => {
    const embeddedWallet = async () => {
      const deadline = Date.now() + WALLET_WAIT_MS;
      let createRequested = false;
      while (Date.now() < deadline) {
        const s = state.current.solana;
        if (s.status === "connected" && s.wallets.length > 0) return s.wallets[0];
        // createOnLogin covers new users; older accounts without a Solana wallet get one here.
        if (s.status === "not-created" && !createRequested) {
          createRequested = true;
          await s.create();
        }
        if (s.status === "error") throw new WalletError("UNKNOWN", s.error);
        await wait(250);
      }
      throw new WalletError("TIMEOUT", "Privy didn't open your wallet. Try again.");
    };

    actions = {
      async login() {
        if (!state.current.privy.isReady) throw new WalletError("NOT_AVAILABLE", "Privy is still loading. Try again.");
        if (!state.current.privy.user) {
          const user = await state.current.oauth.login({ provider: "google" });
          if (!user) throw new WalletError("USER_REJECTED", "Sign-in was cancelled.");
        }
        return (await embeddedWallet()).address;
      },
      async signMessage(text) {
        const provider = await (await embeddedWallet()).getProvider();
        const { signature } = await provider.request({ method: "signMessage", params: { message: text } });
        return signature;
      },
      async logout() {
        await state.current.privy.logout();
      },
    };
    return () => {
      actions = null;
    };
  }, []);

  return null;
}
