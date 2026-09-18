import { classifyPriceEvidence } from '../../../../packages/planning/src/budget.ts';
import type { PlanningIntent } from '../../../../packages/planning/src/intent.ts';

import { distanceBetweenCoordinates } from './distance.ts';
import type { ItineraryStage, ItineraryState } from './itinerary.ts';
import type { PricedNearbyPlace } from './places.ts';

/**
 * Client-side guardrails for editing a server-generated Guided Planner plan.
 * The server remains authoritative; these checks prevent Customize from
 * knowingly presenting a replacement that violates the original contract.
 */
export type GuidedAnchorInclusion = Readonly<{
  placeId: string;
  intent: 'must_visit' | 'preferred';
  outcome: 'included' | 'omitted' | 'incompatible';
  stageId?: string;
}>;

export type GuidedPlanConstraintContext = Readonly<{
  intent: PlanningIntent;
  anchorInclusions?: readonly GuidedAnchorInclusion[];
}>;

export type GuidedConstraintFailureCode =
  | 'invalid_place'
  | 'original_geography'
  | 'previous_leg'
  | 'following_leg'
  | 'excluded_place'
  | 'excluded_category'
  | 'category_scope'
  | 'stage_category'
  | 'duplicate_place'
  | 'duplicate_stage'
  | 'budget'
  | 'unknown_price'
  | 'required_stage'
  | 'must_visit'
  | 'invalid_route';

export type GuidedConstraintResult =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; code: GuidedConstraintFailureCode; message: string }>;

export type GuidedCandidateContext = Readonly<{
  intent: PlanningIntent;
  state: ItineraryState;
  stage?: Pick<ItineraryStage, 'id' | 'categoryCodes'>;
  origin?: Readonly<{ latitude: number; longitude: number }>;
  previousStop?: PricedNearbyPlace;
  nextStop?: PricedNearbyPlace;
}>;

const valid = (): GuidedConstraintResult => ({ valid: true });
const invalid = (code: GuidedConstraintFailureCode, message: string): GuidedConstraintResult => ({ valid: false, code, message });

function categoryMatches(candidateCode: string | null | undefined, requestedCodes: readonly string[]): boolean {
  if (!requestedCodes.length) return true;
  if (!candidateCode) return false;
  const normalized = candidateCode.toLowerCase();
  return requestedCodes.some((code) => {
    const requested = code.toLowerCase();
    return normalized === requested || normalized.startsWith(`${requested}.`);
  });
}

function categoryExcluded(candidateCode: string | null | undefined, excludedCodes: readonly string[]): boolean {
  return Boolean(candidateCode && excludedCodes.some((code) => categoryMatches(candidateCode, [code])));
}

export function guidedCategoryScopeAllows(intent: PlanningIntent, categoryCodes: readonly string[]): boolean {
  const scope = intent.constraints.categoryScope;
  if (scope.kind === 'only') {
    const requestedCodes = scope.categoryCodes;
    const inScope = categoryCodes.some((code) => categoryMatches(code, requestedCodes));
    if (!inScope) return false;
  }
  return !categoryCodes.some((code) => categoryExcluded(code, intent.constraints.excludedCategoryCodes));
}

function originalGeographyFailure(intent: PlanningIntent, place: PricedNearbyPlace): GuidedConstraintResult | null {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return invalid('invalid_place', 'This place does not have usable location data.');
  const originalDistance = distanceBetweenCoordinates(intent.location.coordinates, place);
  if (intent.location.geography.kind === 'radius') {
    return originalDistance === null || originalDistance > intent.location.geography.radiusMeters
      ? invalid('original_geography', 'This stop is outside your planning area.')
      : null;
  }

  // A locality boundary is not available to the mobile catalog client. Use
  // the server-provided locality context conservatively when it exists; a
  // candidate without matching context is not offered as a replacement.
  const city = intent.location.context.city?.trim().toLowerCase() ?? null;
  const region = intent.location.context.region?.trim().toLowerCase() ?? null;
  if (!city && !region) return invalid('original_geography', 'This place cannot be checked against the planning area.');
  const placeCity = place.city?.trim().toLowerCase() ?? null;
  const placeRegion = place.region?.trim().toLowerCase() ?? null;
  return (!city || placeCity === city) && (!region || placeRegion === region)
    ? null
    : invalid('original_geography', 'This stop is outside your planning area.');
}

