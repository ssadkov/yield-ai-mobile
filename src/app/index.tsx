import { Redirect } from "expo-router";
import { OnboardingScreen, useApp } from "@/features/yield-app";

/** Returning users go straight to Home. */
export default function Index() {
  const onboarded = useApp((s) => s.onboarded);
  if (onboarded) return <Redirect href="/home" />;
  return <OnboardingScreen />;
}
