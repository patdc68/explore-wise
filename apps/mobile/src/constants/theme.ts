/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

export const Colors = {
  light: {
    text: '#17233B', background: '#F7F4EA', backgroundElement: '#EEEAE0', backgroundSelected: '#E5F4A9',
    textSecondary: '#4E5A6D', muted: '#697384', surface: '#FFFDF6', elevatedSurface: '#FFFFFF', border: '#D7D8CF',
    accent: '#C8F04A', accentStrong: '#A9D52C', accentSoft: '#EEF8C8', accentText: '#17233B', navy: '#17233B',
    success: '#58731A', successSoft: '#EAF3CA', warning: '#8A5A18', warningSoft: '#FFF0CC',
    error: '#A63F36', errorSoft: '#FBE2DD', unknown: '#596477', unknownSoft: '#ECEEF1', shadow: '#27334A',
  },
  dark: {
    text: '#F7F7F1', background: '#172033', backgroundElement: '#202C42', backgroundSelected: '#405322',
    textSecondary: '#C6CEDC', muted: '#9CA8B9', surface: '#202C42', elevatedSurface: '#293650', border: '#40506A',
    accent: '#D3F36E', accentStrong: '#B5DD45', accentSoft: '#35451C', accentText: '#17233B', navy: '#F7F7F1',
    success: '#CAE780', successSoft: '#35451C', warning: '#FFD17B', warningSoft: '#523F1C',
    error: '#FFAEA2', errorSoft: '#542D31', unknown: '#C3CAD5', unknownSoft: '#354055', shadow: '#000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  section: 36,
  // Compatibility aliases for existing Phase 1 screens.
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { chip: 999, input: 16, card: 22, largeCard: 30, sheet: 30 } as const;

export const Typography = {
  screenHeading: { fontSize: 32, lineHeight: 37, fontWeight: '800' as const, letterSpacing: -0.8 },
  sectionHeading: { fontSize: 21, lineHeight: 27, fontWeight: '800' as const, letterSpacing: -0.35 },
  cardTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  price: { fontSize: 19, lineHeight: 25, fontWeight: '800' as const, letterSpacing: -0.25 },
  badge: { fontSize: 12, lineHeight: 16, fontWeight: '800' as const, letterSpacing: 0.25 },
} as const;

export const Shadows: Record<'subtle' | 'card' | 'raised' | 'floating', ViewStyle> = {
  subtle: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 7, elevation: 2 },
  card: { shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 },
  raised: { shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 },
  floating: { shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.17, shadowRadius: 22, elevation: 8 },
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
