import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PriceSummary } from '@/components/discovery/price-summary';
import { PlaceVisual } from '@/components/discovery/place-visual';
import { ThemedText } from '@/components/themed-text';
import { ClayCard, ClaySurface, PrimaryButton } from '@/components/ui/clay';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selectedTotals, type ItineraryState } from '@/services/itinerary';
import { formatPhp } from '@/services/money';
import type { PricedNearbyPlace } from '@/services/places';
import { stageProgressOffset } from '@/services/stage-progress';
import { CurrentStopActions, stopStatusPresentation } from '@/components/itinerary/itinerary-progress';
import type { StopStatus } from '@/services/itinerary-execution';

export function StageProgress({ state, stageIndex }: { state: ItineraryState; stageIndex: number }) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null); const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => { if (viewportWidth > 0) scrollRef.current?.scrollTo({ x: stageProgressOffset(stageIndex, state.stages.length, viewportWidth), animated: true }); }, [stageIndex, state.stages.length, viewportWidth]);
  return <ScrollView ref={scrollRef} horizontal onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progress}>{state.stages.map((stage, index) => {
    const completed = state.stops.some((stop) => stop.stageId === stage.id) && index !== stageIndex;
    const current = index === stageIndex;
    return <View key={stage.id} style={styles.progressItem}><View style={[styles.stageDot, { backgroundColor: current || completed ? theme.accent : theme.elevatedSurface, borderColor: current || completed ? theme.accentStrong : theme.border }]}><ThemedText style={[styles.stageNumber, { color: current || completed ? theme.accentText : theme.text }]}>{completed ? '✓' : index + 1}</ThemedText></View><ThemedText numberOfLines={1} style={[styles.stageLabel, { color: current ? theme.text : theme.textSecondary }]}>{stage.title}</ThemedText>{stage.source === 'wise' && !stage.required ? <ThemedText numberOfLines={1} style={[styles.stageOptional, { color: theme.textSecondary }]}>Wise suggestion · optional</ThemedText> : null}{index < state.stages.length - 1 ? <View style={[styles.stageLine, { backgroundColor: completed ? theme.accentStrong : theme.border }]} /> : null}</View>;
  })}</ScrollView>;
}