function sequentialLegFailure(
  intent: PlanningIntent,
  origin: Readonly<{ latitude: number; longitude: number }> | PricedNearbyPlace,
  destination: PricedNearbyPlace,
  code: 'previous_leg' | 'following_leg',
): GuidedConstraintResult | null {
  // The hard sequential boundary is the same hard geography radius used by
  // generation. Mobility-derived radii are preferences and are intentionally
  // not enforced here.
  if (intent.location.geography.kind !== 'radius') return invalid('invalid_route', 'Guided sequential geography cannot be verified for this plan.');
  const distance = distanceBetweenCoordinates(origin, destination);
  if (distance === null || distance > intent.location.geography.radiusMeters) {
    return invalid(code, code === 'following_leg' ? 'This stop would put the next stop too far away.' : 'This stop is too far from the previous stop.');
  }
  return null;
}

function priceFailure(intent: PlanningIntent, state: ItineraryState, place: PricedNearbyPlace, replacingStageId?: string): GuidedConstraintResult | null {
  const evidence = classifyPriceEvidence(place, intent.budget.currencyCode);
  if (evidence.kind === 'unknown') {
    return intent.budget.unknownPricePolicy === 'allow_with_disclosure'
      ? null
      : invalid('unknown_price', 'This stop does not have the price evidence your budget requires.');
  }

  // Unknown/mismatched existing prices remain unknown and are not treated as
  // zero. Known replacement prices are compared against the strict total cap
  // using the mode's actual cumulative lower/upper bound semantics.
  let knownMin = 0;
  let knownMax = 0;
  for (const stop of state.stops) {
    if (replacingStageId && stop.stageId === replacingStageId) continue;
    const existing = classifyPriceEvidence(stop.place, intent.budget.currencyCode);
    if (existing.kind === 'unknown') {
      if (intent.budget.unknownPricePolicy === 'exclude') return invalid('unknown_price', 'A selected stop does not have the price evidence your budget requires.');
      continue;
    }
    knownMin += existing.minAmountMinor!;
    knownMax += existing.maxAmountMinor!;
  }
  const nextMin = knownMin + evidence.minAmountMinor!;
  const nextMax = knownMax + evidence.maxAmountMinor!;
  const fits = intent.budget.strictness === 'strict'
    ? nextMax <= state.budgetMinor
    : nextMin <= state.budgetMinor;
  return fits ? null : invalid('budget', 'This stop would exceed the outing budget.');
}

function adjacentStops(state: ItineraryState, stageId: string): Readonly<{ previous?: PricedNearbyPlace; next?: PricedNearbyPlace }> {
  const stageIndex = state.stages.findIndex((stage) => stage.id === stageId);
  if (stageIndex < 0) return {};
  const stopForStage = (id: string) => state.stops.find((stop) => stop.stageId === id)?.place;
  const previous = state.stages.slice(0, stageIndex).reverse().map((stage) => stopForStage(stage.id)).find(Boolean);
  const next = state.stages.slice(stageIndex + 1).map((stage) => stopForStage(stage.id)).find(Boolean);
  return { previous, next };
}

function categoryFailure(intent: PlanningIntent, place: PricedNearbyPlace, stage?: Pick<ItineraryStage, 'categoryCodes'>): GuidedConstraintResult | null {
  if (intent.constraints.excludedCategoryCodes.length > 0 && !place.category_code) return invalid('excluded_category', 'This stop does not have the category evidence needed for your exclusions.');
  if (categoryExcluded(place.category_code, intent.constraints.excludedCategoryCodes)) return invalid('excluded_category', 'This stop is in an excluded category.');
  if (intent.constraints.categoryScope.kind === 'only' && !categoryMatches(place.category_code, intent.constraints.categoryScope.categoryCodes)) return invalid('category_scope', 'This stop is outside your selected categories.');
  if (stage && !categoryMatches(place.category_code, stage.categoryCodes)) return invalid('stage_category', 'This stop does not fit this stage.');
  return null;
}

/** Detailed replacement validation used by candidate lists and stale-tap guards. */
export function validateGuidedCandidate(context: GuidedCandidateContext, place: PricedNearbyPlace): GuidedConstraintResult {
  const { intent, state, stage, origin } = context;
  if (intent.location.geography.kind !== 'radius') return invalid('invalid_route', 'Guided sequential geography cannot be verified for this plan.');
  if (typeof place.place_id !== 'string' || !place.place_id.trim()) return invalid('invalid_place', 'This place is not available for selection.');
  const id = place.place_id.toLowerCase();
  if (intent.constraints.excludedPlaceIds.some((excluded) => excluded.toLowerCase() === id)) return invalid('excluded_place', 'This place is excluded from your outing.');
  if (state.stops.some((stop) => stop.stageId !== stage?.id && stop.place.place_id.toLowerCase() === id)) return invalid('duplicate_place', 'That place is already in your outing.');
  const categoryIssue = categoryFailure(intent, place, stage);
  if (categoryIssue) return categoryIssue;
  const geographyIssue = originalGeographyFailure(intent, place);
  if (geographyIssue) return geographyIssue;

  const adjacent = stage ? adjacentStops(state, stage.id) : {};
  const previousStop = context.previousStop ?? adjacent.previous;
  const nextStop = context.nextStop ?? adjacent.next;
  const previousOrigin = previousStop ?? origin;
  if (previousOrigin) {
    const previousIssue = sequentialLegFailure(intent, previousOrigin, place, 'previous_leg');
    if (previousIssue) return previousIssue;
  }
  if (nextStop) {
    const followingIssue = sequentialLegFailure(intent, place, nextStop, 'following_leg');
    if (followingIssue) return followingIssue;
  }
  return priceFailure(intent, state, place, stage?.id) ?? valid();
}

