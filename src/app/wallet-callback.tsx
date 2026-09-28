import { useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * Wallet deeplink callbacks (Phantom) land here via +native-intent. The connector already
 * got the URL from Linking, so this invisible route just steps back to where the user was.
 */
export default function WalletCallback() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
  return null;
}
