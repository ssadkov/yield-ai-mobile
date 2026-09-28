import { isWalletCallbackUrl } from "@/features/wallet-gateway";

export function redirectSystemPath({
  path,
}: {
  path: string | null;
  initial: boolean;
}): string {
  try {
    if (path && isWalletCallbackUrl(path)) {
      return "/wallet-callback";
    }
  } catch {
    // Expo Router requires this hook to be defensive; keep the original path.
  }

  return path ?? "/";
}
