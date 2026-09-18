import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PriceSummary } from '@/components/discovery/price-summary';
import { PlaceVisual } from '@/components/discovery/place-visual';
import { StateCard } from '@/components/discovery/state-card';
import { ThemedText } from '@/components/themed-text';
import { ChoiceChip, ClayCard, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme, useTheme } from '@/hooks/use-theme';
import { alternativesTitle, originSuggestionLabel } from '@/services/customize-ui';
import { ACTIVITY_CATEGORY_CODES, ALTERNATIVES_PAGE_SIZE, activityFamily, foodFocusLabel, isActivityStage, isFoodStage } from '@/services/food-candidate-diversity';
import type { PricedNearbyPlace } from '@/services/places';
import { usePlanningAlternatives } from '@/providers/planning-alternatives-provider';
import { isBroadActivityStage } from '@/services/itinerary';
import { stageDistanceLabel, type StageDistanceOrigin } from '@/services/planning-distance';

type ActivityFilter = 'all' | 'recreation' | 'entertainment' | 'cinema' | 'outdoor' | 'attraction' | 'culture';
const activityFilters: readonly { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'recreation', label: 'Recreation' }, { id: 'entertainment', label: 'Entertainment' },
  { id: 'cinema', label: 'Cinema' }, { id: 'outdoor', label: 'Outdoor' }, { id: 'attraction', label: 'Attractions' }, { id: 'culture', label: 'Culture' },
];

export default function AlternativesScreen() {
  const router = useRouter(); const theme = useTheme(); const { session } = usePlanningAlternatives();
  const [sort, setSort] = useState<'recommended' | 'nearest'>('recommended');
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [visibleCount, setVisibleCount] = useState(ALTERNATIVES_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagingError, setPagingError] = useState<string | null>(null);
  const genericActivity = Boolean(session && isActivityStage(session.stage.categoryCodes) && isBroadActivityStage(session.stage) && session.stage.categoryCodes.some((code) => ACTIVITY_CATEGORY_CODES.includes(code as typeof ACTIVITY_CATEGORY_CODES[number])));
  const alternatives = useMemo(() => {
    const shortlisted = new Set(session?.shortlistedIds ?? []);
    const more = session?.candidates.filter((place) => !shortlisted.has(place.place_id)) ?? [];
    const filtered = genericActivity && filter !== 'all' ? more.filter((place) => activityFamily(place) === filter) : more;
    return sort === 'nearest' ? [...filtered].sort((left, right) => Number(session?.broaderCandidateIds.includes(left.place_id)) - Number(session?.broaderCandidateIds.includes(right.place_id)) || (left.distance_meters ?? Number.POSITIVE_INFINITY) - (right.distance_meters ?? Number.POSITIVE_INFINITY)) : filtered;
  }, [filter, genericActivity, session?.broaderCandidateIds, session?.candidates, session?.shortlistedIds, sort]);
  if (!session) return <Screen theme={theme}><StateCard title="Options unavailable" message="Return to Customize and open View more options again." actionLabel="Back to Customize" onAction={() => router.back()} /></Screen>;
  const visible = alternatives.slice(0, visibleCount);
  const canLoadMore = visible.length < alternatives.length;
  const loadMore = () => {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    setPagingError(null);
    try {
      requestAnimationFrame(() => { setVisibleCount((count) => Math.min(count + ALTERNATIVES_PAGE_SIZE, alternatives.length)); setLoadingMore(false); });
    } catch {
      setLoadingMore(false);
      setPagingError('We couldn’t load more options. Your current suggestions are still available.');
    }
  };
  const select = (place: PricedNearbyPlace) => session.select(place);

  return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView edges={['top']} style={styles.safe}><FlatList
    data={visible}
    keyExtractor={(place) => place.place_id}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to Customize" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={theme.text} /><ThemedText type="smallBold">Customize</ThemedText></Pressable><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>MORE OPTIONS</ThemedText><ThemedText style={Typography.screenHeading}>{alternativesTitle(session.stage)}</ThemedText><ThemedText type="small" themeColor="textSecondary">{originSuggestionLabel(session.origin) ?? 'More grounded suggestions'}</ThemedText>{session.explicitFoodFocus && session.broaderCandidateIds.length ? <ThemedText type="small" themeColor="textSecondary">{`Broader alternatives are shown after ${foodFocusLabel(session.explicitFoodFocus)} matches and are not presented as matches.`}</ThemedText> : null}{isFoodStage(session.stage.categoryCodes) ? <View style={styles.controls}><SortButton label="Recommended" selected={sort === 'recommended'} onPress={() => setSort('recommended')} /><SortButton label="Nearest" selected={sort === 'nearest'} onPress={() => setSort('nearest')} /></View> : null}{genericActivity ? <FlatList horizontal data={activityFilters} keyExtractor={(item) => item.id} renderItem={({ item }) => <FilterChip label={item.label} selected={filter === item.id} onPress={() => { setFilter(item.id); setVisibleCount(ALTERNATIVES_PAGE_SIZE); }} />} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} /> : null}</View>}
    renderItem={({ item }) => <AlternativeCard place={item} currencyCode={'source' in session.proposal ? session.proposal.state.currencyCode ?? session.proposal.intent.budget.currencyCode : undefined} distanceOrigin={session.distanceOrigin} broader={session.broaderCandidateIds.includes(item.place_id)} selected={session.selectedId === item.place_id} onSelect={() => select(item)} />}
    ListEmptyComponent={<StateCard title={filter === 'all' ? 'No more options' : 'No more options in this category.'} message={filter === 'all' ? 'This list contains every eligible nearby place.' : 'Try the full set of suggestions.'} actionLabel={filter === 'all' ? undefined : 'Show all'} onAction={filter === 'all' ? undefined : () => { setFilter('all'); setVisibleCount(ALTERNATIVES_PAGE_SIZE); }} />}
    ListFooterComponent={pagingError ? <View style={styles.footer}><ThemedText type="small" themeColor="textSecondary">{pagingError}</ThemedText><SecondaryButton label="Retry" accessibilityLabel="Retry loading more options" onPress={loadMore} /></View> : canLoadMore ? <View style={styles.footer}>{loadingMore ? <ActivityIndicator color={theme.accent} /> : <SecondaryButton label="Load more" accessibilityLabel="Load more options" onPress={loadMore} />}</View> : visible.length ? <ThemedText type="small" themeColor="textSecondary" style={styles.end}>You&apos;ve seen all currently eligible options.</ThemedText> : null}
    onEndReached={loadMore}
    onEndReachedThreshold={0.5}
  /></SafeAreaView></View>;
}

