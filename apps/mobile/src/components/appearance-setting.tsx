import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClayCard, ScreenSection, SectionHeader } from '@/components/ui/clay';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/providers/theme-provider';

export function AppearanceSetting() {
  const theme = useDesignTheme();
  const { preference, setPreference } = useThemePreference();
  const enabled = preference === 'dark';
  const setEnabled = (value: boolean) => { void setPreference(value ? 'dark' : 'light'); };

  return (
    <ScreenSection>
      <SectionHeader title="Appearance" />
      <ClayCard variant="subtle"
        accessible
        accessibilityRole="switch"
        accessibilityLabel="Dark mode"
        accessibilityHint="Use ExploreWise with a darker interface."
        accessibilityState={{ checked: enabled }}
        onPress={() => setEnabled(!enabled)}
        style={styles.row}>
        <View style={styles.copy}>
          <ThemedText style={Typography.label}>Dark mode</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Use ExploreWise with a darker interface.</ThemedText>
        </View>
        {/* One accessible control for the entire row; the native switch remains directly tappable. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Switch
            accessible={false}
            focusable={false}
            accessibilityLabel="Dark mode"
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: theme.border.strong, true: theme.accent.primary }}
            thumbColor={enabled ? theme.accent.onPrimary : theme.background.surfaceRaised}
            ios_backgroundColor={theme.border.strong}
          />
        </View>
      </ClayCard>
    </ScreenSection>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: Radius.row, alignItems: 'center', flexDirection: 'row', gap: Spacing.md, minHeight: TouchTarget.comfortable },
  copy: { flex: 1, minWidth: 0, gap: Spacing.xs },
});
