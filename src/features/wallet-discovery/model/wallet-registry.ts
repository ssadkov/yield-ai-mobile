import type { WalletProvider } from "./types";

export const WALLET_REGISTRY: WalletProvider[] = [
  // Solana
  {
    id: "phantom",
    name: "Phantom",
    scheme: "phantom",
    androidPackage: "app.phantom",
    ecosystem: "solana",
    icon: require("@/assets/wallet-icons/phantom.png"),
  },
  {
    id: "solflare",
    name: "Solflare",
    scheme: "solflare",
    androidPackage: "com.solflare.mobile",
    ecosystem: "solana",
    icon: require("@/assets/wallet-icons/solflare.png"),
  },
  {
    id: "backpack",
    name: "Backpack",
    scheme: "backpack",
    androidPackage: "app.backpack.mobile",
    ecosystem: "solana",
    icon: require("@/assets/wallet-icons/backpack.png"),
  },
  {
    id: "jupiter",
    name: "Jupiter",
    scheme: "jupiter",
    androidPackage: "ag.jup.jupiter.android",
    ecosystem: "solana",
    icon: require("@/assets/wallet-icons/jupiter.png"),
  },
  {
    id: "glow",
    name: "Glow",
    scheme: "glow",
    androidPackage: "com.luma.wallet.prod",
    androidPackageAliases: ["com.luma.wallet", "io.glow.app"],
    ecosystem: "solana",
    icon: require("@/assets/wallet-icons/glow.png"),
  },
  // Aptos
  {
    id: "petra",
    name: "Petra",
    scheme: "petra",
    androidPackage: "com.aptoslabs.petra.wallet",
    ecosystem: "aptos",
    icon: require("@/assets/wallet-icons/petra.png"),
  },
];
