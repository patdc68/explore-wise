import type { AskWiseIntent } from './ask-wise.ts';
import { historyKeyForStops } from '../../../../packages/planning/src/dedupe.ts';
import { buildFoodCandidatePool, isFoodStage, orderStageCandidates, stageRankingContextFromIntent } from './food-candidate-diversity.ts';
import { buildStages, filterCandidatesForStage, remainingBudget, selectStop, stageActivityFocus, type ItineraryStage, type ItineraryState } from './itinerary.ts';
import type { PricedNearbyPlace } from './places.ts';
import { logFoodPipeline } from './wise-food-diagnostics.ts';

export type WiseProposal = Readonly<{ intent: AskWiseIntent; state: ItineraryState; missingStageIds: readonly string[]; historyKey: string; explicitFoodNoMatch: Exclude<AskWiseIntent['foodFocus'], null | undefined> | null; anchorPlaceId: string | null }>;
export type ProposalFetcher = (input: { coordinates: { latitude: number; longitude: number }; categoryCodes: string[]; budgetMinor: number | null; partySize: number }) => Promise<PricedNearbyPlace[]>;

const excluded = (place: PricedNearbyPlace, terms: readonly string[]) => {
  const haystack = `${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`.toLowerCase();
  return terms.some((term) => term.trim() && haystack.includes(term.toLowerCase()));
};

/** RPC output is already relevance-first and budget-ranked. This only applies session exclusions. */
export async function buildWiseProposal({ intent, start, fetcher, excludedCombinations = [], anchor = null }: { intent: AskWiseIntent; start: ItineraryState['start']; fetcher: ProposalFetcher; excludedCombinations?: readonly string[]; anchor?: PricedNearbyPlace | null }): Promise<WiseProposal> {
  const state: ItineraryState = { start, budgetMinor: intent.budgetMinor ?? 300000, partySize: intent.partySize ?? 1, stages: buildStages(intent.stages.length ? intent.stages : ['discovery'], intent.inferredStages, intent.activityFocus), stops: [] };
  let selected = state;
  const missingStageIds: string[] = [];
  let explicitFoodNoMatch: Exclude<AskWiseIntent['foodFocus'], null | undefined> | null = null;
  const anchorStageId = anchor
    ? state.stages.find((stage) => anchor.category_code && stage.categoryCodes.includes(anchor.category_code))?.id ?? state.stages[0]?.id
    : undefined;
  for (const stage of selected.stages) {
    if (anchor && stage.id === anchorStageId) {
      selected = selectStop(selected, stage.id, anchor);
      continue;
    }
    // The itinerary display fallback is not user budget intent. Passing it to
    // the RPC would make known-price chains rank ahead of generic restaurants.
    const budget = intent.budgetMinor === null ? null : remainingBudget(selected).conservativeMinor ?? selected.budgetMinor;
    const candidates = await fetcher({ coordinates: selected.stops.at(-1)?.place ?? start, categoryCodes: [...stage.categoryCodes], budgetMinor: budget, partySize: selected.partySize });
    const eligible = filterCandidatesForStage(selected, stage.id, candidates.filter((place) => !excluded(place, intent.exclusions) && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)));
    const rankingContext = stageRankingContextFromIntent(intent, stageActivityFocus(stage));
    const foodPool = isFoodStage(stage.categoryCodes) ? buildFoodCandidatePool(eligible, rankingContext) : null;
    const alternatives = foodPool?.eligible ?? orderStageCandidates(stage.categoryCodes, eligible, rankingContext);
    if (foodPool) logFoodPipeline(stage.id, candidates, eligible, rankingContext);
    const available = alternatives.filter((place) => !excludedCombinations.includes(`${stage.id}:${place.place_id}`));
    const pick = available[0] ?? (foodPool?.explicitFocus ? undefined : alternatives[0]);
    if (!pick) {
      if (foodPool?.mode === 'explicit_food_no_match' && foodPool.explicitFocus) explicitFoodNoMatch = foodPool.explicitFocus;
      missingStageIds.push(stage.id);
      continue;
    }
    selected = selectStop(selected, stage.id, pick);
  }
  const historyKey = historyKeyForStops(selected.stops);
  return { intent, state: selected, missingStageIds, historyKey, explicitFoodNoMatch, anchorPlaceId: anchor?.place_id ?? null };
}

export function proposalRationale(stage: ItineraryStage, index: number) {
  return index === 0 ? `A grounded ${stage.title.toLowerCase()} option to begin your plan.` : `A nearby option for the next part of your plan.`;
}
