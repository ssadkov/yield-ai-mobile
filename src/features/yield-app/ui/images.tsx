import { Image } from "expo-image";
import { View } from "react-native";
import { WALLET_REGISTRY } from "@/features/wallet-discovery";
import type { WalletId } from "../wallet";
import { C } from "./theme";

export const LOGO = require("@/assets/yield/logo.png");

const TOKENS: Record<string, number> = {
  usdc: require("@/assets/yield/token/usdc.png"),
  usd1: require("@/assets/yield/token/usd1.png"),
  usdt: require("@/assets/yield/token/usdt.png"),
  sol: require("@/assets/yield/token/sol.png"),
  wbtc: require("@/assets/yield/token/wbtc.png"),
  jupusd: require("@/assets/yield/token/jupusd.png"),
  echelon: require("@/assets/yield/protocol/echelon.png"),
};

export const CHAINS: Record<string, number> = {
  solana: require("@/assets/yield/chain/solana.png"),
  ethereum: require("@/assets/yield/chain/ethereum.png"),
  base: require("@/assets/yield/chain/base.png"),
  arbitrum: require("@/assets/yield/chain/arbitrum.png"),
  aptos: require("@/assets/yield/chain/aptos.png"),
};

export function tokenSrc(id: string) {
  return TOKENS[id] ?? TOKENS.usdc;
}

/** Round image with a white ring (CSS `box-shadow: 0 0 0 Npx #fff`). */
export function Ringed({ src, size, ring = 2, style }: { src: number; size: number; ring?: number; style?: object }) {
  return (
    <View style={[{ width: size + ring * 2, height: size + ring * 2, borderRadius: size, backgroundColor: C.white, padding: ring, margin: -ring }, style]}>
      <Image source={src} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
    </View>
  );
}

export function TokenPair({ a, b, size = 24 }: { a: string; b: string; size?: number }) {
  return (
    <View style={{ flexDirection: "row" }}>
      <Ringed src={tokenSrc(a)} size={size} />
      <Ringed src={tokenSrc(b)} size={size} style={{ marginLeft: -size / 3 - 2 }} />
    </View>
  );
}

const WALLET_ICONS: Partial<Record<WalletId, number>> = {
  "seed-vault": require("@/assets/wallet-icons/seed-vault.png"),
  privy: require("@/assets/wallet-icons/privy.png"),
  ...Object.fromEntries(WALLET_REGISTRY.map((w) => [w.id, w.icon])),
};

/** Official wallet marks; the generic "Solana wallet" (MWA) row uses the Solana mark. */
export function WalletAvatar({ id, size = 44 }: { id: WalletId; size?: number }) {
  const s = { width: size, height: size, borderRadius: size / 2 };
  const icon = WALLET_ICONS[id];
  if (icon) return <Image source={icon} style={s} contentFit="cover" />;
  return (
    <View style={[s, { alignItems: "center", justifyContent: "center", backgroundColor: C.ink }]}>
      <Image source={require("@/assets/wallet-icons/solana-mark.png")} style={{ width: size / 2, height: size / 2 }} contentFit="contain" />
    </View>
  );
}
