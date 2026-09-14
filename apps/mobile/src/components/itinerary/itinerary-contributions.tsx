import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SectionHeader } from '@/components/ui/clay';
import { Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { contributionTargets } from '@/services/itinerary-contributions';
import type { LiveItinerary } from '@/services/itinerary-execution';

export function ItineraryContributions({ active }: { active: LiveItinerary }) {
  const router = useRouter();
  const theme = useDesignTheme();
  const targets = contributionTargets(active);
  if (!targets.length) return null;
  const sharedCount = targets.filter((stop) => stop.shared).length;
  return <View style={[styles.section, { borderTopColor: theme.border.subtle }]}>
    <SectionHeader title="Help the next explorer" description="An optional next step: share an experience from your trip." />
    <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">{sharedCount} of {targets.length} experiences shared</ThemedText>
    {targets.map((stop) => <View key={stop.stopId} style={[styles.row, { borderBottomColor: theme.border.subtle }]}>
      <ThemedText style={[Typography.label, styles.placeName]}>{stop.place.name}</ThemedText>
      {stop.shared ? <View accessible accessibilityLabel={`Thanks — experience at ${stop.place.name} shared`} accessibilityLiveRegion="polite"><ThemedText style={[Typography.metadata, { color: theme.semantic.success.default }]}>✓ Thanks — shared</ThemedText></View>
        : <PrimaryButton label="Share" labelNumberOfLines={0} accessibilityLabel={`Share your experience at ${stop.place.name}`} onPress={() => router.push({ pathname: '/place/[id]/report', params: {
          id: stop.place.place_id, source: 'completed-itinerary', itineraryId: active.execution.itineraryId, stopId: stop.stopId,
        } })} />}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.mdCompact, borderTopWidth: 1, paddingTop: Spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs, borderBottomWidth: 1 },
  placeName: { flexGrow: 1, flexBasis: 160 },
});
