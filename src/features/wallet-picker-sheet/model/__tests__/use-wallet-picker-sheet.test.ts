import { act, renderHook } from "@testing-library/react-native";
import { useWalletPickerSheet } from "../use-wallet-picker-sheet";

describe("useWalletPickerSheet", () => {
  it("opens the picker for connect_wallet by default", () => {
    const onCommandFromWeb = jest.fn();
    const { result } = renderHook(() =>
      useWalletPickerSheet({ onCommandFromWeb }),
    );

    act(() => {
      result.current.handleCommandFromWebWithPickerSheet("connect_wallet", {
        chain: "solana",
      });
    });

    expect(result.current.isPickerSheetVisible).toBe(true);
    expect(onCommandFromWeb).not.toHaveBeenCalled();
  });

  it("sends selected wallet after the picker hides", () => {
    const onCommandFromWeb = jest.fn();
    const { result } = renderHook(() =>
      useWalletPickerSheet({ onCommandFromWeb }),
    );

    act(() => {
      result.current.handleWalletPress("solana", "seed-vault");
    });

    act(() => {
      result.current.handlePickerSheetDidHide();
    });

    expect(result.current.isPickerSheetVisible).toBe(false);
    expect(onCommandFromWeb).toHaveBeenCalledWith("connect_wallet", {
      chain: "solana",
      walletId: "seed-vault",
    });
  });
});
