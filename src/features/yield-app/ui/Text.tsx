import { Text, type TextProps, type TextStyle } from "react-native";
import { C, F, type Weight } from "./theme";

type Props = TextProps & {
  size?: number;
  w?: Weight;
  color?: string;
  /** letter-spacing in em, like the CSS in the mockups */
  tracking?: number;
  lh?: number;
  tnum?: boolean;
  center?: boolean;
};

/** Inter text with the design's units. Font scaling is capped so the layout survives large system fonts. */
export function T({ size = 15, w = 400, color = C.ink, tracking, lh, tnum, center, style, ...rest }: Props) {
  const s: TextStyle = {
    fontFamily: F[w],
    fontSize: size,
    color,
    letterSpacing: tracking ? size * tracking : undefined,
    lineHeight: lh ? Math.round(size * lh) : undefined,
    fontVariant: tnum ? ["tabular-nums"] : undefined,
    textAlign: center ? "center" : undefined,
    includeFontPadding: false,
  };
  return <Text maxFontSizeMultiplier={1.2} {...rest} style={[s, style]} />;
}
