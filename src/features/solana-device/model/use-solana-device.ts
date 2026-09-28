import { useEffect, useState } from "react";
import { checkIsSolanaDevice } from "./check-solana-device";

export function useSolanaDevice() {
  const [isSolanaPhone, setIsSolanaPhone] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkIsSolanaDevice()
      .then(setIsSolanaPhone)
      .finally(() => setIsLoading(false));
  }, []);

  return { isSolanaPhone, isLoading };
}
