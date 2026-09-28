import { Buffer } from "buffer";
import { Linking } from "react-native";
import bs58 from "bs58";
import type { ISignClient, SessionTypes } from "@walletconnect/types";

import {
  getWalletConnectClient,
  openWalletWithWcUri,
  resolveWalletRedirectUri,
} from "@/core/walletconnect";

// Inlined from @walletconnect/utils getSdkError("USER_DISCONNECTED") — the
// package's "exports" map is broken under Metro + Expo 54, so we avoid it.
const USER_DISCONNECTED_REASON = {
  code: 6000,
  message: "User disconnected.",
};
import {
  getSolanaChainId,
  SOLANA_WC_METHODS,
} from "../lib/walletconnect/wc-config";
import type { SolanaWalletAdapter, SolanaWalletConfig } from "./types";

interface SolanaAccountParts {
  address: string;
}

function extractSolanaAccount(session: SessionTypes.Struct): SolanaAccountParts {
  const account = session.namespaces.solana?.accounts[0];
  if (!account) {
    throw new Error("WalletConnect session has no Solana account");
  }
  // Format: "solana:<chainHash>:<base58Pubkey>"
  const parts = account.split(":");
  const address = parts[2];
  if (!address) {
    throw new Error(`Malformed Solana account in WC session: ${account}`);
  }
  return { address };
}

function findExistingSession(
  client: ISignClient,
  walletId: string,
  chainId: string,
): SessionTypes.Struct | undefined {
  const sessions = client.session.getAll();
  const normalizedWalletId = walletId.toLowerCase();

  return sessions.find((session) => {
    const metadataName = session.peer?.metadata?.name?.toLowerCase() ?? "";
    const matchesWalletName = metadataName.includes(normalizedWalletId);
    const hasRequestedChain = session.namespaces.solana?.accounts.some((account) =>
      account.startsWith(`${chainId}:`),
    );

    return matchesWalletName || hasRequestedChain;
  });
}

export class WalletConnectAdapter implements SolanaWalletAdapter {
  readonly name: string;
  private session: SessionTypes.Struct | null = null;

  constructor(private config: SolanaWalletConfig) {
    this.name = `${config.walletId} (WalletConnect)`;
  }

  async connect(): Promise<{ address: string; chain: string }> {
    const client = await getWalletConnectClient();
    const chainId = getSolanaChainId(this.config.cluster);

    const existing = findExistingSession(client, this.config.walletId, chainId);
    if (existing && existing.expiry * 1000 > Date.now()) {
      this.session = existing;
      const { address } = extractSolanaAccount(existing);
      return { address, chain: "solana" };
    }

    const { uri, approval } = await client.connect({
      optionalNamespaces: {
        solana: {
          chains: [chainId],
          methods: [...SOLANA_WC_METHODS],
          events: [],
        },
      },
    });

    if (!uri) {
      throw new Error("WalletConnect returned no pairing URI");
    }

    await openWalletWithWcUri(this.config.walletId, uri);

    this.session = await approval();
    const { address } = extractSolanaAccount(this.session);
    return { address, chain: "solana" };
  }

  async disconnect(): Promise<void> {
    if (!this.session) return;
    const client = await getWalletConnectClient();
    try {
      await client.disconnect({
        topic: this.session.topic,
        reason: USER_DISCONNECTED_REASON,
      });
    } finally {
      this.session = null;
    }
  }

  async signTransaction(transaction: Uint8Array): Promise<string> {
    return this.request<string>("solana_signTransaction", {
      transaction: Buffer.from(transaction).toString("base64"),
    }, (result) => {
      // Spec returns { transaction: base64 } (signed). Fallback to { signature }
      // for wallets that diverge.
      if (typeof result?.transaction === "string") return result.transaction;
      if (typeof result?.signature === "string") return result.signature;
      throw new Error("Unexpected solana_signTransaction response shape");
    });
  }

  async signAndSendTransaction(transaction: Uint8Array): Promise<string> {
    return this.request<string>("solana_signAndSendTransaction", {
      transaction: Buffer.from(transaction).toString("base64"),
    }, (result) => {
      if (typeof result?.signature === "string") return result.signature;
      throw new Error("Unexpected solana_signAndSendTransaction response shape");
    });
  }

  async signMessage(message: Uint8Array): Promise<string> {
    if (!this.session) throw new Error("Wallet not connected");
    const { address } = extractSolanaAccount(this.session);
    return this.request<string>("solana_signMessage", {
      pubkey: address,
      message: bs58.encode(message),
    }, (result) => {
      if (typeof result?.signature === "string") return result.signature;
      throw new Error("Unexpected solana_signMessage response shape");
    });
  }

  dispose(): void {
    // Session data lives inside SignClient's storage and survives across
    // connector disposals. We just drop the in-memory reference.
    this.session = null;
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown>,
    parse: (result: any) => T,
  ): Promise<T> {
    if (!this.session) throw new Error("Wallet not connected");
    const client = await getWalletConnectClient();
    const chainId = getSolanaChainId(this.config.cluster);
    const topic = this.session.topic;

    const responsePromise = client.request({
      topic,
      chainId,
      request: { method, params },
    });

    const redirect = resolveWalletRedirectUri(
      this.config.walletId,
      this.session.peer?.metadata?.redirect,
    );
    if (redirect) {
      Linking.openURL(redirect).catch(() => {
        // Ignore — wallet may already be foregrounded or scheme may not be registered.
      });
    }

    const result = await responsePromise;
    return parse(result);
  }
}
