import type { ActivityFocus } from './ask-wise-normalization';
import type { PricedNearbyPlace } from './places';
import { summarizeCurrencyAwarePrices, summarizeSelectedPrices } from '../../../../packages/planning/src/budget.ts';
import { selectionConstraintForCategoryCode as sharedSelectionConstraintForCategoryCode } from '../../../../packages/planning/src/composition.ts';
import { filterCandidatesByPlaceId, selectedPlaceIdsForOtherStages as sharedSelectedPlaceIdsForOtherStages } from '../../../../packages/planning/src/dedupe.ts';
import { googleMapsDirectionsUrl } from './google-maps.ts';
import { stageDistanceOrigin } from './planning-distance.ts';
import { validateGuidedItinerary, type GuidedPlanConstraintContext } from './guided-plan-constraints.ts';

export type ItineraryStageType = 'food_talk' | 'cafe' | 'activity_fun' | 'discovery';
export type ItineraryLifecycle = 'proposal' | 'building' | 'review' | 'finalized';
export const canNavigate = (phase: ItineraryLifecycle) => phase === 'finalized';
export type ItineraryStageSource = 'wise' | 'user_added';
/** The normalized planning constraint owns candidate presentation and focused activity ranking. */
export type StageSelectionConstraint = 'dinner' | 'cafe' | 'dessert' | 'food' | 'generic_activity' | 'recreation' | 'cinema' | 'museum' | 'attraction' | 'outdoor' | 'entertainment' | 'auditorium';
export type ItineraryStage = Readonly<{ id: string; title: string; categoryCodes: readonly string[]; required: boolean; source: ItineraryStageSource; selectionConstraint?: StageSelectionConstraint }>;
export type ItineraryStop = Readonly<{ stageId: string; place: PricedNearbyPlace }>;
export type ItineraryState = Readonly<{ start: { latitude: number; longitude: number; label: string }; budgetMinor: number; partySize: number; currencyCode?: string; stages: readonly ItineraryStage[]; stops: readonly ItineraryStop[]; finalized?: boolean }>;

export const STAGE_CATEGORIES: Record<ItineraryStageType, readonly string[]> = {
  food_talk: ['food', 'food.restaurant', 'food.cafe', 'food.bakery', 'food.dessert'],
  cafe: ['food.cafe'],
  activity_fun: ['activity.recreation', 'entertainment', 'entertainment.cinema', 'outdoor', 'outdoor.park', 'attraction', 'attraction.museum', 'attraction.culture'],
  discovery: ['activity.recreation', 'entertainment', 'entertainment.cinema', 'outdoor', 'outdoor.park', 'attraction', 'attraction.museum', 'attraction.culture'],
};

export const MAX_ITINERARY_STOPS = 6;

export const ADD_STOP_CATEGORIES = [
  { id: 'food', label: 'Food', title: 'Food', categoryCodes: ['food.restaurant'], selectionConstraint: 'food' },
  { id: 'cafe', label: 'Café', title: 'Café', categoryCodes: ['food.cafe'] },
  { id: 'dessert', label: 'Dessert', title: 'Dessert', categoryCodes: ['food.dessert'], selectionConstraint: 'dessert' },
  { id: 'activity', label: 'Something fun', title: 'Something fun', categoryCodes: [...STAGE_CATEGORIES.activity_fun], selectionConstraint: 'generic_activity' },
  { id: 'cinema', label: 'Cinema', title: 'Cinema', categoryCodes: ['entertainment.cinema', 'entertainment'], selectionConstraint: 'cinema' },
  { id: 'attraction', label: 'Attraction', title: 'Attraction', categoryCodes: ['attraction', 'attraction.museum', 'attraction.culture'], selectionConstraint: 'attraction' },
  { id: 'entertainment', label: 'Entertainment', title: 'Entertainment', categoryCodes: ['entertainment', 'entertainment.cinema'], selectionConstraint: 'entertainment' },
  { id: 'outdoor', label: 'Outdoor', title: 'Outdoor', categoryCodes: ['outdoor', 'outdoor.park'], selectionConstraint: 'outdoor' },
] as const;
export type AddStopCategoryId = typeof ADD_STOP_CATEGORIES[number]['id'];

