import { fireEvent, render } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";
import type { DetectedWallet } from "@/features/wallet-discovery";
import { WalletPickerSheet } from "../WalletPickerSheet";

jest.mock("@/features/wallet-connection-solana", () => ({
  MWA_WALLET_ID: "mwa",
  SEED_VAULT_WALLET_ID: "seed-vault",
  SUPPORTED_SOLANA_WALLET_IDS: new Set([
    "phantom",
    "solflare",
    "backpack",
    "jupiter",
  ]),
}));

jest.mock("@/shared/hooks", () => ({
  useColorScheme: () => "light",
  useThemeColor: (name: string) =>
    name === "cardForeground" ? "#111111" : "#ffffff",
}));

jest.mock("@/shared/ui", () => {
  const {
    Pressable: MockPressable,
    Text: MockText,
  } = jest.requireActual("react-native") as typeof import("react-native");

  return {
    WalletListItemButton: ({
      name,
      isInstalled,
      onPress,
    }: {
      name: string;
      isInstalled: boolean;
      onPress: () => void;
    }) => (
      <MockPressable testID={`wallet-${name}`} onPress={onPress}>
        <MockText>{`${name}:${isInstalled ? "Installed" : "Install"}`}</MockText>
      </MockPressable>
    ),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const phantomWallet: DetectedWallet = {
  id: "phantom",
  name: "Phantom",
  scheme: "phantom",
  androidPackage: "app.phantom",
  ecosystem: "solana",
  icon: 0,
  isInstalled: true,
};

function setPlatformOS(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    get: () => os,
  });
}

function renderSheet(
  wallets: DetectedWallet[],
  isSolanaPhone: boolean,
  onWalletPress = jest.fn(),
) {
  return {
    onWalletPress,
    ...render(
      <WalletPickerSheet
        visible
        wallets={wallets}
        onClose={jest.fn()}
        onRescan={jest.fn()}
        onWalletPress={onWalletPress}
        isSolanaPhone={isSolanaPhone}
      />,
    ),
  };
}

describe("WalletPickerSheet Phantom on Seeker", () => {
  beforeEach(() => {
    setPlatformOS("android");
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("connects an installed Phantom wallet on a Solana phone", () => {
    const { getByText, getByTestId, onWalletPress } = renderSheet(
      [phantomWallet],
      true,
    );

    expect(getByText("Phantom:Installed")).toBeTruthy();
    fireEvent.press(getByTestId("wallet-Phantom"));

    expect(onWalletPress).toHaveBeenCalledWith("solana", "phantom");
  });

  it("opens Google Play when Phantom is not installed", () => {
    const openUrlSpy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined);
    const { getByText, getByTestId, onWalletPress } = renderSheet(
      [{ ...phantomWallet, isInstalled: false }],
      true,
    );

    expect(getByText("Phantom:Install")).toBeTruthy();
    fireEvent.press(getByTestId("wallet-Phantom"));

    expect(openUrlSpy).toHaveBeenCalledWith(
      "https://play.google.com/store/apps/details?id=app.phantom",
    );
    expect(onWalletPress).not.toHaveBeenCalled();
  });

  it("does not show Phantom on a regular Android device", () => {
    const { queryByTestId } = renderSheet([phantomWallet], false);

    expect(queryByTestId("wallet-Phantom")).toBeNull();
  });
});