function Screen({ children, theme }: { children: React.ReactNode; theme: ReturnType<typeof useTheme> }) { return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView edges={['top']} style={styles.safe}><View style={styles.content}>{children}</View></SafeAreaView></View>; }
function SortButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <ChoiceChip label={label} accessibilityLabel={`${label} sort`} selected={selected} onPress={onPress} />; }
function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <ChoiceChip label={label} accessibilityLabel={`${label} filter`} selected={selected} onPress={onPress} />; }
function AlternativeCard({ place, currencyCode, distanceOrigin, broader, selected, onSelect }: { place: PricedNearbyPlace; currencyCode?: string; distanceOrigin: StageDistanceOrigin; broader: boolean; selected: boolean; onSelect: () => void }) {
  const theme = useDesignTheme();
  const distance = stageDistanceLabel(distanceOrigin, place);
  return <ClayCard variant={selected ? 'raised' : 'subtle'} style={[styles.card, selected ? { borderColor: theme.accent.primary, borderWidth: 2 } : null]}>
    <View style={styles.cardRow}>
      <PlaceVisual place={place} placeId={place.place_id} thumbnail />
      <View style={styles.cardCopy}>
        {broader ? <ThemedText style={Typography.caption} themeColor="muted">BROADER ALTERNATIVE</ThemedText> : null}
        <ThemedText style={Typography.cardTitle}>{place.name}</ThemedText>
        {place.category_name || place.category_code ? <ThemedText style={Typography.metadata} themeColor="textSecondary">{place.category_name ?? place.category_code}</ThemedText> : null}
        {distance ? <ThemedText style={Typography.metadata} themeColor="textSecondary">{distance}</ThemedText> : null}
      </View>
    </View>
    <PriceSummary place={place} currencyCode={currencyCode} compact />
    <View style={styles.selectRow}><PrimaryButton label={selected ? 'Selected' : 'Select'} accessibilityLabel={`Select ${place.name}`} disabled={selected} onPress={onSelect} /></View>
  </ClayCard>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, safe: { flex: 1 }, content: { alignSelf: 'center', gap: Spacing.mdCompact, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' }, header: { gap: Spacing.sm, marginBottom: Spacing.sm }, eyebrow: { fontSize: 11, letterSpacing: 1.1 }, back: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.xs, minHeight: 44, paddingHorizontal: Spacing.sm }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, chips: { gap: Spacing.sm, paddingRight: Spacing.md }, selectRow: { alignItems: 'flex-end' }, card: { borderRadius: Radius.row, gap: Spacing.sm }, cardRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm }, cardCopy: { flex: 1, gap: Spacing.xs, minWidth: 0 }, footer: { alignItems: 'center', paddingVertical: Spacing.md }, end: { paddingVertical: Spacing.md, textAlign: 'center' } });
