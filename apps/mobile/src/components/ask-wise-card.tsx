import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ClayInput, PrimaryButton } from '@/components/ui/clay';
import { ThemedText } from '@/components/themed-text';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function AskWiseCard({ prompt, onChangePrompt, onSubmit, onSuggestionSubmit, isLoading = false, compact = false }: { prompt: string; onChangePrompt: (value: string) => void; onSubmit: () => void; onSuggestionSubmit?: (value: string) => void; isLoading?: boolean; compact?: boolean }) {
  const theme = useTheme();
  const suggestions = ['₱2,000 for two in Makati', 'Four friends in BGC tonight', 'Something fun nearby'];
  return <View style={[styles.card, Shadows.floating, { backgroundColor: theme.navy, borderColor: theme.navy, shadowColor: theme.shadow }, compact && styles.compact]}>
    <View style={styles.header}><View style={[styles.mark, { backgroundColor: theme.accent }]}><Ionicons name="sparkles" color={theme.accentText} size={18} /></View><View style={styles.copy}><ThemedText style={[Typography.cardTitle, { color: theme.background }]}>Ask Wise</ThemedText><ThemedText type="small" style={{ color: theme.textSecondary }}>Build an outing around your moment.</ThemedText></View></View>
    <ThemedText style={[styles.question, { color: theme.background }]}>Where should we go?</ThemedText>
    <ClayInput accessibilityLabel="Ask Wise your plan" value={prompt} onChangeText={onChangePrompt} multiline placeholder="Try “₱2,000 for two in Makati”" style={[styles.input, { backgroundColor: theme.elevatedSurface }]} />
    {!compact ? <View style={styles.suggestions}>{suggestions.map((suggestion) => <Pressable accessibilityRole="button" accessibilityLabel={`Use suggestion: ${suggestion}`} key={suggestion} onPress={() => onSuggestionSubmit ? onSuggestionSubmit(suggestion) : onChangePrompt(suggestion)} style={[styles.suggestion, { borderColor: 'rgba(255,255,255,0.22)' }]}><ThemedText numberOfLines={1} style={[styles.suggestionText, { color: theme.background }]}>{suggestion}</ThemedText></Pressable>)}</View> : null}
    <PrimaryButton label={isLoading ? 'Starting your plan…' : 'Ask Wise'} disabled={isLoading} onPress={onSubmit} accessibilityLabel="Ask Wise" />
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.largeCard, borderWidth: 1, gap: Spacing.md, padding: Spacing.lg }, compact: { padding: Spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm }, mark: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 }, copy: { flex: 1, gap: 1 },
  question: { fontSize: 24, fontWeight: '800', letterSpacing: -0.45, lineHeight: 29 }, input: { minHeight: 70, textAlignVertical: 'top' },
  suggestions: { gap: Spacing.xs }, suggestion: { alignSelf: 'flex-start', borderRadius: Radius.chip, borderWidth: 1, maxWidth: '100%', minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 5 }, suggestionText: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
});
