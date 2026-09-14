import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Palette primitives stay private to the theme so product UI uses semantic names. */
const palette = {
  cream50: '#FFFEFA',
  cream100: '#F8F5EA',
  cream200: '#EFEADF',
  white: '#FFFFFF',
  navy900: '#17233B',
  navy700: '#4E5A6D',
  navy600: '#697384',
  lime300: '#EEF8C8',
  lime500: '#C8F04A',
  lime600: '#A9D52C',
  yellow100: '#FFF0CC',
  blue100: '#E7F1FA',
  coral100: '#FBE2DD',
  green700: '#58731A',
  amber800: '#8A5A18',
  red700: '#A63F36',
  blue700: '#27668A',
  border100: '#E7E4DA',
  border300: '#D5D5CB',
  border500: '#AEB3AA',
  shadow: '#27334A',
} as const;

/** Canonical semantic color tokens, resolved from the user's appearance preference. */
export const ColorTokens = {
  light: {
    background: {
      canvas: '#FAF8F2',
      surface: palette.white,
      surfaceRaised: palette.white,
      subtle: palette.cream200,
    },
    text: {
      primary: '#0D172A',
      secondary: '#334155',
      muted: '#64748B',
      inverse: palette.cream50,
    },
    accent: {
      primary: '#84CC16',
      primaryPressed: '#65A30D',
      primarySoft: palette.lime300,
      onPrimary: '#0D172A',
    },
    action: {
      secondary: '#0D172A',
      secondaryPressed: '#1E293B',
      onSecondary: '#FAF8F2',
      tertiary: 'transparent',
      onTertiary: '#334155',
    },
    border: {
      default: palette.border300,
      subtle: '#E5E0D4',
      strong: palette.border500,
      focus: palette.navy900,
    },
    semantic: {
      success: { default: palette.green700, soft: '#EAF3CA' },
      warning: { default: palette.amber800, soft: palette.yellow100 },
      error: { default: palette.red700, soft: palette.coral100 },
      info: { default: palette.blue700, soft: palette.blue100 },
    },
    itinerary: {
      current: '#84CC16',
      currentSoft: '#F3FAD9',
      completed: '#4D7C0F',
      completedSoft: '#EEF7DA',
      skipped: '#64748B',
      skippedSoft: '#F1F0EC',
      upcoming: '#334155',
    },
    depth: { shadow: palette.shadow, highlight: 'rgba(255,255,255,0.82)' },
  },
  dark: {
    background: {
      canvas: '#0B1320',
      surface: '#162238',
      surfaceRaised: '#1E2E4A',
      subtle: '#152033',
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#F1F5F9',
      muted: '#94A3B8',
      inverse: palette.navy900,
    },
    accent: {
      primary: '#84CC16',
      primaryPressed: '#65A30D',
      primarySoft: '#35451C',
      onPrimary: '#0B1320',
    },
    action: {
      secondary: '#263859',
      secondaryPressed: '#33466D',
      onSecondary: '#F8FAFC',
      tertiary: 'transparent',
      onTertiary: '#F1F5F9',
    },
    border: {
      default: '#40506A',
      subtle: '#334155',
      strong: '#64748C',
      focus: '#D3F36E',
    },
    semantic: {
      success: { default: '#CAE780', soft: '#35451C' },
      warning: { default: '#FFD17B', soft: '#523F1C' },
      error: { default: '#FFAEA2', soft: '#542D31' },
      info: { default: '#9ED7F5', soft: '#223F55' },
    },
    itinerary: {
      current: '#A3E635',
      currentSoft: '#263859',
      completed: '#A3E635',
      completedSoft: '#253718',
      skipped: '#94A3B8',
      skippedSoft: '#141C29',
      upcoming: '#CBD5E1',
    },
    depth: { shadow: '#080F1C', highlight: 'rgba(255,255,255,0.10)' },
  },
} as const;

/**
 * Phase 1 compatibility aliases. These are derived from ColorTokens so existing
 * screens can migrate incrementally without splitting the source of truth.
 */
