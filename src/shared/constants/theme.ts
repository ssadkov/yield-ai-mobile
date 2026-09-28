/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    // Legacy tokens
    text: '#11181C',
    background: '#fcfcfc',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Semantic tokens (mirrors web --primary, --secondary, etc.)
    foreground: '#222222',
    primary: '#2a2a2a',
    primaryForeground: '#fcfcfc',
    secondary: '#f5f5f5',
    secondaryForeground: '#222222',
    muted: '#f5f5f5',
    mutedForeground: '#737373',
    border: '#e3e3e3',
    card: '#ffffff',
    cardForeground: '#222222',
  },
  dark: {
    // Legacy tokens
    text: '#ECEDEE',
    background: '#060606',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // Semantic tokens (mirrors web --primary, --secondary, etc.)
    foreground: '#f2f2f2',
    primary: '#f0f0f0',
    primaryForeground: '#1a1a1a',
    secondary: '#333333',
    secondaryForeground: '#f2f2f2',
    muted: '#303030',
    mutedForeground: '#9e9e9e',
    border: '#454545',
    card: '#242424',
    cardForeground: '#f2f2f2',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
