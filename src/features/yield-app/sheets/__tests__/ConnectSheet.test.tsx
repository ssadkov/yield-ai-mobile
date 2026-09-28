import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useApp } from "../../lib/store";
import { ConnectSheet } from "../ConnectSheet";

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const mockDriver = { connect: jest.fn(), cancelConnect: jest.fn() };

jest.mock("../../wallet", () => ({
  ...jest.requireActual("../../wallet/types"),
  getDriver: () => mockDriver,
  useIsMock: () => false,
  useSeedVaultDetected: () => false,
  useCanConnect: () => () => true,
  useWalletEnv: (pick: (s: { isSolanaPhone: boolean; detected: [] }) => unknown) => pick({ isSolanaPhone: false, detected: [] }),
}));

jest.mock("../../ui/BottomSheet", () => {
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    BottomSheet: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SheetHeader: () => null,
  };
});

jest.mock("../../ui/images", () => ({ WalletAvatar: () => null }));
jest.mock("../../ui/haptics", () => ({ haptic: { success: jest.fn(), error: jest.fn(), tap: jest.fn(), select: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

describe("ConnectSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useApp.setState({ wallet: null } as never);
  });

  it("Cancel stops a connect the wallet never answered and lets the user pick another wallet", async () => {
    let answerPhantom: (v: { address: string }) => void = () => {};
    mockDriver.connect.mockImplementationOnce(() => new Promise((resolve) => (answerPhantom = resolve)));
    const onConnected = jest.fn();
    render(<ConnectSheet open onClose={() => {}} onConnected={onConnected} />);

    expect(screen.queryByText("Cancel")).toBeNull();
    fireEvent.press(screen.getByLabelText("Phantom"));
    expect(await screen.findByText("Check your wallet…")).toBeTruthy();

    fireEvent.press(screen.getByText("Cancel"));
    expect(mockDriver.cancelConnect).toHaveBeenCalledWith("phantom");
    expect(screen.queryByText("Check your wallet…")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();

    // A late answer from the cancelled wallet doesn't connect anything.
    await act(async () => answerPhantom({ address: "Late" }));
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();

    // Another wallet works right away.
    mockDriver.connect.mockResolvedValueOnce({ address: "Addr2" });
    await act(async () => fireEvent.press(screen.getByLabelText("MetaMask")));
    expect(mockDriver.connect).toHaveBeenLastCalledWith("metamask", "MetaMask");
    expect(onConnected).toHaveBeenCalledTimes(1);
  });
});
