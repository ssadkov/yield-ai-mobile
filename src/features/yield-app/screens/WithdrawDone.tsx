import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { clock, dayLabel, money, shortAddress } from "../lib/format";
import { useApp } from "../lib/store";
import { PrimaryButton } from "../ui/Button";
import { Screen, Skeleton } from "../ui/Screen";
import { StatusSteps, type Step } from "../ui/StatusSteps";
import { T } from "../ui/Text";
import { haptic } from "../ui/haptics";
import { IconCheck, IconClock } from "../ui/icons";
import { C } from "../ui/theme";
import { PopCheck } from "./Success";
import { LIVE, NET } from "../chain/config";

type Status = "received" | "withdrawing" | "sent";

/**
 * Mock status endpoint. TODO(backend): GET withdrawal status by id.
 * received → withdrawing after 2s → sent after ~25s.
 */
async function fetchStatus(requestedAt: number, completedAt?: number): Promise<Status> {
  await new Promise((r) => setTimeout(r, 120));
  if (completedAt) return "sent";
  const t = Date.now() - requestedAt;
  return t < 2000 ? "received" : t < 25_000 ? "withdrawing" : "sent";
}

export function WithdrawDoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const w = useApp((s) => s.withdrawals[id]);
  const wallet = useApp((s) => s.wallet);
  const complete = useApp((s) => s.completeWithdrawal);
  const [status, setStatus] = useState<Status | null>(null);
  const wasSent = useRef<boolean | null>(null);

  // Poll until the funds are sent.
  useEffect(() => {
    if (!w) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const s = await fetchStatus(w.requestedAt, w.completedAt);
      if (!alive) return;
      setStatus(s);
      if (s === "sent") {
        complete(w.id);
        return;
      }
      timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [w?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sent = status === "sent";
  useEffect(() => {
    if (status === null) return;
    if (wasSent.current === false && sent) haptic.success();
    wasSent.current = sent;
  }, [status, sent]);

  if (!w) return <Redirect href="/home" />;

  const steps: Step[] = [
    { title: "Request received", sub: `${dayLabel(w.requestedAt)}, ${clock(w.requestedAt)}`, state: "done" },
    { title: LIVE ? `Confirmed on ${NET.label}` : "Withdrawing from protocols", sub: status === "received" || status === null ? "Starting…" : sent ? "Done" : "In progress", state: sent ? "done" : "active" },
    {
      title: "Sent to your wallet",
      sub: sent ? `${dayLabel(w.completedAt ?? Date.now())}, ${clock(w.completedAt ?? Date.now())}` : "Usually within 10–60 min",
      state: sent ? "done" : "pending",
    },
  ];

  return (
    <Screen top={56} bottom={32}>
      <View style={{ marginTop: 64, alignItems: "center", gap: 24 }}>
        <PopCheck ring={sent ? C.gainSoft : C.blueSoft} core={sent ? C.gain : C.blue}>
          {sent ? <IconCheck size={32} sw={2.6} color={C.white} /> : <IconClock size={32} sw={2.4} color={C.white} />}
        </PopCheck>
        <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
          <T size={30} w={700} lh={1.15} tracking={-0.03} center accessibilityRole="header">
            {sent ? "Withdrawal complete" : "Withdrawal requested"}
          </T>
          {sent ? (
            <T size={16} lh={1.5} color={C.ink2} center>
              Your USDC is in your wallet.
            </T>
          ) : (
            <T size={16} lh={1.5} color={C.ink2} center>
              {"All good. Your USDC will be in your wallet\nin "}
              <T size={16} w={700}>
                10–60 minutes
              </T>
              .
            </T>
          )}
        </View>
      </View>

      <View style={{ marginTop: 36, gap: 16, borderRadius: 24, backgroundColor: C.surface, padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <T size={14} color={C.ink2}>
            Amount
          </T>
          <T size={26} w={700} tracking={-0.03} tnum>
            {money(w.amount)}
          </T>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T size={14} color={C.ink2}>
            To
          </T>
          <T size={14} w={600}>
            {wallet?.name ?? "Your wallet"} · {shortAddress(w.to)}
          </T>
        </View>
        <View style={{ height: 1, backgroundColor: C.line }} />
        {status === null ? <Skeleton style={{ height: 112 }} /> : <StatusSteps steps={steps} />}
      </View>

      <View style={{ marginTop: "auto", gap: 10, paddingTop: 24 }}>
        {!sent && (
          <T size={13} color={C.ink4} center>
            We&apos;ll notify you when it arrives. You can close the app.
          </T>
        )}
        <PrimaryButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}>Back to home</PrimaryButton>
      </View>
    </Screen>
  );
}
