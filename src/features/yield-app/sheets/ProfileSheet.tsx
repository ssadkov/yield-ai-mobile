import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { shortAddress } from "../lib/format";
import { useApp } from "../lib/store";
import { BottomSheet, SheetHeader } from "../ui/BottomSheet";
import { PrimaryButton } from "../ui/Button";
import { WalletAvatar } from "../ui/images";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { toast } from "../ui/Toast";
import { IconCopy, IconLogout } from "../ui/icons";
import { C, shadow } from "../ui/theme";
import { getDriver, useIsMock } from "../wallet";
import { sol } from "../devnet/api";
import { DEVNET, FAUCET_SOL, FAUCET_USDC, explorerAddress } from "../devnet/config";
import { useSafe } from "../devnet/state";

export function ProfileSheet({ open, onClose, onConnect }: { open: boolean; onClose: () => void; onConnect: () => void }) {
  const router = useRouter();
  const wallet = useApp((s) => s.wallet);
  const mockApproval = useApp((s) => s.mockApproval);
  const setMockApproval = useApp((s) => s.setMockApproval);
  const disconnect = useApp((s) => s.disconnect);
  const loadDemo = useApp((s) => s.loadDemo);
  const reset = useApp((s) => s.reset);
  const isMock = useIsMock();
  const safe = useSafe((s) => (s.safe?.owner.address === wallet?.address ? s.safe : null));

  return (
    <BottomSheet open={open} onClose={onClose} label="Account" gap={20}>
      <SheetHeader title="Account" size={26} onClose={onClose} />

      {wallet ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14 }}>
          <WalletAvatar id={wallet.id} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T size={16} w={600}>
              {wallet.name}
            </T>
            <T size={13} tnum color={C.ink3}>
              {shortAddress(wallet.address)}
            </T>
          </View>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Copy address"
            scale={0.9}
            onPress={async () => {
              await Clipboard.setStringAsync(wallet.address);
              toast("Address copied");
            }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}
          >
            <IconCopy size={18} color={C.ink2} />
          </Tap>
        </View>
      ) : (
        <PrimaryButton onPress={onConnect}>Connect wallet</PrimaryButton>
      )}

      {wallet && (
        <Tap
          accessibilityRole="button"
          scale={0.98}
          onPress={async () => {
            await getDriver().disconnect();
            disconnect();
            onClose();
            toast("Wallet disconnected");
          }}
          style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 }}
        >
          <IconLogout size={20} color={C.danger} />
          <T size={15} w={600} color={C.danger}>
            Disconnect
          </T>
        </Tap>
      )}

      {DEVNET && wallet && (
        <View style={{ gap: 10, borderTopWidth: 1, borderColor: C.line, paddingTop: 16 }}>
          <T size={12} w={600} tracking={0.08} color={C.ink3}>
            SOLANA DEVNET
          </T>
          <Row label="Devnet SOL" value={safe ? sol(safe.walletSolLamports) : "…"} />
          <Row label="Test USDC in wallet" value={safe ? Number(safe.walletUsdc).toString() : "…"} />
          <Row label="Idle USDC in Safe" value={safe ? Number(safe.idleUsdc).toString() : "…"} />
          {safe && (
            <Tap accessibilityRole="link" feedback="none" onPress={() => Linking.openURL(explorerAddress(safe.safe))}>
              <Row label="Safe" value={safe.exists ? shortAddress(safe.safe) : "Created with your first deposit"} link={safe.exists} />
            </Tap>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <SmallButton label="Get devnet SOL" onPress={() => Linking.openURL(FAUCET_SOL)} />
            <SmallButton label="Get test USDC" onPress={() => Linking.openURL(FAUCET_USDC)} />
          </View>
        </View>
      )}

      {!DEVNET && (
      <View style={{ gap: 12, borderTopWidth: 1, borderColor: C.line, paddingTop: 16 }}>
        <T size={12} w={600} tracking={0.08} color={C.ink3}>
          DEMO
        </T>
        {isMock && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T size={15} w={600}>
                Mock wallet
              </T>
              <T size={13} color={C.ink3}>
                How signatures are approved
              </T>
            </View>
            <View accessibilityRole="radiogroup" style={{ flexDirection: "row", borderRadius: 999, backgroundColor: C.raised, padding: 4 }}>
              {(["ask", "auto"] as const).map((m) => {
                const on = mockApproval === m;
                return (
                  <Tap
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    feedback="select"
                    onPress={() => setMockApproval(m)}
                    style={[{ height: 36, borderRadius: 999, paddingHorizontal: 12, justifyContent: "center", backgroundColor: on ? C.white : "transparent" }, on ? shadow.float : null]}
                  >
                    <T size={13} w={600} color={on ? C.ink : C.ink4}>
                      {m === "ask" ? "Ask" : "Auto-approve"}
                    </T>
                  </Tap>
                );
              })}
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <SmallButton
            label="Load demo data"
            onPress={() => {
              loadDemo();
              onClose();
              toast("Demo portfolio loaded");
            }}
          />
          <SmallButton
            label="Start over"
            onPress={async () => {
              if (wallet) await getDriver().disconnect();
              reset();
              router.replace("/");
            }}
          />
        </View>
      </View>
      )}
    </BottomSheet>
  );
}

function Row({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <T size={14} color={C.ink2}>
        {label}
      </T>
      <T size={14} w={600} tnum color={link ? C.blue : C.ink}>
        {value}
      </T>
    </View>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap
      accessibilityRole="button"
      onPress={onPress}
      bg={C.white}
      pressedBg={C.surface}
      style={{ flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line2, alignItems: "center", justifyContent: "center" }}
    >
      <T size={14} w={600}>
        {label}
      </T>
    </Tap>
  );
}