export function activityCategoryCodes(focus: ActivityFocus = null): readonly string[] {
  if (focus === 'recreation') return ['activity.recreation'];
  if (focus === 'cinema') return ['entertainment.cinema', 'entertainment'];
  if (focus === 'museum') return ['attraction.museum', 'attraction.culture', 'attraction'];
  if (focus === 'landmark') return ['attraction', 'attraction.culture'];
  if (focus === 'outdoor') return ['outdoor.park', 'outdoor'];
  if (focus === 'auditorium') return ['entertainment'];
  return STAGE_CATEGORIES.activity_fun;
}

const activitySelectionConstraint = (focus: ActivityFocus): StageSelectionConstraint => {
  if (focus === 'recreation' || focus === 'cinema' || focus === 'museum' || focus === 'outdoor' || focus === 'auditorium') return focus;
  if (focus === 'landmark') return 'attraction';
  return 'generic_activity';
};

export function buildStages(sequence: readonly ItineraryStageType[], inferredTypes: readonly ItineraryStageType[] = [], activityFocus: ActivityFocus = null): ItineraryStage[] {
  return sequence.map((type, index) => ({ id: `${type}-${index + 1}`, title: type === 'food_talk' ? 'Dinner' : type === 'cafe' ? 'Coffee' : type === 'activity_fun' ? inferredTypes.includes(type) ? 'Something fun nearby' : 'Something fun' : 'Something to do', categoryCodes: type === 'activity_fun' ? activityCategoryCodes(activityFocus) : STAGE_CATEGORIES[type], required: !inferredTypes.includes(type), source: 'wise', selectionConstraint: type === 'food_talk' ? 'dinner' : type === 'cafe' ? 'cafe' : type === 'activity_fun' ? activitySelectionConstraint(activityFocus) : 'generic_activity' }));
}

/** Append-only Phase 1 extension stages are explicit user choices, never Wise optional suggestions. */
export function addUserStage(state: ItineraryState, categoryId: AddStopCategoryId): ItineraryState {
  if (state.finalized || state.stages.length >= MAX_ITINERARY_STOPS) return state;
  const category = ADD_STOP_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return state;
  const nextNumber = state.stages.reduce((highest, stage) => Math.max(highest, Number(stage.id.match(/^user-added-(\d+)$/)?.[1] ?? 0)), 0) + 1;
  const selectionConstraint: StageSelectionConstraint = category.id === 'food' ? 'food' : category.id === 'cafe' ? 'cafe' : category.id === 'dessert' ? 'dessert' : category.id === 'activity' ? 'generic_activity' : category.id === 'cinema' ? 'cinema' : category.id === 'attraction' ? 'attraction' : category.id === 'entertainment' ? 'entertainment' : 'outdoor';
  return { ...state, finalized: false, stages: [...state.stages, { id: `user-added-${nextNumber}`, title: category.title, categoryCodes: category.categoryCodes, required: true, source: 'user_added', selectionConstraint }] };
}

function selectionConstraintForCategoryCode(categoryCode: string | null): StageSelectionConstraint {
  return sharedSelectionConstraintForCategoryCode(categoryCode) as StageSelectionConstraint;
}

/** Add an explicitly searched active catalog identity without requiring optional category metadata. */
export function addCatalogPlace(state: ItineraryState, place: PricedNearbyPlace): ItineraryState {
  if (state.finalized || state.stages.length >= MAX_ITINERARY_STOPS || state.stops.some((stop) => stop.place.place_id === place.place_id)) return state;
  const nextNumber = state.stages.reduce((highest, stage) => Math.max(highest, Number(stage.id.match(/^user-added-(\d+)$/)?.[1] ?? 0)), 0) + 1;
  const stageId = `user-added-${nextNumber}`;
  const categoryCodes = place.category_code ? [place.category_code] : [];
  const next: ItineraryState = {
    ...state,
    finalized: false,
    stages: [...state.stages, {
      id: stageId,
      title: place.category_name ?? 'Place',
      categoryCodes,
      required: true,
      source: 'user_added',
      selectionConstraint: selectionConstraintForCategoryCode(place.category_code),
    }],
  };
  return selectStop(next, stageId, place);
}