export function BudgetSummaryCard({ state, compact = false, planned = false }: { state: ItineraryState; compact?: boolean; planned?: boolean }) {
  const theme = useTheme();
  const totals = selectedTotals(state.stops);
  const { minAmountMinor: selectedSpendMinMinor, maxAmountMinor: selectedSpendMaxMinor, uncertain: hasUnknown } = totals;
  const knownSpend = totals.knownStopCount === 0 ? 'Not available yet' : selectedSpendMinMinor === selectedSpendMaxMinor ? formatPhp(selectedSpendMinMinor) : `${formatPhp(selectedSpendMinMinor)}–${formatPhp(selectedSpendMaxMinor)}`;
  const unavailableCopy = totals.knownStopCount === 0 ? 'No selected stops have reliable pricing yet.' : `${totals.unknownStopCount} ${totals.unknownStopCount === 1 ? 'stop has' : 'stops have'} price unavailable.`;
  if (planned) return <ClayCard testID="itinerary-planned-summary" style={styles.plannedSummary}>
    <View style={styles.plannedIdentity}>
    <View style={styles.plannedContext}>
      <Ionicons accessible={false} name="people-outline" size={20} color={theme.muted} />
      <ThemedText style={[Typography.label, styles.wrappingCopy]}>{state.partySize} {state.partySize === 1 ? 'person' : 'people'}</ThemedText>
    </View>
    <View style={styles.plannedContext}>
      <Ionicons accessible={false} name="location-outline" size={20} color={theme.muted} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.wrappingCopy}>Starting from {state.start.label}</ThemedText>
    </View>
    </View>
    <View style={[styles.plannedBudget, { borderTopColor: theme.border }]}>
      <View style={styles.plannedMetric}>
        <ThemedText style={Typography.metadata} themeColor="muted">{hasUnknown ? 'Known price estimates' : 'Selected price estimates'}</ThemedText>
        <ThemedText style={Typography.sectionTitle}>{knownSpend}</ThemedText>
        <ThemedText style={Typography.caption} themeColor="muted">For {state.partySize === 1 ? '1 person' : `all ${state.partySize} people`}</ThemedText>
      </View>
      <View style={styles.plannedMetric}>
        <ThemedText style={Typography.metadata} themeColor="muted">Planned budget</ThemedText>
        <ThemedText style={Typography.cardTitle}>{formatPhp(state.budgetMinor)}</ThemedText>
      </View>
    </View>
    {hasUnknown ? <ThemedText type="small" themeColor="textSecondary">{unavailableCopy} Budget is partially known.</ThemedText> : null}
  </ClayCard>;
  if (compact) return <View style={[styles.planDetails, { borderTopColor: theme.border }]}>
    <ThemedText style={Typography.cardTitle} accessibilityRole="header">Plan details</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">{state.partySize} {state.partySize === 1 ? 'person' : 'people'} · Starting from {state.start.label}</ThemedText>
    <View style={styles.detailLine}><ThemedText type="small" themeColor="textSecondary">Planned budget</ThemedText><ThemedText style={Typography.label}>{formatPhp(state.budgetMinor)}</ThemedText></View>
    <View style={styles.detailLine}><ThemedText type="small" themeColor="textSecondary">{hasUnknown ? 'Known price estimates' : 'Selected price estimates'}</ThemedText><ThemedText style={Typography.label}>{knownSpend}</ThemedText></View>
    {hasUnknown ? <ThemedText type="small" themeColor="textSecondary">{unavailableCopy} Budget is partially known.</ThemedText> : null}
  </View>;
  return <ClaySurface elevation="raised" style={[styles.budget, { backgroundColor: theme.accentSoft, borderColor: theme.accentStrong }]}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>YOUR BUDGET</ThemedText><View style={styles.budgetGrid}><BudgetValue label="Budget:" value={formatPhp(state.budgetMinor)} /><BudgetValue label="Selected:" value={state.stops.length ? hasUnknown ? 'Partially known' : knownSpend : 'Nothing yet'} /><BudgetValue label="Remaining:" value={hasUnknown ? 'Partially known' : selectedSpendMinMinor === selectedSpendMaxMinor ? formatPhp(Math.max(0, state.budgetMinor - selectedSpendMaxMinor)) : `${formatPhp(Math.max(0, state.budgetMinor - selectedSpendMaxMinor))}–${formatPhp(Math.max(0, state.budgetMinor - selectedSpendMinMinor))}`} /></View>{hasUnknown ? <View style={styles.budgetCopy}><ThemedText type="small" themeColor="textSecondary">Budget status: Partially known</ThemedText><ThemedText type="small" themeColor="textSecondary">Known spend: {knownSpend}</ThemedText><ThemedText type="small" themeColor="textSecondary">{unavailableCopy}</ThemedText></View> : null}</ClaySurface>;
}

function BudgetValue({ label, value }: { label: string; value: string }) { return <View style={styles.budgetValue}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText><ThemedText style={Typography.cardTitle}>{value}</ThemedText></View>; }

