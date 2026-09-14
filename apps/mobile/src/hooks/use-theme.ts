import { Colors, ColorTokens, ThemeElevation } from '@/constants/theme';
import { useThemePreference } from '@/providers/theme-provider';

export function useTheme() {
  return Colors[useThemePreference().preference];
}

/** Canonical semantic theme for new and migrated shared UI. */
export function useDesignTheme() {
  return ColorTokens[useThemePreference().preference];
}

export function useThemeElevation() {
  return ThemeElevation[useThemePreference().preference];
}