/** Conservative compatibility fallback for legacy in-memory stage fixtures. */
export function stageSelectionConstraint(stage: Pick<ItineraryStage, 'title' | 'categoryCodes' | 'selectionConstraint'>): StageSelectionConstraint {
  if (stage.selectionConstraint) return stage.selectionConstraint;
  const title = stage.title.trim().toLowerCase();
  if (title.includes('dinner')) return 'dinner';
  if (/coffee|cafÃ©|cafe/.test(title)) return 'cafe';
  if (title.includes('dessert')) return 'dessert';
  if (title.includes('cinema') || (stage.categoryCodes.includes('entertainment.cinema') && !stage.categoryCodes.includes('entertainment'))) return 'cinema';
  if (stage.categoryCodes.includes('activity.recreation') && stage.categoryCodes.length === 1) return 'recreation';
  if (stage.categoryCodes.every((code) => code.startsWith('outdoor'))) return 'outdoor';
  if (stage.categoryCodes.every((code) => code.startsWith('attraction'))) return 'attraction';
  if (stage.categoryCodes.every((code) => code === 'entertainment' || code === 'entertainment.cinema')) return 'entertainment';
  if (stage.categoryCodes.some((code) => code === 'food' || code.startsWith('food.'))) return 'food';
  return 'generic_activity';
}

export function stageActivityFocus(stage: Pick<ItineraryStage, 'title' | 'categoryCodes' | 'selectionConstraint'>): ActivityFocus {
  const constraint = stageSelectionConstraint(stage);
  return constraint === 'recreation' || constraint === 'cinema' || constraint === 'museum' || constraint === 'outdoor' || constraint === 'auditorium' ? constraint : null;
}

export function isBroadActivityStage(stage: Pick<ItineraryStage, 'title' | 'categoryCodes' | 'selectionConstraint'>): boolean {
  return stageSelectionConstraint(stage) === 'generic_activity';
}

/** Removing a manual extension never changes Wise-created stages or their selections. */
export function removeUserStage(state: ItineraryState, stageId: string): ItineraryState {
  if (state.finalized) return state;
  const stage = state.stages.find((item) => item.id === stageId);
  if (!stage || stage.source !== 'user_added') return state;
  return { ...state, finalized: false, stages: state.stages.filter((item) => item.id !== stageId), stops: state.stops.filter((stop) => stop.stageId !== stageId) };
}

export function nextStageOrigin(state: ItineraryState): ItineraryState['start'] {
  const last = state.stops.at(-1)?.place;
  return last ? { latitude: last.latitude, longitude: last.longitude, label: last.name } : state.start;
}

/** Candidate searches chain from the closest preceding selected itinerary stop. */
export function stageOrigin(state: ItineraryState, stageIndex: number): ItineraryState['start'] {
  const origin = stageDistanceOrigin(state, stageIndex);
  if (origin.relation === 'planning-origin') return state.start;
  const priorStop = state.stages.slice(0, stageIndex).reverse().map((stage) => state.stops.find((stop) => stop.stageId === stage.id)?.place).find(Boolean)!;
  return { ...origin.coordinates, label: priorStop.name };
}

/** A selection identity augments coordinates so replacement refreshes downstream pools even at the same location. */
export function stageOriginKey(state: ItineraryState, stageIndex: number): string {
  const priorStop = state.stages.slice(0, stageIndex).reverse().map((stage) => state.stops.find((stop) => stop.stageId === stage.id)?.place).find(Boolean);
  return priorStop ? priorStop.place_id : 'start';
}

/**
 * Exact ew_place identities already used by another active stage. The focused
 * stage is deliberately omitted so its current selection stays selectable.
 */
export function selectedPlaceIdsForOtherStages(state: ItineraryState, currentStageId: string): ReadonlySet<string> {
  return sharedSelectedPlaceIdsForOtherStages(state.stops, currentStageId);
}

/** Keep stale candidate sessions distinct whenever their exact-place exclusion set changes. */
export function selectedPlaceExclusionKey(state: ItineraryState, currentStageId: string): string {
  return [...selectedPlaceIdsForOtherStages(state, currentStageId)].sort().join(',');
}

/**
 * Applies the active-itinerary exclusion before ranking. It uses only the
 * canonical place_id, never names, chains, coordinates, or addresses.
 *
 * A current-stage selection is restored when a refreshed search no longer
 * returns it, allowing the user to retain that selection while editing.
 */