export function CustomizeCandidateCard({ place, distanceLabel, highlighted, selected, onHighlight, onSelect }: { place: PricedNearbyPlace; distanceLabel?: string | null; highlighted: boolean; selected: boolean; onHighlight: () => void; onSelect: () => void }) {
  const theme = useTheme();
  return <ClayCard variant={highlighted ? 'raised' : 'subtle'} padding="none" style={[styles.customizeCandidate, selected ? { borderColor: theme.accent, borderWidth: 2 } : null]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Candidate ${place.name}${selected ? ', currently selected' : ''}`} accessibilityState={{ selected }} onPress={onHighlight} style={styles.customizeVisual}>
      <PlaceVisual place={place} placeId={place.place_id} thumbnail />
    </Pressable>
    <View style={styles.customizeCandidateContent}>
      <View style={styles.customizeCandidateHeading}>
        <View style={styles.customizeCandidateCopy}>
          {selected ? <ThemedText style={[Typography.eyebrow, { color: theme.accentStrong }]}>CURRENT SELECTION</ThemedText> : null}
          <ThemedText style={Typography.cardTitle}>{place.name}</ThemedText>
          {place.category_name || place.category_code ? <ThemedText style={Typography.metadata} themeColor="textSecondary">{place.category_name ?? place.category_code}</ThemedText> : null}
        </View>
      </View>
      {distanceLabel ? <View style={styles.customizeDistance}><Ionicons accessible={false} name="navigate-outline" size={15} color={theme.textSecondary} /><ThemedText style={Typography.metadata} themeColor="textSecondary">{distanceLabel}</ThemedText></View> : null}
      <PriceSummary place={place} compact />
      <View style={styles.candidateSelect}><PrimaryButton label={selected ? 'Selected' : 'Select'} accessibilityLabel={`Select ${place.name} for this stop`} disabled={selected} onPress={onSelect} style={styles.selectButton} /></View>
    </View>
  </ClayCard>;
}

export function ItineraryStopCard({ place, number, distanceLabel, onNavigate, onRemove, status, onComplete, onSkip, connectToNext = false, planned = false }: { place: PricedNearbyPlace; number: number; distanceLabel?: string | null; onNavigate?: () => void; onRemove?: () => void; status?: StopStatus; onComplete?: () => void; onSkip?: () => void; connectToNext?: boolean; planned?: boolean }) {
  const theme = useTheme();
  if (planned && status === 'upcoming') return <PlannedStop place={place} number={number} distanceLabel={distanceLabel} connectToNext={connectToNext} />;
  if (status) return <ExecutionStop place={place} number={number} distanceLabel={distanceLabel} status={status} onNavigate={onNavigate} onComplete={onComplete} onSkip={onSkip} connectToNext={connectToNext} />;
  return <ClaySurface style={styles.stop}>
    <View style={styles.stopHeader}>
      <View style={[styles.stopNumber, { backgroundColor: theme.accent }]}><ThemedText style={[Typography.badge, { color: theme.accentText }]}>{number}</ThemedText></View>
      <View style={styles.stopCopy}><ThemedText style={Typography.cardTitle}>{place.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{place.category_name}</ThemedText>{distanceLabel ? <ThemedText type="small" themeColor="textSecondary">{distanceLabel}</ThemedText> : null}</View>
    </View>
    <PriceSummary place={place} />
    {onRemove ? <View style={styles.stopActions}><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${place.name}`} onPress={onRemove} style={styles.remove}><Ionicons name="trash-outline" size={18} color={theme.error} /></Pressable></View> : null}
  </ClaySurface>;
}

/** Pre-start sequence keeps factual prices beside the identity and the index on a separate rail. */
function PlannedStop({ place, number, distanceLabel, connectToNext }: {
  place: PricedNearbyPlace; number: number; distanceLabel?: string | null; connectToNext: boolean;
}) {
  const theme = useTheme();
  return <View testID="itinerary-stop-upcoming" style={styles.plannedRow}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.plannedRail}>
      <View style={[styles.plannedNumber, { backgroundColor: theme.elevatedSurface, borderColor: theme.border }]}>
        <ThemedText style={Typography.badge} themeColor="muted">{number}</ThemedText>
      </View>
      {connectToNext ? <View style={[styles.connector, { backgroundColor: theme.border }]} /> : null}
    </View>
    <View style={styles.plannedStopContent}>
      {distanceLabel ? <ThemedText style={Typography.caption} themeColor="muted">{distanceLabel}</ThemedText> : null}
      <View style={[styles.plannedStopCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.plannedStopHeading}>
          <PlaceVisual place={place} placeId={place.place_id} thumbnail />
          <View style={styles.plannedStopCopy}>
            <ThemedText accessibilityRole="header" accessibilityLabel={`Stop ${number}, ${place.name}, upcoming`} style={Typography.cardTitle}>{place.name}</ThemedText>
            {place.category_name ? <ThemedText style={Typography.metadata} themeColor="muted">{place.category_name}</ThemedText> : null}
            {place.has_price && place.pricing_status !== 'free' ? <ThemedText style={Typography.caption} themeColor="muted">Group estimate</ThemedText> : null}
            <PriceSummary place={place} compact />
          </View>
        </View>
      </View>
    </View>
  </View>;
}

