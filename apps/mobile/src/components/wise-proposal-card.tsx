import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { PriceSummary } from '@/components/discovery/price-summary';
import { PlaceVisual } from '@/components/discovery/place-visual';
import { ItineraryMap } from '@/components/itinerary/itinerary-map';
import { StartOverAction } from '@/components/itinerary/start-over-action';
import { ThemedText } from '@/components/themed-text';
import { ClayCard, MetadataBadge, PrimaryButton, ScreenSection, SecondaryButton, SectionHeader, TertiaryButton } from '@/components/ui/clay';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { foodFocusLabel } from '@/services/food-candidate-diversity';
import type { FoodFocus } from '@/services/ask-wise-normalization';
import { remainingBudget } from '@/services/itinerary';
import { formatMinorUnits, formatPhp } from '@/services/money';
import { sequentialStopDistances } from '@/services/planning-distance';
import type { PlanProposal } from '@/services/wise-proposal';

export function WiseProposalCard({ proposal, requestText, onUse, onCustomize, onTryAnother, onStartOver, busy }: { proposal: PlanProposal; requestText: string | null; onUse: () => void; onCustomize: () => void; onTryAnother: () => void; onStartOver: () => void; busy: boolean }) {
  const theme = useDesignTheme();
  const totals = remainingBudget(proposal.state);
  const stops = proposal.state.stops;
  const distances = sequentialStopDistances(proposal.state);
  const guidedCurrencyCode = 'source' in proposal ? proposal.state.currencyCode ?? proposal.intent.budget.currencyCode : undefined;
  const explicitFoodNoMatch = 'explicitFoodNoMatch' in proposal ? proposal.explicitFoodNoMatch as FoodFocus : null;
  const guidedWarnings = 'source' in proposal ? proposal.warnings : [];
  const unknownPriceWarning = guidedWarnings.some((warning) => warning.code === 'unknown_price' || warning.code === 'currency_mismatch' || warning.code === 'budget_unverified');
  const mobilityWarning = guidedWarnings.some((warning) => warning.code === 'mobility_expanded');
  const unappliedPreferences = 'source' in proposal ? proposal.unappliedPreferences : [];
  const partial = 'source' in proposal && proposal.outcome === 'partial_plan';

  return <View style={styles.wrap}>
    <View style={styles.requestContext}>
      <View style={[styles.requestIcon, { backgroundColor: theme.accent.primarySoft }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.text.primary} accessible={false} />
      </View>
      <View style={styles.requestCopy}>
        <ThemedText style={Typography.caption} themeColor="muted">YOUR REQUEST</ThemedText>
        <ThemedText style={Typography.bodySecondary}>{requestText || ('source' in proposal ? 'Your guided planner choices' : 'Your planning request')}</ThemedText>
      </View>
    </View>

    <ThemedText type="small" themeColor="textSecondary">Based on your selected preferences and available ExploreWise catalog data.</ThemedText>

    <Budget proposal={proposal} totals={totals} />

    <ScreenSection>
      <SectionHeader title="Plan overview" description="Your proposed stops in sequence." />
      <ClayCard variant="subtle" padding="none" style={styles.map}>
        <ItineraryMap compact start={proposal.state.start} candidates={[]} selected={stops.map((stop) => stop.place)} highlightedId={null} onPressCandidate={() => {}} />
      </ClayCard>
    </ScreenSection>

    <ScreenSection>
      <SectionHeader title="Proposed stops" description={`${stops.length} ${stops.length === 1 ? 'place' : 'places'} selected`} />
      <View style={styles.stops}>
        {stops.map((stop, index) => {
          const stage = proposal.state.stages.find((item) => item.id === stop.stageId)!;
          const distance = distances[index]?.label;
          return <View key={stop.stageId} style={styles.sequence}>
            <View style={styles.rail}><View style={[styles.number, { backgroundColor: theme.accent.primary }]}><ThemedText style={[Typography.badge, { color: theme.accent.onPrimary }]}>{index + 1}</ThemedText></View><View style={[styles.thread, { backgroundColor: theme.border.subtle }]} /></View>
            <View style={[styles.stage, { backgroundColor: theme.background.surface, borderColor: theme.border.subtle }]}>
            <View style={styles.stageHeader}>
              <View style={styles.stageCopy}>
                <ThemedText style={Typography.caption} themeColor="muted">{stage.title.toUpperCase()}</ThemedText>
                <ThemedText style={Typography.cardTitle}>{stop.place.name}</ThemedText>
                {distance ? <ThemedText style={Typography.metadata} themeColor="textSecondary">{distance}</ThemedText> : null}
              </View>
              <PlaceVisual place={stop.place} placeId={stop.place.place_id} thumbnail />
            </View>
            <PriceSummary place={stop.place} currencyCode={guidedCurrencyCode} compact />
            <ThemedText style={Typography.caption} themeColor="muted">{stage.source === 'user_added' ? 'Added stop' : stage.required ? 'Core stop' : 'Wise suggestion · optional'}</ThemedText>
            {stage.source === 'wise' && !stage.required ? <MetadataBadge label="Wise suggestion · optional" /> : null}
            </View>
          </View>;
        })}
      </View>
    </ScreenSection>

    {explicitFoodNoMatch ? <ClayCard variant="subtle" style={styles.note}><ThemedText style={Typography.label}>No strong {foodFocusLabel(explicitFoodNoMatch)} match nearby</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Customize to review broader food alternatives without presenting them as matches.</ThemedText></ClayCard> : partial || proposal.missingStageIds.length ? <ClayCard variant="subtle" style={styles.note}><ThemedText style={Typography.label}>{partial ? 'We found part of your outing' : 'Some requested stops are still open'}</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Wise found {stops.length === 1 ? 'one suitable stop' : `${stops.length} suitable stops`}. Customize the plan or try another idea.</ThemedText></ClayCard> : null}
    {unknownPriceWarning ? <ClayCard variant="subtle" style={styles.note}><ThemedText style={Typography.label}>Some prices are unverified</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">The plan does not treat unknown or differently denominated prices as free.</ThemedText></ClayCard> : null}
    {mobilityWarning ? <ClayCard variant="subtle" style={styles.note}><ThemedText style={Typography.label}>Some stops are a little farther apart</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Wise kept every stop inside your planning area. No travel time is estimated here.</ThemedText></ClayCard> : null}
    {unappliedPreferences.length ? <ClayCard variant="subtle" style={styles.note}><ThemedText style={Typography.label}>Some preferences could not be applied</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">The places above are grounded in available catalog evidence; unapplied preferences were not used as ranking claims.</ThemedText></ClayCard> : null}

    <View style={styles.actions}>
      <PrimaryButton disabled={busy || stops.length === 0} label={busy ? 'Working…' : 'Build this plan'} accessibilityLabel="Build this plan" labelNumberOfLines={1} onPress={onUse} fullWidth />
      <SecondaryButton disabled={busy} label="Customize stops" accessibilityLabel="Customize stops" labelNumberOfLines={1} onPress={onCustomize} fullWidth />
      <TertiaryButton disabled={busy} label="Try another idea" accessibilityLabel="Try another idea" labelNumberOfLines={1} onPress={onTryAnother} fullWidth />
      <StartOverAction onPress={onStartOver} />
    </View>
  </View>;
}

function Budget({ proposal, totals }: { proposal: PlanProposal; totals: ReturnType<typeof remainingBudget> }) {
  const theme = useDesignTheme();
  const guided = 'source' in proposal;
  const currencyCode = proposal.state.currencyCode ?? (guided ? proposal.intent.budget.currencyCode : 'PHP');
  const formatMoney = (minor: number) => guided ? formatMinorUnits(minor, currencyCode) : formatPhp(minor);
  const serverBudget = guided ? proposal.budgetSummary : null;
  const knownMinMinor = serverBudget?.knownMinMinor ?? totals.minAmountMinor;
  const knownMaxMinor = serverBudget?.knownMaxMinor ?? totals.maxAmountMinor;
  const knownStopCount = serverBudget?.knownStopCount ?? totals.knownStopCount;
  const unknownStopCount = serverBudget?.unknownStopCount ?? totals.unknownStopCount;
  const uncertain = serverBudget ? serverBudget.affordability === 'unverified' || serverBudget.unknownStopCount > 0 || serverBudget.currencyMismatchStopCount > 0 : totals.uncertain;
  const budgetMinor = serverBudget?.normalizedTotalMinor ?? proposal.state.budgetMinor;
  const knownSpend = knownStopCount === 0
    ? 'Not available yet'
    : knownMinMinor === knownMaxMinor
      ? formatMoney(knownMinMinor)
      : `${formatMoney(knownMinMinor)}–${formatMoney(knownMaxMinor)}`;
  const remaining = uncertain
    ? 'Partially known'
    : knownMinMinor === knownMaxMinor
      ? formatMoney(Math.max(0, budgetMinor - knownMaxMinor))
      : `${formatMoney(Math.max(0, budgetMinor - knownMaxMinor))}–${formatMoney(Math.max(0, budgetMinor - knownMinMinor))}`;
  return <ClayCard variant="default" style={[styles.budget, { backgroundColor: theme.accent.primarySoft, borderColor: theme.border.subtle }]}>
    <View style={styles.budgetHeading}>
      <View style={[styles.budgetIcon, { backgroundColor: theme.accent.primarySoft }]}><Ionicons name="wallet-outline" size={18} color={theme.text.primary} accessible={false} /></View>
      <View style={styles.requestCopy}>
        <ThemedText style={Typography.caption} themeColor="muted">BUDGET SUMMARY</ThemedText>
        <ThemedText style={Typography.label}>{uncertain ? 'Available prices are partially known' : 'Available prices are fully known'}</ThemedText>
      </View>
    </View>
    <View style={[styles.budgetGrid, { borderTopColor: theme.border.subtle }]}>
      <BudgetMetric label="Planned budget" value={formatMoney(proposal.state.budgetMinor)} />
      <BudgetMetric label={uncertain ? 'Known estimates' : 'Plan estimate'} value={knownSpend} />
    </View>
    <View style={styles.budgetRemainder}><ThemedText style={Typography.caption} themeColor="muted">Remaining</ThemedText><ThemedText style={Typography.label}>{remaining}</ThemedText></View>
    {uncertain ? <ThemedText style={Typography.caption} themeColor="muted">{knownStopCount === 0 ? 'No proposed stops have reliable pricing yet.' : `${unknownStopCount} ${unknownStopCount === 1 ? 'stop has' : 'stops have'} price unavailable.`}</ThemedText> : null}
  </ClayCard>;
}

function BudgetMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><ThemedText style={Typography.caption} themeColor="muted">{label}</ThemedText><ThemedText style={Typography.cardTitle}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  requestContext: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm },
  requestIcon: { alignItems: 'center', borderRadius: Radius.pill, height: 36, justifyContent: 'center', width: 36 },
  requestCopy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  intro: { gap: Spacing.sm },
  budget: { gap: Spacing.mdCompact },
  budgetRemainder: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm },
  budgetHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  budgetIcon: { alignItems: 'center', borderRadius: Radius.small, height: 38, justifyContent: 'center', width: 38 },
  budgetGrid: { borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.mdCompact, paddingTop: Spacing.mdCompact },
  metric: { flexBasis: 96, flexGrow: 1, gap: Spacing.xs, minWidth: 0 },
  map: { overflow: 'hidden' },
  stops: { gap: Spacing.lg },
  sequence: { flexDirection: 'row', gap: Spacing.mdCompact },
  rail: { alignItems: 'center', width: 28 },
  thread: { width: 1, flex: 1, marginTop: Spacing.sm },
  stage: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: Radius.row, padding: Spacing.md, gap: Spacing.sm },
  stageHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm },
  stageCopy: { flex: 1, gap: Spacing.xs, minWidth: 0 },
  number: { alignItems: 'center', borderRadius: Radius.pill, height: 28, justifyContent: 'center', width: 28 },
  note: { gap: Spacing.xs },
  actions: { gap: Spacing.sm },
});