export function filterCandidatesForStage(state: ItineraryState, currentStageId: string, candidates: readonly PricedNearbyPlace[]): PricedNearbyPlace[] {
  return filterCandidatesByPlaceId(state.stops, currentStageId, candidates);
}

/** Last-line invariant for selections arriving from an invalidated UI session. */
export function isPlaceAvailableForStage(state: ItineraryState, stageId: string, placeId: string): boolean {
  return !selectedPlaceIdsForOtherStages(state, stageId).has(placeId);
}

/** Keep Customize focused on a real stage after a structural user-added-stage removal. */
export function stageIndexAfterRemoval(currentIndex: number, removedIndex: number, remainingStageCount: number): number {
  if (remainingStageCount <= 0) return 0;
  if (removedIndex < currentIndex) return Math.max(0, currentIndex - 1);
  return Math.min(currentIndex, remainingStageCount - 1);
}

export function selectedTotals(stops: readonly ItineraryStop[], currencyCode?: string) {
  return currencyCode ? summarizeCurrencyAwarePrices(stops, currencyCode) : summarizeSelectedPrices(stops);
}

export function remainingBudget(state: ItineraryState) {
  const totals = selectedTotals(state.stops, state.currencyCode);
  return { ...totals, optimisticMinor: totals.uncertain ? null : Math.max(0, state.budgetMinor - totals.minAmountMinor), conservativeMinor: totals.uncertain ? null : Math.max(0, state.budgetMinor - totals.maxAmountMinor) };
}

/** Reserve a proportional share for every later unselected stage; no fixed food/activity split. */
export function stageBudget(state: ItineraryState, stageIndex: number): number | null {
  const remaining = remainingBudget(state);
  if (remaining.conservativeMinor === null) return null;
  const laterStages = state.stages.slice(stageIndex + 1).filter((stage) => !state.stops.some((stop) => stop.stageId === stage.id)).length;
  return Math.floor(remaining.conservativeMinor / (laterStages + 1));
}

export function selectStop(state: ItineraryState, stageId: string, place: PricedNearbyPlace): ItineraryState {
  if (state.finalized) return state;
  if (!isPlaceAvailableForStage(state, stageId, place.place_id)) return state;
  const stops = [...state.stops.filter((stop) => stop.stageId !== stageId), { stageId, place }];
  return { ...state, finalized: false, stops: stops.sort((a, b) => state.stages.findIndex((stage) => stage.id === a.stageId) - state.stages.findIndex((stage) => stage.id === b.stageId)) };
}
export function removeStop(state: ItineraryState, stageId: string): ItineraryState { return state.finalized ? state : { ...state, finalized: false, stops: state.stops.filter((stop) => stop.stageId !== stageId) }; }
/** Phase 1 finalization is a one-way transition; a new plan is required to edit again. */
export function finalizeItinerary(state: ItineraryState): ItineraryState;
export function finalizeItinerary(state: ItineraryState, guidedContext: GuidedPlanConstraintContext): ItineraryState | null;
export function finalizeItinerary(state: ItineraryState, guidedContext?: GuidedPlanConstraintContext): ItineraryState | null {
  if (state.finalized) return state;
  if (guidedContext && !validateGuidedItinerary(state, guidedContext).valid) return null;
  return { ...state, finalized: true };
}
export function mapStops(state: ItineraryState) { return state.stops.map((stop, index) => ({ ...stop, number: index + 1 })); }
export function navigationUrl(place: Pick<PricedNearbyPlace, 'latitude' | 'longitude' | 'name' | 'address' | 'city' | 'region' | 'google_place_id' | 'google_match_status'>) {
  return googleMapsDirectionsUrl({
    name: place.name,
    address: place.address,
    city: place.city,
    region: place.region,
    latitude: place.latitude,
    longitude: place.longitude,
    googlePlaceId: place.google_place_id,
    googleMatchStatus: place.google_match_status,
  });
}
export function areRequiredStagesComplete(state: ItineraryState) { return state.stages.filter((stage) => stage.required).every((stage) => state.stops.some((stop) => stop.stageId === stage.id)); }
export function firstIncompleteStageIndex(state: ItineraryState) { return state.stages.findIndex((stage) => stage.required && !state.stops.some((stop) => stop.stageId === stage.id)); }