/** Presentation of the existing execution status; no local progress or action state. */
function ExecutionStop({ place, number, distanceLabel, status, onNavigate, onComplete, onSkip, connectToNext }: {
  place: PricedNearbyPlace; number: number; distanceLabel?: string | null; status: StopStatus;
  onNavigate?: () => void; onComplete?: () => void; onSkip?: () => void; connectToNext: boolean;
}) {
  const theme = useTheme();
  const current = status === 'current';
  const finished = status === 'completed' || status === 'skipped';
  const presentation = stopStatusPresentation[status];
  const statusColor = status === 'completed' ? theme.success : status === 'skipped' ? theme.textSecondary : current ? theme.accent : theme.textSecondary;
  const copy = <View style={styles.executionCopy}>
    <View accessible accessibilityRole={current ? 'header' : undefined} accessibilityLabel={`Stop ${number}, ${place.name}, ${presentation.label.toLowerCase()}`} style={styles.executionCopy}>
      {!current ? <View style={styles.executionStatus}>
                <ThemedText style={[Typography.metadata, styles.statusLabel, { color: statusColor }]}>Stop {number} · {presentation.label}</ThemedText>
      </View> : null}
      <ThemedText style={[current ? Typography.sectionTitle : styles.stopTitle, { color: status === 'skipped' ? theme.textSecondary : theme.text }]}>{place.name}</ThemedText>
    </View>
    {!finished && place.category_name ? <ThemedText type="small" themeColor="textSecondary">{place.category_name}</ThemedText> : null}
    {distanceLabel ? <ThemedText style={Typography.metadata} themeColor="textSecondary">{distanceLabel}</ThemedText> : null}
    {!finished ? <PriceSummary place={place} compact /> : null}
  </View>;
  if (current) return <ClayCard variant="hero" padding="default" testID="itinerary-current-stop" style={[styles.currentStop, { borderColor: theme.accent }]}>
    <View style={[styles.currentBadge, { backgroundColor: theme.accent }]}>
      <Ionicons accessible={false} name="navigate" size={14} color={theme.accentText} />
      <ThemedText style={[Typography.badge, { color: theme.accentText }]}>CURRENT STOP · {number}</ThemedText>
    </View>
    <View style={styles.currentIdentity}>
      <PlaceVisual place={place} placeId={place.place_id} tile />
      <View style={styles.currentCopy}>{copy}</View>
    </View>
    {status === 'current' && onComplete && onSkip ? <CurrentStopActions placeName={place.name} onComplete={onComplete} onSkip={onSkip} onNavigate={onNavigate} /> : null}
  </ClayCard>;
  return <View testID={`itinerary-stop-${status}`} style={styles.executionRow}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.rail}>
      <Ionicons accessible={false} name={presentation.icon} size={22} color={statusColor} />
      {connectToNext ? <View style={[styles.connector, { backgroundColor: theme.border }]} /> : null}
    </View>
    <View style={[styles.rowContent, status === 'upcoming' ? styles.upcomingContent : styles.terminalContent, status === 'skipped' ? { borderColor: theme.border } : null]}>
      <PlaceVisual place={place} placeId={place.place_id} thumbnail />
      <View style={styles.rowCopy}>{copy}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  plannedIdentity: { gap: Spacing.xs },
  currentBadge: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: Spacing.mdCompact, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  candidateSelect: { alignItems: 'flex-end' },
  selectButton: { minHeight: 44, paddingVertical: Spacing.sm },
  plannedSummary: { gap: Spacing.mdCompact },
  plannedContext: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  wrappingCopy: { flex: 1, minWidth: 0 },
  plannedBudget: { borderTopWidth: 1, paddingTop: Spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  plannedMetric: { flexGrow: 1, flexShrink: 1, flexBasis: 128, gap: Spacing.xs },
  plannedRow: { flexDirection: 'row', gap: Spacing.sm },
  plannedRail: { width: 28, alignItems: 'center' },
  plannedNumber: { minHeight: 28, width: 28, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  plannedStopContent: { flex: 1, minWidth: 0, gap: Spacing.sm, paddingBottom: Spacing.md },
  plannedStopCard: { borderWidth: 1, borderRadius: Radius.row, padding: Spacing.mdCompact, gap: Spacing.sm },
  plannedStopHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  plannedStopCopy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  customizeCandidate: { borderRadius: Radius.row, flexDirection: 'row', padding: Spacing.mdCompact, gap: Spacing.mdCompact },
  customizeVisual: { alignSelf: 'flex-start' },
  customizeCandidateContent: { flex: 1, minWidth: 0, gap: Spacing.xs },
  customizeCandidateHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm },
  customizeCandidateCopy: { flex: 1, gap: Spacing.xs, minWidth: 0 },
  customizeDistance: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs },
  planDetails: { gap: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.md },
  detailLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: Spacing.md, rowGap: Spacing.xs },
  currentStop: { gap: Spacing.md, borderWidth: 1, padding: Spacing.lg },
  currentIdentity: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.mdCompact },
  currentCopy: { flex: 1, minWidth: 0 },
  executionRow: { flexDirection: 'row', gap: Spacing.sm },
  executionCopy: { gap: Spacing.xs, minWidth: 0 },
  executionStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  statusLabel: { flexShrink: 1 },
  stopTitle: { ...Typography.body, fontWeight: Typography.label.fontWeight },
  rowContent: { flex: 1, minWidth: 0 },
  rowCopy: { flex: 1, minWidth: 0 },
  upcomingContent: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.md },
  terminalContent: { flexDirection: 'row', gap: Spacing.sm, borderBottomWidth: 0, paddingBottom: Spacing.md },
  rail: { width: 24, alignItems: 'center', paddingTop: Spacing.xs },
  connector: { width: 1, flex: 1, marginTop: Spacing.xs },
  progress: { flexDirection: 'row', gap: Spacing.xs, paddingHorizontal: Spacing.xs }, progressItem: { alignItems: 'center', flexGrow: 0, gap: 5, minWidth: 104, position: 'relative', width: 104 }, stageDot: { alignItems: 'center', borderRadius: Radius.chip, borderWidth: 1, height: 30, justifyContent: 'center', width: 30, zIndex: 1 }, stageNumber: { fontSize: 12, fontWeight: '800' }, stageLabel: { fontSize: 11, fontWeight: '700', maxWidth: 100, textAlign: 'center' }, stageOptional: { fontSize: 9, maxWidth: 100, textAlign: 'center' }, stageLine: { height: 2, left: '55%', position: 'absolute', top: 14, width: '90%' }, budget: { gap: Spacing.sm }, eyebrow: { fontSize: 11, letterSpacing: 1 }, budgetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, budgetValue: { flexGrow: 1, flexBasis: 100, gap: 2 }, budgetCopy: { gap: 2 }, stop: { gap: Spacing.sm }, stopHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm }, stopNumber: { alignItems: 'center', borderRadius: 14, height: 34, justifyContent: 'center', width: 34 }, stopCopy: { flex: 1, gap: 1 }, stopActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm }, compactButton: { flex: 1, minHeight: 42 }, remove: { alignItems: 'center', borderRadius: Radius.chip, height: 42, justifyContent: 'center', width: 42 } });
