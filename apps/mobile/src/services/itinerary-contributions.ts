import type { VisitReportInput } from './community-utils.ts';
import { executionStopId, type LiveItinerary } from './itinerary-execution.ts';

export type ContributionContext = Readonly<{ itineraryId: string; stopId: string; placeId: string }>;

export function contributionTargets(active: LiveItinerary | null) {
  if (!active || active.execution.status !== 'completed') return [];
  return active.itinerary.stops.filter((stop) => active.execution.stops.some((item) => item.id === executionStopId(stop) && item.status === 'completed'))
    .map((stop) => ({ ...stop, stopId: executionStopId(stop), shared: active.execution.contributedStopKeys?.includes(executionStopId(stop)) ?? false }));
}

export function contributionTarget(active: LiveItinerary | null, context: ContributionContext) {
  if (active?.execution.itineraryId !== context.itineraryId) return undefined;
  return contributionTargets(active).find((stop) => stop.stopId === context.stopId && stop.place.place_id === context.placeId);
}

/** Keep the existing report write authoritative. No local success on rejection. */
export async function submitContribution(input: VisitReportInput, context: ContributionContext | null, dependencies: {
  getActive: () => LiveItinerary | null;
  submitReport: (input: VisitReportInput) => Promise<void>;
  markContributed: (itineraryId: string, stopId: string) => Promise<boolean>;
}) {
  if (context) {
    const target = contributionTarget(dependencies.getActive(), context);
    if (!target || target.shared || input.placeId !== context.placeId) throw new Error('This contribution is no longer available. Return to your completed itinerary.');
  }
  await dependencies.submitReport(input);
  if (context) await dependencies.markContributed(context.itineraryId, context.stopId);
}

/** Presentation only: never change categories, prices, or recommendation logic. */
export function contributionCopy(categoryCode?: string | null) {
  const category = categoryCode?.split('.')[0];
  if (category === 'food') return { heading: 'How was your visit?', spend: 'How much did you spend?' };
  if (category === 'attraction') return { heading: 'How was your visit?', spend: 'How much was admission?' };
  if (category === 'activity' || category === 'entertainment') return { heading: 'How was the experience?', spend: 'How much did it cost?' };
  return { heading: 'How was your visit?', spend: 'How much did you spend?' };
}
