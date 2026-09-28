import { Linking } from "react-native";

// Mobile deeplink schemes that WalletConnect-compatible wallets expose to
// receive a pairing URI from a dApp.
//
// `pairing` controls how we hand the URI to the wallet:
//  - "wrapped": opens `<scheme>wc?uri=<encoded>` (wallet's own deep-link
//    handler unwraps the URI). Works for Phantom, Solflare, Jupiter, etc.
//  - "raw": opens the bare `wc:` URI and lets the OS route to whichever app
//    claims the `wc` scheme. Used for wallets whose custom-scheme router
//    ignores the path (Petra Android does this — `petra://wc?uri=...` just
//    opens the app and drops the query).
//
// `redirect` is the URL we open to bring the wallet back to foreground for
// follow-up requests after pairing. Falls back to `native` when omitted.
interface WalletConnectLinks {
  native: string;
  universal?: string;
  pairing: "wrapped" | "raw";
  redirect?: string;
}

const WC_MOBILE_LINKS: Record<string, WalletConnectLinks> = {
  jupiter: {
    native: "jupiter://",
    pairing: "wrapped",
  },
};

export function canOpenWallet(walletId: string): boolean {
  return WC_MOBILE_LINKS[walletId] !== undefined;
}

// Hands a WC pairing URI to the wallet. See WalletConnectLinks for the two
// strategies.
export async function openWalletWithWcUri(
  walletId: string,
  wcUri: string,
): Promise<void> {
  const links = WC_MOBILE_LINKS[walletId];
  if (!links) {
    throw new Error(`No WalletConnect deeplink registered for wallet: ${walletId}`);
  }

  if (links.pairing === "raw") {
    await Linking.openURL(wcUri);
    return;
  }

  const base = links.universal ?? links.native;
  await Linking.openURL(`${base}wc?uri=${encodeURIComponent(wcUri)}`);
}

// After connect, the session's peer metadata may carry a redirect URI we
// should use to re-open the wallet for subsequent requests (sign/send).
// Fallback to our static mapping if the session doesn't provide one.
export function resolveWalletRedirectUri(
  walletId: string,
  sessionRedirect?: { native?: string; universal?: string },
): string {
  const fromSession = sessionRedirect?.universal ?? sessionRedirect?.native;
  if (fromSession) return fromSession;
  const links = WC_MOBILE_LINKS[walletId];
  return links?.universal ?? links?.native ?? "";
}
