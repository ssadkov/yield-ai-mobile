import { useEffect } from "react";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { C } from "./theme";

type P = { size?: number; sw?: number; color?: string };

function make(children: React.ReactNode) {
  return function Icon({ size = 22, sw = 2, color = C.ink }: P) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
    );
  };
}

export const IconBack = make(<Path d="m15 6-6 6 6 6" />);
export const IconChevron = make(<Path d="m9 6 6 6-6 6" />);
export const IconClose = make(<Path d="M6 6l12 12M18 6 6 18" />);
export const IconTrend = make(
  <>
    <Path d="M3 17l6-6 4 4 8-8" />
    <Path d="M14 7h7v7" />
  </>,
);
export const IconInfo = make(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 11v5M12 8h.01" />
  </>,
);
export const IconAlert = make(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 8v4M12 16h.01" />
  </>,
);
export const IconClock = make(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 7v5l3 2" />
  </>,
);
export const IconUnlock = make(
  <>
    <Rect x="4" y="11" width="16" height="10" rx="2" />
    <Path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </>,
);
export const IconLock = make(
  <>
    <Rect x="4" y="11" width="16" height="10" rx="2" />
    <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>,
);
export const IconDown = make(<Path d="M12 5v14M6 13l6 6 6-6" />);
export const IconUp = make(<Path d="M12 19V5M6 11l6-6 6 6" />);
export const IconArrowRight = make(<Path d="M5 12h14M13 6l6 6-6 6" />);
export const IconPlus = make(<Path d="M12 5v14M5 12h14" />);
export const IconCheck = make(<Path d="M20 6 9 17l-5-5" />);
export const IconFilters = make(<Path d="M4 7h16M7 12h10M10 17h4" />);
export const IconShield = make(<Path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6l-7-3Z" />);
export const IconCopy = make(
  <>
    <Rect x="9" y="9" width="11" height="11" rx="2" />
    <Path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </>,
);
export const IconLogout = make(<Path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />);

/** Phone outline with the side button lit — "double-tap the side button". */
export function IconSideButton({ w = 16, h = 24 }: { w?: number; h?: number }) {
  return (
    <Svg width={w} height={h} viewBox="0 0 16 24" fill="none">
      <Rect x="1" y="1" width="12" height="22" rx="3" stroke={C.mute} strokeWidth="1.5" />
      <Rect x="13.5" y="6" width="2" height="5" rx="1" fill={C.blue} />
    </Svg>
  );
}

export function Spinner({ size = 18, color = C.white }: { size?: number; color?: string }) {
  const rot = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: reduced ? 2400 : 900, easing: Easing.linear }), -1, false);
  }, [rot, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="9" stroke={color} strokeOpacity={0.25} strokeWidth="2.5" />
        <Path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}
