import { StyleSheet, View } from 'react-native';

import { PriceSummary } from '@/components/discovery/price-summary';
import { ItineraryMap } from '@/components/itinerary/itinerary-map';
import { StartOverAction } from '@/components/itinerary/start-over-action';
import { ThemedText } from '@/components/themed-text';
import { ClaySurface, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { Spacing, Typography } from '@/constants/theme';
import { remainingBudget } from '@/services/itinerary';
import { formatPhp } from '@/services/money';
import { proposalRationale, type WiseProposal } from '@/services/wise-proposal';
import { foodFocusLabel } from '@/services/food-candidate-diversity';
import { sequentialStopDistances } from '@/services/planning-distance';

export function WiseProposalCard({ proposal, requestText, onUse, onCustomize, onTryAnother, onStartOver, busy }: { proposal: WiseProposal; requestText: string | null; onUse: () => void; onCustomize: () => void; onTryAnother: () => void; onStartOver: () => void; busy: boolean }) {
  const totals = remainingBudget(proposal.state); const stops = proposal.state.stops; const distances = sequentialStopDistances(proposal.state);
  return <View style={styles.wrap}>
    <ClaySurface elevation="raised" style={styles.userBubble}><ThemedText type="smallBold">You</ThemedText><ThemedText type="small">{requestText || 'Your planning request'}</ThemedText></ClaySurface>
    <ClaySurface elevation="raised" style={styles.response}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>WISE</ThemedText>
      <ThemedText style={Typography.cardTitle}>{proposal.missingStageIds.length ? 'Here’s what I found for your plan' : 'Here’s a plan for you'}</ThemedText>
      {stops.map((stop, index) => { const stage = proposal.state.stages.find((item) => item.id === stop.stageId)!; const distance = distances[index]?.label; return <ClaySurface key={stop.stageId} elevation="subtle" style={styles.stage}><View style={styles.stageHeader}><View style={styles.number}><ThemedText type="smallBold">{index + 1}</ThemedText></View><View style={styles.stageCopy}><ThemedText type="smallBold">{stage.title}</ThemedText>{stage.source === 'wise' && !stage.required ? <ThemedText type="small" themeColor="textSecondary">Wise suggestion · optional</ThemedText> : null}<ThemedText style={Typography.cardTitle}>{stop.place.name}</ThemedText>{distance ? <ThemedText type="small" themeColor="textSecondary">{distance}</ThemedText> : null}</View></View><PriceSummary place={stop.place} /><ThemedText type="small" themeColor="textSecondary">{proposalRationale(stage, index)}</ThemedText></ClaySurface>; })}
      {proposal.explicitFoodNoMatch ? <ThemedText type="small" themeColor="textSecondary">No strong {foodFocusLabel(proposal.explicitFoodNoMatch)} matches found nearby. Customize to view broader food alternatives.</ThemedText> : proposal.missingStageIds.length ? <ThemedText type="small" themeColor="textSecondary">I found {stops.length === 1 ? 'one stop' : stops.length + ' stops'}, but couldn’t find a suitable option for every requested part nearby. You can customize this plan or try another request.</ThemedText> : null}
      <Budget proposal={proposal} totals={totals} />
      <View style={styles.map}><ItineraryMap start={proposal.state.start} candidates={[]} selected={stops.map((stop) => stop.place)} highlightedId={null} onPressCandidate={() => {}} /></View>
      <PrimaryButton disabled={busy || stops.length === 0} label={busy ? 'Working…' : 'Use this plan'} onPress={onUse} />
      <View style={styles.secondary}><SecondaryButton disabled={busy} label="Customize" accessibilityLabel="Customize" labelNumberOfLines={1} onPress={onCustomize} style={styles.secondaryAction} /><SecondaryButton disabled={busy} label="Try another" accessibilityLabel="Try another" labelNumberOfLines={1} onPress={onTryAnother} style={styles.secondaryAction} /></View>
      <StartOverAction onPress={onStartOver} />
    </ClaySurface>
  </View>;
}

function Budget({ proposal, totals }: { proposal: WiseProposal; totals: ReturnType<typeof remainingBudget> }) {
  if (totals.uncertain) { const knownSpend = totals.knownStopCount === 0 ? 'Not available yet' : totals.minAmountMinor === totals.maxAmountMinor ? formatPhp(totals.minAmountMinor) : formatPhp(totals.minAmountMinor) + '–' + formatPhp(totals.maxAmountMinor); return <ClaySurface elevation="subtle" style={styles.budget}><ThemedText type="smallBold">BUDGET STATUS · PARTIALLY KNOWN</ThemedText><ThemedText type="small">Known spend: {knownSpend}</ThemedText><ThemedText type="small" themeColor="textSecondary">{totals.knownStopCount === 0 ? 'No selected stops have reliable pricing yet.' : totals.unknownStopCount + (totals.unknownStopCount === 1 ? ' stop has price unavailable.' : ' stops have price unavailable.')}</ThemedText></ClaySurface>; }
  return <ClaySurface elevation="subtle" style={styles.budget}><ThemedText type="smallBold">ESTIMATED PLAN SPEND</ThemedText><ThemedText style={Typography.cardTitle}>{formatPhp(totals.minAmountMinor)}–{formatPhp(totals.maxAmountMinor)}</ThemedText><ThemedText type="small">Budget {formatPhp(proposal.state.budgetMinor)} · Remaining {formatPhp(totals.conservativeMinor!)}–{formatPhp(totals.optimisticMinor!)}</ThemedText></ClaySurface>;
}

const styles = StyleSheet.create({ wrap: { gap: Spacing.md }, userBubble: { alignSelf: 'flex-end', gap: 4, maxWidth: '88%' }, response: { gap: Spacing.md }, eyebrow: { fontSize: 11, letterSpacing: 1.1 }, stage: { gap: Spacing.xs, padding: Spacing.sm }, stageHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm }, stageCopy: { flex: 1, gap: 2 }, number: { alignItems: 'center', backgroundColor: '#C8F04A', borderRadius: 12, height: 30, justifyContent: 'center', width: 30 }, budget: { gap: 4, padding: Spacing.sm }, map: { overflow: 'hidden' }, secondary: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, secondaryAction: { flexBasis: 120, flexGrow: 1, flexShrink: 0, minWidth: 120, paddingHorizontal: Spacing.sm } });
