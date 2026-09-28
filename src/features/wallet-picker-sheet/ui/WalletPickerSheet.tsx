import {
  MWA_WALLET_ID,
  SEED_VAULT_WALLET_ID,
  SUPPORTED_SOLANA_WALLET_IDS,
} from "@/features/wallet-connection-solana";
import type { DetectedWallet } from "@/features/wallet-discovery";
import { useColorScheme, useThemeColor } from "@/shared/hooks";
import {
  WalletListItemButton,
  type WalletListItemButtonPalette,
} from "@/shared/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface WalletPickerSheetProps {
  visible: boolean;
  wallets: DetectedWallet[];
  onClose: () => void;
  onDidHide?: () => void;
  onRescan: () => void;
  onWalletPress: (chain: "aptos" | "solana", walletId: string) => void;
  isSolanaPhone?: boolean;
}

const FADE_DURATION_MS = 250;
const SHEET_SLIDE_DURATION_MS = 380;
const SHEET_OFFSET_Y = 400;
const SWIPE_DISMISS_DISTANCE = 96;
const SWIPE_DISMISS_VELOCITY = 0.75;
const INSTALLED_STATUS_COLOR_DARK = "#14F195";
const INSTALLED_STATUS_COLOR_LIGHT = "#18A874";

const STORE_URLS: Record<string, { android?: string; ios: string }> = {
  petra: {
    android: "https://play.google.com/store/apps/details?id=com.aptoslabs.petra.wallet",
    ios: "https://apps.apple.com/app/petra-crypto-wallet/id6444312031",
  },
  phantom: {
    android: "https://play.google.com/store/apps/details?id=app.phantom",
    ios: "https://apps.apple.com/app/phantom-crypto-wallet/id1598432977",
  },
  solflare: {
    android: "https://play.google.com/store/apps/details?id=com.solflare.mobile",
    ios: "https://apps.apple.com/app/solflare-solana-wallet/id1580902717",
  },
  backpack: {
    android: "https://play.google.com/store/apps/details?id=app.backpack.mobile",
    ios: "https://apps.apple.com/app/backpack-crypto-wallet/id6444544067",
  },
  jupiter: {
    android: "https://play.google.com/store/apps/details?id=ag.jup.jupiter.android",
    ios: "https://apps.apple.com/app/jupiter-mobile/id6502279548",
  },
  glow: {
    android: "https://play.google.com/store/apps/details?id=com.luma.wallet.prod",
    ios: "https://apps.apple.com/app/glow-solana-wallet/id1599584512",
  },
};

function darkenHexColor(hex: string, amount: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }

  const channel = (start: number) =>
    Math.max(
      0,
      Math.min(255, parseInt(normalized.slice(start, start + 2), 16) - amount),
    )
      .toString(16)
      .padStart(2, "0");

  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

function openStore(walletId: string) {
  const urls = STORE_URLS[walletId];
  if (!urls) return;
  const url = Platform.OS === "android" ? urls.android : urls.ios;
  if (!url) return;
  Linking.openURL(url);
}

