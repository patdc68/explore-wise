import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ClayCard, ClayInput, ChoiceChip, PrimaryButton } from '@/components/ui/clay';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';

const suggestions = [
  { label: 'Date night', prompt: 'Date in Makati tonight, ₱2,000 for two' },
  { label: 'Budget eats', prompt: 'Find a meal nearby for one person with a ₱300 budget' },
  { label: 'Coffee + fun', prompt: 'Coffee and something fun nearby for two people' },
  { label: 'Family day', prompt: 'A family day out with food and an activity for four people' },
] as const;

export function AskWiseCard({ prompt, onChangePrompt, onSubmit, isLoading = false, compact = false, surface = 'hero' }: {
  prompt: string;
  onChangePrompt: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  compact?: boolean;
  surface?: 'hero' | 'subtle';
}) {
  const theme = useDesignTheme();
  return (
    <ClayCard variant={surface} padding="default" style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.mark, { backgroundColor: theme.accent.primary }]}>
          <Ionicons name="sparkles" color={theme.accent.onPrimary} size={16} accessible={false} />
        </View>
        <View style={styles.copy}>
          <ThemedText accessibilityRole="header" style={Typography.cardTitle}>Ask Wise</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">An outing built around you.</ThemedText>
        </View>
      </View>
      <View style={[styles.query, { backgroundColor: theme.background.canvas, borderColor: theme.border.subtle }]}>
      <ClayInput
        accessibilityLabel="Ask Wise your plan"
        accessibilityHint="Describe your location, budget, and who is coming. Then tap Ask Wise."
        value={prompt}
        onChangeText={onChangePrompt}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        autoCapitalize="sentences"
        placeholder="Date in Makati tonight, ₱2,000 for two"
        style={styles.input}
      />
      <PrimaryButton
        label="Ask"
        loadingLabel="Ask Wise"
        loading={isLoading}
        disabled={isLoading}
        onPress={onSubmit}
        accessibilityLabel="Ask Wise"
        style={styles.submit}
      />
      </View>
      {!compact ? (
        <View style={styles.suggestions}>
          <ThemedText style={Typography.eyebrow} themeColor="muted">Quick prompts</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {suggestions.map((suggestion) => (
              <ChoiceChip
                key={suggestion.label}
                label={suggestion.label}
                accessibilityLabel={`Try ${suggestion.label}`}
                accessibilityHint="Fills the prompt for you to edit before asking Wise."
                selected={prompt === suggestion.prompt}
                onPress={() => onChangePrompt(suggestion.prompt)}
                disabled={isLoading}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ClayCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md, borderRadius: Radius.card },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.mdCompact },
  mark: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  copy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  query: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.card, padding: Spacing.xs, gap: Spacing.xs },
  input: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: Spacing.sm, ...Typography.bodySecondary },
  submit: { minHeight: 44, paddingHorizontal: Spacing.md },
  suggestions: { gap: Spacing.sm },
  chips: { flexDirection: 'row', gap: Spacing.sm },
});
