import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useApp } from "../lib/store";
import { BottomSheet, SheetHeader } from "../ui/BottomSheet";
import { PrimaryButton } from "../ui/Button";
import { WalletAvatar } from "../ui/images";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { haptic } from "../ui/haptics";
import { IconChevron, Spinner } from "../ui/icons";
import { C } from "../ui/theme";
import { getDriver, toWalletError, useCanConnect, useIsMock, useSeedVaultDetected, useWalletEnv, type WalletId } from "../wallet";

type Row = { id: WalletId; name: string; sub: string; detected?: boolean; soon?: boolean };

export const TERMS_URL = "https://yieldai.app/terms";

export function ConnectSheet({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: () => void }) {
  const isMock = useIsMock();
  const seedVault = useSeedVaultDetected();
  const isSolanaPhone = useWalletEnv((s) => s.isSolanaPhone);
  const detected = useWalletEnv((s) => s.detected);
  const canConnect = useCanConnect();
  const connect = useApp((s) => s.connect);
  const [busy, setBusy] = useState<WalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every pick and on Cancel, so an answer that arrives after Cancel is ignored.
  const attempt = useRef(0);

  // On a Seeker the built-in Seed Vault leads. Elsewhere on Android the system MWA picker
  // reaches whatever Solana wallet is installed.
  const top: Row | null =
    seedVault || isSolanaPhone === null
      ? { id: "seed-vault", name: "Seed Vault", sub: "Built into your Seeker · double-tap to sign", detected: seedVault }
      : Platform.OS === "android"
        ? { id: "mwa", name: "Solana wallet", sub: "Any wallet app on this phone" }
        : null;
  const installed = new Set(detected.filter((w) => w.isInstalled).map((w) => w.id));
  const fixed: Row[] = [
    { id: "phantom", name: "Phantom", sub: "Solana wallet app" },
    { id: "privy", name: "Privy", sub: "Sign in with email or Google" },
  ];
  // Every other wallet found on the phone gets its own row, even before the app can connect to it.
  const found: Row[] = detected
    .filter((w) => w.isInstalled && !fixed.some((r) => r.id === w.id))
    .map((w) => ({ id: w.id as WalletId, name: w.name, sub: "Installed on this phone" }));
  const rest = [...fixed, ...found].map((r) => ({ ...r, detected: installed.has(r.id), soon: !canConnect(r.id) }));
  // Wallets the app can use first (installed ones on top), "Soon" rows last.
  const rank = (r: Row) => (r.soon ? 2 : 0) + (r.detected ? 0 : 1);
  const rows: Row[] = [...(top ? [top] : []), ...rest.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r)];

  const pick = async (r: Row) => {
    if (busy || r.soon) return;
    const current = ++attempt.current;
    setBusy(r.id);
    setError(null);
    try {
      const { address } = await getDriver().connect(r.id, r.name);
      if (current !== attempt.current) return;
      connect({ id: r.id, name: r.name, address });
      haptic.success();
      onConnected();
    } catch (e) {
      if (current !== attempt.current) return;
      const err = toWalletError(e);
      haptic.error();
      setError(err.code === "USER_REJECTED" ? "Connection cancelled in your wallet." : err.message);
    } finally {
      if (current === attempt.current) setBusy(null);
    }
  };

  // The wallet may never answer (the user came back without approving), so let them start over.
  const cancel = () => {
    if (!busy) return;
    attempt.current++;
    getDriver().cancelConnect(busy);
    setBusy(null);
    setError(null);
  };

  return (
    <BottomSheet open={open} onClose={() => !busy && onClose()} label="Connect wallet" gap={20} dismissible={!busy}>
      <SheetHeader title="Connect wallet" subtitle="Your keys stay in your wallet." size={26} onClose={onClose} closeDisabled={!!busy} />

      <View style={{ gap: 12, paddingTop: 6 }}>
        {rows.map((r) => {
          // Only the built-in Seed Vault gets the highlighted card; other installed wallets get the badge.
          const hero = r.id === "seed-vault" && !!r.detected;
          const loading = busy === r.id;
          const disabled = (!!busy && !loading) || !!r.soon;
          const badge = r.soon ? "Soon" : r.detected ? "Detected" : null;
          return (
            <Tap
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}${r.detected ? ", detected" : ""}${r.soon ? ", coming soon" : ""}`}
              accessibilityState={{ busy: loading, disabled }}
              disabled={disabled}
              onPress={() => pick(r)}
              scale={0.985}
              bg={hero ? C.select : C.white}
              pressedBg={hero ? "#E7F0FD" : C.surface}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderWidth: hero ? 2 : 1,
                borderColor: hero ? C.blue : C.line2,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {badge && (
                <View style={{ position: "absolute", right: 14, top: -10, height: 20, borderRadius: 10, backgroundColor: r.soon ? C.ink3 : C.blue, paddingHorizontal: 8, justifyContent: "center" }}>
                  <T size={11} w={600} tracking={0.02} color={C.white}>
                    {badge}
                  </T>
                </View>
              )}
              <WalletAvatar id={r.id} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <T size={16} w={600}>
                  {r.name}
                </T>
                <T size={13} color={hero ? C.ink2 : C.ink3}>
                  {loading ? "Check your wallet…" : r.soon ? "Coming soon" : r.sub}
                </T>
              </View>
              <View style={{ width: 20, alignItems: "center" }}>{loading ? <Spinner size={18} color={hero ? C.blue : C.mute} /> : r.soon ? null : <IconChevron size={20} color={hero ? C.blue : C.mute} />}</View>
            </Tap>
          );
        })}
      </View>

      {busy ? (
        <PrimaryButton variant="light" onPress={cancel}>
          Cancel
        </PrimaryButton>
      ) : error ? (
        <T size={13} lh={1.5} color={C.danger} center accessibilityRole="alert">
          {error}
        </T>
      ) : (
        <T size={12} lh={1.5} color={C.ink4} center>
          By connecting you agree to the{" "}
          <T size={12} color={C.blue} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} accessibilityRole="link">
            Terms
          </T>
          . Yield is variable, not a guarantee.{isMock ? " (mock wallet)" : ""}
        </T>
      )}
    </BottomSheet>
  );
}