export function WalletPickerSheet(props: WalletPickerSheetProps) {
  const {
    visible,
    wallets,
    onClose,
    onDidHide,
    onRescan,
    onWalletPress,
    isSolanaPhone = false,
  } = props;
  const androidSolanaWalletId = isSolanaPhone
    ? SEED_VAULT_WALLET_ID
    : MWA_WALLET_ID;
  const aptosWallets = useMemo(
    () => wallets.filter((wallet) => wallet.ecosystem === "aptos"),
    [wallets],
  );
  const solanaWallets = useMemo(
    () =>
      Platform.OS === "android"
        ? []
        : wallets
            .filter(
              (wallet) =>
                wallet.ecosystem === "solana" &&
                SUPPORTED_SOLANA_WALLET_IDS.has(wallet.id),
            )
            .sort((a, b) => Number(b.isInstalled) - Number(a.isInstalled)),
    [wallets],
  );
  const seekerPhantomWallet = useMemo(
    () =>
      Platform.OS === "android" && isSolanaPhone
        ? wallets.find(
            (wallet) =>
              wallet.ecosystem === "solana" && wallet.id === "phantom",
          )
        : undefined,
    [isSolanaPhone, wallets],
  );
  const [isModalVisible, setIsModalVisible] = useState(visible);
  const visibleRef = useRef(visible);
  const scrollOffsetYRef = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetTranslateY = useRef(
    new Animated.Value(visible ? 0 : SHEET_OFFSET_Y),
  ).current;
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const cardBackground = useThemeColor("card");
  const cardForeground = useThemeColor("cardForeground");
  const borderColor = useThemeColor("border");
  const secondaryBackground = useThemeColor("secondary");
  const mutedForeground = useThemeColor("mutedForeground");
  const sheetMaxHeight = Math.floor(windowHeight * 0.82);
  const walletItemBackground = useMemo(
    () => darkenHexColor(secondaryBackground, 12),
    [secondaryBackground],
  );
  const walletItemPalette = useMemo<WalletListItemButtonPalette>(
    () => ({
      backgroundColor: walletItemBackground,
      borderColor: walletItemBackground,
      installedNameColor: cardForeground,
      notInstalledNameColor: cardForeground,
      installedStatusColor:
        colorScheme === "dark"
          ? INSTALLED_STATUS_COLOR_DARK
          : INSTALLED_STATUS_COLOR_LIGHT,
      notInstalledStatusColor: mutedForeground,
      installedIconColor: cardForeground,
      notInstalledIconColor: mutedForeground,
    }),
    [cardForeground, colorScheme, mutedForeground, walletItemBackground],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          scrollOffsetYRef.current <= 0 &&
          gestureState.dy > 8 &&
          gestureState.dy > Math.abs(gestureState.dx),
        onMoveShouldSetPanResponder: (_, gestureState) =>
          scrollOffsetYRef.current <= 0 &&
          gestureState.dy > 6 &&
          gestureState.dy > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          sheetTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (
            gestureState.dy > SWIPE_DISMISS_DISTANCE ||
            gestureState.vy > SWIPE_DISMISS_VELOCITY
          ) {
            onClose();
            return;
          }

          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 260,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 260,
          }).start();
        },
      }),
    [onClose, sheetTranslateY],
  );

  useEffect(() => {
    if (visible) {
      onRescan();
    }
  }, [onRescan, visible]);

  useEffect(() => {
    if (!visible) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        onRescan();
      }
    });
    return () => subscription.remove();
  }, [onRescan, visible]);

  useEffect(() => {
    visibleRef.current = visible;
    backdropOpacity.stopAnimation();
    sheetOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();

    if (visible) {
      setIsModalVisible(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: SHEET_SLIDE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SHEET_OFFSET_Y,
        duration: SHEET_SLIDE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visibleRef.current) {
        setIsModalVisible(false);
        onDidHide?.();
      }
    });
  }, [backdropOpacity, onDidHide, sheetOpacity, sheetTranslateY, visible]);

  if (!isModalVisible) {
    return null;
  }

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          />
        </Pressable>
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              opacity: sheetOpacity,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: cardBackground,
                borderTopColor: borderColor,
                maxHeight: sheetMaxHeight,
                paddingBottom: insets.bottom + 16,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.dragArea}>
              <View
                style={[styles.sheetHandle, { backgroundColor: borderColor }]}
              />
              <Text style={[styles.sheetTitle, { color: cardForeground }]}>
                Connect Wallet
              </Text>
            </View>
            <ScrollView
              style={styles.walletList}
              bounces={false}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => {
                scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
              }}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: cardForeground }]}>
                  Aptos
                </Text>
                {aptosWallets.map((wallet) => (
                  <WalletListItemButton
                    key={wallet.id}
                    name={wallet.name}
                    isInstalled={wallet.isInstalled}
                    palette={walletItemPalette}
                    iconSource={wallet.icon}
                    onPress={() =>
                      wallet.isInstalled
                        ? onWalletPress("aptos", wallet.id)
                        : openStore(wallet.id)
                    }
                  />
                ))}
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: cardForeground }]}>
                  Solana
                </Text>
                {Platform.OS === "android" ? (
                  <WalletListItemButton
                    name="Solana Wallet"
                    isInstalled
                    palette={walletItemPalette}
                    installedLabel={isSolanaPhone ? "Seed Vault" : "Mobile Wallet Adapter"}
                    iconSource={require("@/assets/wallet-icons/solana-mark.png")}
                    iconTintColor="#FFFFFF"
                    onPress={() => onWalletPress("solana", androidSolanaWalletId)}
                  />
                ) : null}
                {Platform.OS === "android" && isSolanaPhone ? (
                  <WalletListItemButton
                    name={seekerPhantomWallet?.name ?? "Phantom"}
                    isInstalled={seekerPhantomWallet?.isInstalled ?? false}
                    palette={walletItemPalette}
                    iconSource={
                      seekerPhantomWallet?.icon ??
                      require("@/assets/wallet-icons/phantom.png")
                    }
                    onPress={() =>
                      seekerPhantomWallet?.isInstalled
                        ? onWalletPress("solana", "phantom")
                        : openStore("phantom")
                    }
                  />
                ) : null}
                {solanaWallets.map((wallet) => (
                  <WalletListItemButton
                    key={wallet.id}
                    name={wallet.name}
                    isInstalled={wallet.isInstalled}
                    palette={walletItemPalette}
                    iconSource={wallet.icon}
                    onPress={() =>
                      wallet.isInstalled
                        ? onWalletPress("solana", wallet.id)
                        : openStore(wallet.id)
                    }
                  />
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 8,
  },
  dragArea: {
    paddingBottom: 2,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  walletList: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 12,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
});
