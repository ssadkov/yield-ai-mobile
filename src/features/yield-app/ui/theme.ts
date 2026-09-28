/** Tokens — design/Foundations.dc.html + screen mockups (same values as yield-ai-seeker/globals.css). */
export const C = {
  ink: "#12161C",
  ink2: "#3E4753",
  ink3: "#5E6875",
  ink4: "#6B7582",
  mute: "#9AA5B4",
  mute2: "#B8C0CB",
  handle: "#C3CCD8",

  white: "#FFFFFF",
  surface: "#F4F7FB",
  raised: "#EEF3FA",
  subtle: "#F8FAFC",
  neutral: "#EEF1F5",
  select: "#F3F8FF",
  line: "#E4E9F0",
  line2: "#DCE2EA",
  orbit: "#C9DBF3",

  blue: "#0A6CDB",
  blueDisabled: "#8FB8EC",
  blueSoft: "#EAF2FD",
  navy: "#0B2E5E",
  gain: "#0B7A4B",
  gain2: "#16A34A",
  gainSoft: "#E8F7EF",
  gainMute: "#86CFA3",
  warn: "#C2410C",
  danger: "#B91C1C",
  dangerSoft: "#FDECEC",
  scrim: "rgba(12,18,28,0.45)",
} as const;

export const BLUE_BAR = ["#2F86EA", "#8BBDF7"] as const;
export const SOFT_BAR = ["#E3EEFC", "#F1F6FD"] as const;

/** Inter per weight (Android needs a family per weight). */
export const F = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
  800: "Inter_800ExtraBold",
} as const;
export type Weight = keyof typeof F;

/** CSS `em` letter-spacing → RN points. */
export const em = (size: number, v: number) => size * v;

export const shadow = {
  tip: { shadowColor: "#12161C", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  float: { shadowColor: "#12161C", shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  menu: { shadowColor: "#12161C", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  cta: { shadowColor: "#0A6CDB", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  coin: { shadowColor: "#12161C", shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
} as const;