export function guidedCandidateAllowed(context: GuidedCandidateContext, place: PricedNearbyPlace): boolean {
  return validateGuidedCandidate(context, place).valid;
}

function orderedStops(state: ItineraryState): readonly ItineraryState['stops'][number][] {
  return state.stages
    .map((stage) => state.stops.find((stop) => stop.stageId === stage.id))
    .filter((stop): stop is ItineraryState['stops'][number] => Boolean(stop));
}

/**
 * Full Guided route validation used immediately before device-local
 * finalization. It intentionally accepts only context already present in the
 * in-memory Guided proposal; persisted legacy Ask Wise plans use no context.
 */
export function validateGuidedItinerary(state: ItineraryState, context: GuidedPlanConstraintContext): GuidedConstraintResult {
  const stageIds = new Set<string>();
  for (const stage of state.stages) {
    if (stageIds.has(stage.id)) return invalid('invalid_route', 'This outing contains a duplicated stage.');
    stageIds.add(stage.id);
    if (stage.required && !state.stops.some((stop) => stop.stageId === stage.id)) return invalid('required_stage', 'Add the required stops before finalizing.');
  }

  const selectedStageIds = new Set<string>();
  const selectedPlaceIds = new Set<string>();
  for (const stop of state.stops) {
    if (!stageIds.has(stop.stageId)) return invalid('invalid_route', 'This outing contains an invalid stage selection.');
    if (selectedStageIds.has(stop.stageId)) return invalid('duplicate_stage', 'Each stage can have only one selected stop.');
    selectedStageIds.add(stop.stageId);
    const placeId = stop.place.place_id.toLowerCase();
    if (selectedPlaceIds.has(placeId)) return invalid('duplicate_place', 'A place cannot appear more than once in an outing.');
    selectedPlaceIds.add(placeId);
  }

  for (const anchor of context.intent.anchors) {
    if (anchor.intent !== 'must_visit') continue;
    const inclusion = context.anchorInclusions?.find((item) => item.intent === 'must_visit' && item.placeId.toLowerCase() === anchor.placeId.toLowerCase());
    if (inclusion && inclusion.outcome !== 'included') return invalid('must_visit', 'Keep all must-visit places in the outing.');
    const selectedAnchor = state.stops.find((stop) => stop.place.place_id.toLowerCase() === anchor.placeId.toLowerCase());
    if (!selectedAnchor) return invalid('must_visit', 'Keep all must-visit places in the outing.');
    if (inclusion?.stageId && inclusion.stageId !== selectedAnchor.stageId) return invalid('must_visit', 'Keep each must-visit place in its assigned stage.');
  }

  for (const stop of orderedStops(state)) {
    const stage = state.stages.find((item) => item.id === stop.stageId);
    if (!stage) return invalid('invalid_route', 'This outing contains an invalid stage selection.');
    const issue = validateGuidedCandidate({ intent: context.intent, state, stage, origin: state.start }, stop.place);
    if (!issue.valid) return issue;
  }
  return valid();
}

export function guidedStageIsLocked(
  intent: PlanningIntent,
  stageId: string,
  state: ItineraryState,
  anchorInclusions: readonly GuidedAnchorInclusion[] = [],
): boolean {
  return intent.anchors.some((anchor) => {
    if (anchor.intent !== 'must_visit') return false;
    const serverAssignment = anchorInclusions.find((inclusion) => inclusion.intent === 'must_visit' && inclusion.placeId.toLowerCase() === anchor.placeId.toLowerCase());
    if (serverAssignment?.outcome === 'included' && serverAssignment.stageId === stageId) return true;
    return state.stages.some((stage) => stage.id === stageId && state.stops.some((stop) => stop.stageId === stageId && stop.place.place_id.toLowerCase() === anchor.placeId.toLowerCase()));
  });
}