function compatibilityColors(tokens: (typeof ColorTokens)[keyof typeof ColorTokens]) {
  return {
    text: tokens.text.primary,
    background: tokens.background.canvas,
    backgroundElement: tokens.background.subtle,
    backgroundSelected: tokens.accent.primarySoft,
    textSecondary: tokens.text.secondary,
    muted: tokens.text.muted,
    surface: tokens.background.surface,
    elevatedSurface: tokens.background.surfaceRaised,
    border: tokens.border.default,
    accent: tokens.accent.primary,
    accentStrong: tokens.accent.primaryPressed,
    accentSoft: tokens.accent.primarySoft,
    accentText: tokens.accent.onPrimary,
    secondaryAction: tokens.action.secondary,
    secondaryActionText: tokens.action.onSecondary,
    navy: tokens.text.primary,
    success: tokens.semantic.success.default,
    successSoft: tokens.semantic.success.soft,
    warning: tokens.semantic.warning.default,
    warningSoft: tokens.semantic.warning.soft,
    error: tokens.semantic.error.default,
    errorSoft: tokens.semantic.error.soft,
    info: tokens.semantic.info.default,
    infoSoft: tokens.semantic.info.soft,
    unknown: tokens.text.secondary,
    unknownSoft: tokens.background.subtle,
    shadow: tokens.depth.shadow,
  } as const;
}

export const Colors = {
  light: compatibilityColors(ColorTokens.light),
  dark: compatibilityColors(ColorTokens.dark),
} as const;

export type ColorSchemeName = keyof typeof ColorTokens;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

/** 8px-oriented scale plus a small 4px half-step and intentional semantic aliases. */
export const Spacing = {
  xs: 4,
  sm: 8,
  mdCompact: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  screenHorizontal: 16,
  section: 24,
  card: 16,
  controlGap: 8,
  metadataGap: 4,
  bottomAction: 24,
  // Compatibility aliases for existing Phase 1 screens.
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  row: 16,
  media: 16,
  navigation: 999,
  small: 12,
  medium: 14,
  input: 16,
  button: 999,
  card: 24,
  hero: 30,
  pill: 999,
  // Compatibility aliases.
  chip: 999,
  largeCard: 30,
  sheet: 30,
} as const;

const typeScale = {
  display: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.64 },
  screenTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.56 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.33 },
  cardTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.18 },
  body: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySecondary: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 20, fontWeight: '400' },
  metadata: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, lineHeight: 16, fontWeight: '500' },
  label: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  button: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export const Typography = {
  ...typeScale,
  eyebrow: { ...typeScale.metadata, fontFamily: 'SpaceGrotesk_700Bold', fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  price: { ...typeScale.sectionTitle, letterSpacing: -0.25 },
  badge: { ...typeScale.metadata, fontFamily: 'SpaceGrotesk_600SemiBold', fontWeight: '600', letterSpacing: 0.2 },
  // Compatibility aliases.
  screenHeading: typeScale.screenTitle,
  sectionHeading: typeScale.sectionTitle,
} as const satisfies Record<string, TextStyle>;

/** Cross-platform depth levels. Surface and border colors are applied by components. */
export const Elevation = {
  flat: { shadowOpacity: 0, elevation: 0 },
  subtle: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  raised: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  hero: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 7 },
} as const satisfies Record<string, ViewStyle>;

/** Same depth levels in both modes; dark surfaces rely more on boundaries than shadows. */
export const ThemeElevation = {
  light: Elevation,
  dark: {
    flat: Elevation.flat,
    subtle: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
    raised: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
    hero: { shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.10, shadowRadius: 9, elevation: 3 },
  },
} as const satisfies Record<ColorSchemeName, Record<keyof typeof Elevation, ViewStyle>>;

/** Compatibility names used by Phase 1 surfaces. */
export const Shadows: Record<'flat' | 'subtle' | 'card' | 'raised' | 'hero' | 'floating', ViewStyle> = {
  flat: Elevation.flat,
  subtle: Elevation.subtle,
  card: Elevation.raised,
  raised: Elevation.raised,
  hero: Elevation.hero,
  floating: Elevation.hero,
};

export const TouchTarget = { minimum: 44, comfortable: 48, primary: 52 } as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
