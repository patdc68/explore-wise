import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PriceSummary } from '@/components/discovery/price-summary';
import { ThemedText } from '@/components/themed-text';
import { ClaySurface, SecondaryButton } from '@/components/ui/clay';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selectedTotals, type ItineraryState } from '@/services/itinerary';
import { formatPhp } from '@/services/money';
import type { PricedNearbyPlace } from '@/services/places';
import { stageProgressOffset } from '@/services/stage-progress';

export function StageProgress({ state, stageIndex }: { state: ItineraryState; stageIndex: number }) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null); const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => { if (viewportWidth > 0) scrollRef.current?.scrollTo({ x: stageProgressOffset(stageIndex, state.stages.length, viewportWidth), animated: true }); }, [stageIndex, state.stages.length, viewportWidth]);
  return <ScrollView ref={scrollRef} horizontal onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progress}>{state.stages.map((stage, index) => {
    const completed = state.stops.some((stop) => stop.stageId === stage.id) && index !== stageIndex;
    const current = index === stageIndex;
    return <View key={stage.id} style={styles.progressItem}><View style={[styles.stageDot, { backgroundColor: current || completed ? theme.accent : theme.elevatedSurface, borderColor: current || completed ? theme.accentStrong : theme.border }]}><ThemedText style={[styles.stageNumber, { color: theme.text }]}>{completed ? '✓' : index + 1}</ThemedText></View><ThemedText numberOfLines={1} style={[styles.stageLabel, { color: current ? theme.text : theme.textSecondary }]}>{stage.title}</ThemedText>{stage.source === 'wise' && !stage.required ? <ThemedText numberOfLines={1} style={[styles.stageOptional, { color: theme.textSecondary }]}>Wise suggestion · optional</ThemedText> : null}{index < state.stages.length - 1 ? <View style={[styles.stageLine, { backgroundColor: completed ? theme.accentStrong : theme.border }]} /> : null}</View>;
  })}</ScrollView>;
}

export function BudgetSummaryCard({ state }: { state: ItineraryState }) {
  const theme = useTheme();
  const totals = selectedTotals(state.stops);
  const { minAmountMinor: selectedSpendMinMinor, maxAmountMinor: selectedSpendMaxMinor, uncertain: hasUnknown } = totals;
  const knownSpend = totals.knownStopCount === 0 ? 'Not available yet' : selectedSpendMinMinor === selectedSpendMaxMinor ? formatPhp(selectedSpendMinMinor) : `${formatPhp(selectedSpendMinMinor)}–${formatPhp(selectedSpendMaxMinor)}`;
  const unavailableCopy = totals.knownStopCount === 0 ? 'No selected stops have reliable pricing yet.' : `${totals.unknownStopCount} ${totals.unknownStopCount === 1 ? 'stop has' : 'stops have'} price unavailable.`;
  return <ClaySurface elevation="raised" style={[styles.budget, { backgroundColor: theme.accentSoft, borderColor: theme.accentStrong }]}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>YOUR BUDGET</ThemedText><View style={styles.budgetGrid}><BudgetValue label="Budget:" value={formatPhp(state.budgetMinor)} /><BudgetValue label="Selected:" value={state.stops.length ? hasUnknown ? 'Partially known' : knownSpend : 'Nothing yet'} /><BudgetValue label="Remaining:" value={hasUnknown ? 'Partially known' : selectedSpendMinMinor === selectedSpendMaxMinor ? formatPhp(Math.max(0, state.budgetMinor - selectedSpendMaxMinor)) : `${formatPhp(Math.max(0, state.budgetMinor - selectedSpendMaxMinor))}–${formatPhp(Math.max(0, state.budgetMinor - selectedSpendMinMinor))}`} /></View>{hasUnknown ? <View style={styles.budgetCopy}><ThemedText type="small" themeColor="textSecondary">Budget status: Partially known</ThemedText><ThemedText type="small" themeColor="textSecondary">Known spend: {knownSpend}</ThemedText><ThemedText type="small" themeColor="textSecondary">{unavailableCopy}</ThemedText></View> : null}</ClaySurface>;
}

function BudgetValue({ label, value }: { label: string; value: string }) { return <View style={styles.budgetValue}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText><ThemedText style={Typography.cardTitle} numberOfLines={1}>{value}</ThemedText></View>; }

export function ItineraryStopCard({ place, number, distanceLabel, onNavigate, onRemove }: { place: PricedNearbyPlace; number: number; distanceLabel?: string | null; onNavigate?: () => void; onRemove?: () => void }) {
  const theme = useTheme(); return <ClaySurface style={styles.stop}><View style={styles.stopHeader}><View style={[styles.stopNumber, { backgroundColor: theme.accent }]}><ThemedText style={[Typography.badge, { color: theme.accentText }]}>{number}</ThemedText></View><View style={styles.stopCopy}><ThemedText style={Typography.cardTitle}>{place.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{place.category_name}</ThemedText>{distanceLabel ? <ThemedText type="small" themeColor="textSecondary">{distanceLabel}</ThemedText> : null}</View></View><PriceSummary place={place} />{onNavigate || onRemove ? <View style={styles.stopActions}>{onNavigate ? <SecondaryButton label="Navigate" onPress={onNavigate} style={styles.compactButton} /> : null}{onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${place.name}`} onPress={onRemove} style={styles.remove}><Ionicons name="trash-outline" size={18} color={theme.error} /></Pressable> : null}</View> : null}</ClaySurface>;
}

const styles = StyleSheet.create({ progress: { flexDirection: 'row', gap: Spacing.xs, paddingHorizontal: Spacing.xs }, progressItem: { alignItems: 'center', flexGrow: 0, gap: 5, minWidth: 104, position: 'relative', width: 104 }, stageDot: { alignItems: 'center', borderRadius: Radius.chip, borderWidth: 1, height: 30, justifyContent: 'center', width: 30, zIndex: 1 }, stageNumber: { fontSize: 12, fontWeight: '800' }, stageLabel: { fontSize: 11, fontWeight: '700', maxWidth: 100, textAlign: 'center' }, stageOptional: { fontSize: 9, maxWidth: 100, textAlign: 'center' }, stageLine: { height: 2, left: '55%', position: 'absolute', top: 14, width: '90%' }, budget: { gap: Spacing.sm }, eyebrow: { fontSize: 11, letterSpacing: 1 }, budgetGrid: { flexDirection: 'row', gap: Spacing.sm }, budgetValue: { flex: 1, gap: 2 }, budgetCopy: { gap: 2 }, stop: { gap: Spacing.sm }, stopHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm }, stopNumber: { alignItems: 'center', borderRadius: 14, height: 34, justifyContent: 'center', width: 34 }, stopCopy: { flex: 1, gap: 1 }, stopActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm }, compactButton: { flex: 1, minHeight: 42 }, remove: { alignItems: 'center', borderRadius: Radius.chip, height: 42, justifyContent: 'center', width: 42 } });
