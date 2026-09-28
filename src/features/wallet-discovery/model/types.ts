import type { ImageSourcePropType } from "react-native";

export type WalletEcosystem = "solana" | "aptos" | "evm";

export type WalletProvider = {
  id: string;
  name: string;
  scheme: string;
  androidPackage: string;
  androidPackageAliases?: string[];
  ecosystem: WalletEcosystem;
  icon: ImageSourcePropType;
};

export type DetectedWallet = WalletProvider & {
  isInstalled: boolean;
};
