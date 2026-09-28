import { useCallback, useState } from "react";
import type { BridgeCommandFromWebHandler } from "@/shared/types";

interface UseWalletPickerSheetOptions {
  onCommandFromWeb: BridgeCommandFromWebHandler;
}

interface UseWalletPickerSheetResult {
  isPickerSheetVisible: boolean;
  closePickerSheet: () => void;
  handleWalletPress: (chain: "aptos" | "solana", walletId: string) => void;
  handlePickerSheetDidHide: () => void;
  handleCommandFromWebWithPickerSheet: BridgeCommandFromWebHandler;
}

type PendingWalletSelection = {
  chain: "aptos" | "solana";
  walletId: string;
};

export function useWalletPickerSheet(
  options: UseWalletPickerSheetOptions,
): UseWalletPickerSheetResult {
  const { onCommandFromWeb } = options;
  const [isPickerSheetVisible, setIsPickerSheetVisible] = useState(false);
  const [pendingWalletSelection, setPendingWalletSelection] =
    useState<PendingWalletSelection | null>(null);

  const closePickerSheet = useCallback(() => {
    setIsPickerSheetVisible(false);
  }, []);

  const handleWalletPress = useCallback((chain: "aptos" | "solana", walletId: string) => {
    setPendingWalletSelection({ chain, walletId });
    closePickerSheet();
  }, [closePickerSheet]);

  const handlePickerSheetDidHide = useCallback(() => {
    if (!pendingWalletSelection) return;

    onCommandFromWeb("connect_wallet", {
      chain: pendingWalletSelection.chain,
      walletId: pendingWalletSelection.walletId,
    });
    setPendingWalletSelection(null);
  }, [onCommandFromWeb, pendingWalletSelection]);

  const handleCommandFromWebWithPickerSheet =
    useCallback<BridgeCommandFromWebHandler>(
      (commandType, commandPayload) => {
        if (commandType === "connect_wallet") {
          setIsPickerSheetVisible(true);
          return;
        }

        onCommandFromWeb(commandType, commandPayload);
      },
      [onCommandFromWeb],
    );

  return {
    isPickerSheetVisible,
    closePickerSheet,
    handleWalletPress,
    handlePickerSheetDidHide,
    handleCommandFromWebWithPickerSheet,
  };
}
