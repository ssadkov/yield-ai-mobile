import { useState } from "react";
import { Linking, View } from "react-native";
import { moneyAuto } from "../lib/format";
import { useApp } from "../lib/store";
import { Tap } from "../ui/Tap";
import { T } from "../ui/Text";
import { IconAlert, Spinner } from "../ui/icons";
import { C } from "../ui/theme";
import { NET, explorerTx } from "./config";
import { reconcile } from "./engine";
import { updateEntry, useOpenEntry, type JournalEntry } from "./journal";
import { refreshSafe, useSafe } from "./state";

const OP: Record<JournalEntry["op"], string> = {
  create: "Safe setup",
  deposit: "deposit",
  withdraw: "withdrawal",
  kamino_deposit: "deposit",
  kamino_redeem: "withdrawal",
  kamino_return: "withdrawal",
  exponent_setup: "fixed-rate setup",
  exponent_buy: "fixed-rate deposit",
  exponent_sell: "fixed-rate withdrawal",
};

/**
 * Home banner for a transaction that isn't settled yet (still confirming, or the result is
 * unknown after the blockhash expired). New deposits and withdrawals wait for it.
 */
/** True when ChainBanner has something to show. */
export function useChainBannerVisible() {
  const owner = useApp((s) => s.wallet?.address);
  const open = useOpenEntry(owner);
  const apiError = useSafe((s) => (s.safe ? null : s.error));
  return !!open || !!apiError;
}

export function ChainBanner() {
  const owner = useApp((s) => s.wallet?.address);
  const open = useOpenEntry(owner);
  const apiError = useSafe((s) => (s.safe ? null : s.error));
  const [checking, setChecking] = useState(false);

  if (!open) {
    if (!apiError) return null;
    return (
      <Box tone="danger">
        <T size={14} lh={1.45} color={C.danger} style={{ flex: 1 }}>
          Can&apos;t load your balance. {apiError}
        </T>
        <Action label="Retry" onPress={() => refreshSafe()} />
      </Box>
    );
  }

  const what = open.amount === "all" ? `${OP[open.op]} of all idle USDC` : open.amountUsd > 0 ? `${OP[open.op]} of ${moneyAuto(open.amountUsd)}` : OP[open.op];
  const check = async () => {
    if (checking) return;
    setChecking(true);
    await reconcile(open);
    await refreshSafe();
    setChecking(false);
  };

  if (open.status !== "unknown") {
    return (
      <Box tone="info">
        <Spinner size={16} color={C.blue} />
        <T size={14} lh={1.45} color={C.ink2} style={{ flex: 1 }}>
          Confirming your {what} on {NET.label}…
        </T>
        <Action label="View" onPress={() => Linking.openURL(explorerTx(open.signature))} />
        {!checking && <Action label="Check" onPress={check} />}
      </Box>
    );
  }

  return (
    <Box tone="danger" column>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <IconAlert size={18} sw={1.8} color={C.danger} />
        <T size={14} lh={1.45} color={C.danger} style={{ flex: 1 }}>
          We couldn&apos;t confirm your {what}. It may still have gone through. Check it in Explorer and your balance before trying again.
        </T>
      </View>
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
        <Action label="Explorer" onPress={() => Linking.openURL(explorerTx(open.signature))} />
        <Action label={checking ? "Checking…" : "Check again"} onPress={check} />
        <Action label="I checked it" onPress={() => updateEntry(open.id, { acknowledged: true })} />
      </View>
    </Box>
  );
}

function Box({ tone, column, children }: { tone: "info" | "danger"; column?: boolean; children: React.ReactNode }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: column ? "column" : "row",
        alignItems: column ? "stretch" : "center",
        gap: 10,
        borderRadius: 18,
        backgroundColor: tone === "danger" ? C.dangerSoft : C.blueSoft,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      {children}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" feedback="none" onPress={onPress} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
      <T size={13} w={600}>
        {label}
      </T>
    </Tap>
  );
}
