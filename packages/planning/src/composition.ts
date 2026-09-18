import { classifyPriceEvidence, normalizeBudget } from './budget.ts';
import type {
  AnchorInclusionResult,
  AnchorReview,
  BudgetSummary,
  GeneratePlanRequestV1,
  GeneratePlanResponseV1,
  PlanProposalV1,
  PlannerIssue,
  PlannerWarning,
  PreferenceApplication,
} from './contracts.ts';
import type { PlanningCoordinates, PricedNearbyPlace, ItineraryStage, ItineraryStop } from './domain.ts';
import type { CatalogPlaceAnchor } from './engine.ts';
import { historyKeyForStops } from './dedupe.ts';
import type { PlanningIntent } from './intent.ts';
import { GENERATION_RESPONSE_VERSION, MAX_GENERATED_STAGES, stopCountForSchedule } from './policy.ts';
import { rankByScore } from './ranking.ts';
import type { CandidateRetrievalService, RetrievedCandidate, RetrievalAnchor } from './retrieval.ts';

export type PlanningStageFamily = 'food' | 'cafe' | 'dessert' | 'recreation' | 'cinema' | 'outdoor' | 'attraction' | 'culture' | 'entertainment' | 'activity' | 'unknown';

/** Taxonomy-only family mapping; no venue suitability is inferred here. */
export function stageFamilyForCategoryCode(categoryCode: string | null | undefined): PlanningStageFamily {
  if (!categoryCode) return 'unknown';
  if (categoryCode === 'food.cafe') return 'cafe';
  if (categoryCode === 'food.dessert' || categoryCode === 'food.bakery') return 'dessert';
  if (categoryCode === 'food' || categoryCode.startsWith('food.')) return 'food';
  if (categoryCode === 'activity.recreation' || categoryCode.startsWith('activity.recreation.')) return 'recreation';
  if (categoryCode === 'entertainment.cinema' || categoryCode.startsWith('entertainment.cinema.')) return 'cinema';
  if (categoryCode === 'outdoor' || categoryCode.startsWith('outdoor.')) return 'outdoor';
  if (categoryCode === 'attraction.museum' || categoryCode.startsWith('attraction.museum.') || categoryCode === 'attraction.culture' || categoryCode.startsWith('attraction.culture.')) return 'culture';
  if (categoryCode === 'attraction' || categoryCode.startsWith('attraction.')) return 'attraction';
  if (categoryCode === 'entertainment' || categoryCode.startsWith('entertainment.')) return 'entertainment';
  if (categoryCode === 'activity' || categoryCode.startsWith('activity.')) return 'activity';
  return 'unknown';
}

export function stageFamilyForCategoryCodes(categoryCodes: readonly string[]): PlanningStageFamily {
  return categoryCodes.map(stageFamilyForCategoryCode).find((family) => family !== 'unknown') ?? 'unknown';
}

/** Compatibility mapping used by the existing manual catalog-place flow. */
export function selectionConstraintForCategoryCode(categoryCode: string | null | undefined): string {
  if (categoryCode === 'food.cafe') return 'cafe';
  if (categoryCode === 'food.dessert' || categoryCode === 'food.bakery') return 'dessert';
  if (categoryCode?.startsWith('food')) return 'food';
  if (categoryCode === 'activity.recreation') return 'recreation';
  if (categoryCode === 'entertainment.cinema') return 'cinema';
  if (categoryCode?.startsWith('outdoor')) return 'outdoor';
  if (categoryCode?.startsWith('attraction')) return 'attraction';
  if (categoryCode?.startsWith('entertainment')) return 'entertainment';
  return 'generic_activity';
}

/** Alternates requested families without creating additional unsupported stages. */
export function alternateStageFamilies(families: readonly PlanningStageFamily[], maxStages: number): PlanningStageFamily[] {
  if (!Number.isSafeInteger(maxStages) || maxStages <= 0) return [];
  const result: PlanningStageFamily[] = [];
  for (const family of families) {
    if (result.length >= maxStages) break;
    if (result.at(-1) === family && families.length > result.length) {
      const next = families.find((candidate, index) => index >= result.length && candidate !== family);
      if (next) { result.push(next); continue; }
    }
    result.push(family);
  }
  return result;
}

export type CompositionAnchor = Readonly<{
  placeId: string;
  intent: 'must_visit' | 'preferred';
  status: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryActive: boolean;
  place: CatalogPlaceAnchor | null;
}>;

export type DeterministicCompositionInput = Readonly<{
  request: GeneratePlanRequestV1;
  requestId: string;
  anchors: readonly CompositionAnchor[];
  anchorReviews: readonly AnchorReview[];
  retrieval: CandidateRetrievalService;
}>;

type StageSpec = Readonly<{
  id: string;
  title: string;
  family: PlanningStageFamily;
  categoryCodes: readonly string[];
  required: boolean;
  fallback: boolean;
  preferenceKeys: readonly string[];
  mustAnchor?: CompositionAnchor;
  preferredAnchor?: CompositionAnchor;
}>;

type BudgetState = {
  knownMinMinor: number;
  knownMaxMinor: number;
  knownStopCount: number;
  unknownStopCount: number;
  currencyMismatchStopCount: number;
  affordabilityUnverified: boolean;
};

type CandidateAssessment = Readonly<{
  eligible: boolean;
  budgetTier: number;
  reason?: 'strict_budget_impossible' | 'unknown_price_excluded' | 'budget_overage';
}>;

const FAMILY_DEFINITIONS: Readonly<Record<Exclude<PlanningStageFamily, 'unknown'>, Readonly<{ title: string; categoryCodes: readonly string[] }>>> = Object.freeze({
  food: { title: 'Food', categoryCodes: ['food'] },
  cafe: { title: 'Cafe', categoryCodes: ['food.cafe'] },
  dessert: { title: 'Dessert', categoryCodes: ['food.dessert', 'food.bakery'] },
  recreation: { title: 'Recreation', categoryCodes: ['activity.recreation'] },
  cinema: { title: 'Cinema', categoryCodes: ['entertainment.cinema'] },
  outdoor: { title: 'Outdoor', categoryCodes: ['outdoor'] },
  attraction: { title: 'Attraction', categoryCodes: ['attraction'] },
  culture: { title: 'Culture', categoryCodes: ['attraction.museum', 'attraction.culture'] },
  entertainment: { title: 'Entertainment', categoryCodes: ['entertainment'] },
  activity: { title: 'Activity', categoryCodes: ['activity'] },
});

const FOOD_STAGE_MAP: Readonly<Record<string, Readonly<{ family: PlanningStageFamily; categoryCodes: readonly string[] }>>> = Object.freeze({
  cafe: { family: 'cafe', categoryCodes: ['food.cafe'] },
  restaurant: { family: 'food', categoryCodes: ['food.restaurant'] },
  dessert: { family: 'dessert', categoryCodes: ['food.dessert', 'food.bakery'] },
  fast_food: { family: 'food', categoryCodes: ['food.restaurant'] },
});

const ACTIVITY_STAGE_MAP: Readonly<Record<string, Readonly<{ family: PlanningStageFamily; categoryCodes: readonly string[] }>>> = Object.freeze({
  art_museum: { family: 'culture', categoryCodes: ['attraction.museum', 'attraction.culture'] },
  outdoor_park: { family: 'outdoor', categoryCodes: ['outdoor'] },
  movie: { family: 'cinema', categoryCodes: ['entertainment.cinema'] },
  games_arcade: { family: 'recreation', categoryCodes: ['activity.recreation'] },
  sightseeing: { family: 'attraction', categoryCodes: ['attraction'] },
});

const MOOD_STAGE_MAP: Readonly<Record<string, Readonly<{ family: PlanningStageFamily; categoryCodes: readonly string[] }>>> = Object.freeze({
  outdoorsy: { family: 'outdoor', categoryCodes: ['outdoor'] },
  food_trip: { family: 'food', categoryCodes: ['food'] },
  fun: { family: 'activity', categoryCodes: ['activity', 'entertainment'] },
  artsy: { family: 'culture', categoryCodes: ['attraction.museum', 'attraction.culture'] },
  adventurous: { family: 'activity', categoryCodes: ['activity', 'outdoor', 'attraction'] },
});

const OCCASION_FAMILY_ORDER: Readonly<Record<PlanningIntent['occasion'], readonly PlanningStageFamily[]>> = Object.freeze({
  date: ['cafe', 'food', 'culture', 'outdoor', 'cinema'],
  friends: ['recreation', 'food', 'cinema', 'outdoor', 'culture'],
  family: ['outdoor', 'food', 'culture', 'recreation', 'cinema'],
  solo: ['culture', 'cafe', 'outdoor', 'food', 'cinema'],
});

function distanceMeters(left: PlanningCoordinates, right: PlanningCoordinates): number {
  const earthRadiusMeters = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitudeA = radians(left.latitude);
  const latitudeB = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizedId(value: string): string { return value.toLowerCase(); }

function categoryMatches(candidateCode: string | null | undefined, requestedCodes: readonly string[]): boolean {
  if (!candidateCode || requestedCodes.length === 0) return false;
  const candidate = candidateCode.toLowerCase();
  return requestedCodes.some((requested) => {
    const code = requested.toLowerCase();
    return candidate === code || candidate.startsWith(`${code}.`) || code.startsWith(`${candidate}.`);
  });
}

function familyDefinition(family: PlanningStageFamily): Readonly<{ title: string; categoryCodes: readonly string[] }> {
  return family === 'unknown' ? { title: 'Activity', categoryCodes: ['activity'] } : FAMILY_DEFINITIONS[family];
}

function stageFromFamily(id: string, family: PlanningStageFamily, categoryCodes: readonly string[] | undefined, required: boolean, fallback: boolean, preferenceKeys: readonly string[] = []): StageSpec {
  const definition = familyDefinition(family);
  const effectiveCodes = categoryCodes && categoryCodes.length > 0 ? [...categoryCodes] : [...definition.categoryCodes];
  const resolvedFamily = stageFamilyForCategoryCodes(effectiveCodes);
  return { id, title: definition.title, family: resolvedFamily === 'unknown' ? family : resolvedFamily, categoryCodes: effectiveCodes, required, fallback, preferenceKeys };
}

function selectedValues(value: PlanningIntent['food'] | PlanningIntent['activities'] | PlanningIntent['moods']): readonly string[] {
  return value.state === 'selected' ? value.values : [];
}

function stageCandidateKey(stageId: string, placeId: string): string { return `${stageId}:${normalizedId(placeId)}`; }

function orderedAnchors(anchors: readonly CompositionAnchor[], origin: PlanningCoordinates): CompositionAnchor[] {
  const remaining = [...anchors];
  const result: CompositionAnchor[] = [];
  let current = origin;
  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const leftDistance = left.place ? distanceMeters(current, left.place) : Number.POSITIVE_INFINITY;
      const rightDistance = right.place ? distanceMeters(current, right.place) : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || left.placeId.localeCompare(right.placeId);
    });
    const next = remaining.shift()!;
    result.push(next);
    if (next.place) current = next.place;
  }
  return result;
}

function interleaveStages(groups: readonly (readonly StageSpec[])[], ordinal: number): StageSpec[] {
  const remaining = groups.map((group) => [...group]);
  const result: StageSpec[] = [];
  let previousFamily: PlanningStageFamily | null = null;
  while (remaining.some((group) => group.length > 0)) {
    const available = remaining.map((group, index) => ({ group, index })).filter(({ group }) => group.length > 0).sort((left, right) => {
      const leftAvoid = left.group[0]!.family === previousFamily ? 1 : 0;
      const rightAvoid = right.group[0]!.family === previousFamily ? 1 : 0;
      return leftAvoid - rightAvoid || ((left.index + ordinal) % remaining.length) - ((right.index + ordinal) % remaining.length);
    });
    const selected = available[0];
    if (!selected) break;
    const next = selected.group.shift()!;
    result.push(next);
    previousFamily = next.family;
  }
  return result;
}

function requestedPreferenceStages(intent: PlanningIntent, ordinal: number): StageSpec[] {
  const food: StageSpec[] = [];
  for (const value of selectedValues(intent.food)) {
    const mapped = FOOD_STAGE_MAP[value];
    if (mapped) food.push(stageFromFamily(`pending-food-${food.length + 1}`, mapped.family, mapped.categoryCodes, false, false, [`food:${value}`]));
  }
  const activities: StageSpec[] = [];
  for (const value of selectedValues(intent.activities)) {
    const mapped = ACTIVITY_STAGE_MAP[value];
    if (mapped) activities.push(stageFromFamily(`pending-activity-${activities.length + 1}`, mapped.family, mapped.categoryCodes, false, false, [`activities:${value}`]));
  }
  const moods: StageSpec[] = [];
  for (const value of selectedValues(intent.moods)) {
    const mapped = MOOD_STAGE_MAP[value];
    if (mapped && (value !== 'food_trip' || food.length === 0)) moods.push(stageFromFamily(`pending-mood-${moods.length + 1}`, mapped.family, mapped.categoryCodes, false, false, [`moods:${value}`]));
  }
  return interleaveStages([food, activities, moods], ordinal);
}

function defaultFamilies(intent: PlanningIntent): PlanningStageFamily[] {
  const selectedFood = selectedValues(intent.food).length > 0 || selectedValues(intent.moods).includes('food_trip');
  const selectedActivity = selectedValues(intent.activities).length > 0 || selectedValues(intent.moods).some((value) => ['outdoorsy', 'fun', 'artsy', 'adventurous'].includes(value));
  if (selectedFood && !selectedActivity) return ['food', ...OCCASION_FAMILY_ORDER[intent.occasion].filter((family) => family !== 'food')];
  if (selectedActivity && !selectedFood) return ['activity', ...OCCASION_FAMILY_ORDER[intent.occasion].filter((family) => family !== 'activity')];
  return [...OCCASION_FAMILY_ORDER[intent.occasion]];
}

function scopeCategoryCodes(intent: PlanningIntent): readonly string[] | null {
  return intent.constraints.categoryScope.kind === 'only' ? intent.constraints.categoryScope.categoryCodes : null;
}

function buildStageSpecs(intent: PlanningIntent, anchors: readonly CompositionAnchor[], targetCount: number, ordinal: number): Readonly<{ stages: StageSpec[]; mustAnchors: readonly CompositionAnchor[] }> {
  const mustAnchors = orderedAnchors(anchors.filter((anchor) => anchor.intent === 'must_visit'), intent.location.coordinates);
  const stages: StageSpec[] = mustAnchors.map((anchor, index) => {
    const codes = anchor.categoryCode ? [anchor.categoryCode] : ['activity'];
    const base = stageFromFamily(`stage-${index + 1}`, stageFamilyForCategoryCodes(codes), codes, true, false, []);
    return { ...base, title: anchor.categoryName ?? base.title, mustAnchor: anchor };
  });
  const remainingSlots = Math.max(0, targetCount - stages.length);
  const scopedCodes = scopeCategoryCodes(intent);
  if (scopedCodes) {
    for (let index = 0; index < remainingSlots; index += 1) {
      const code = scopedCodes[(index + ordinal) % scopedCodes.length]!;
      stages.push(stageFromFamily(`stage-${stages.length + 1}`, stageFamilyForCategoryCode(code), [code], true, false));
    }
    return { stages, mustAnchors };
  }
  const selected = requestedPreferenceStages(intent, ordinal).slice(0, remainingSlots);
  stages.push(...selected.map((stage, index) => ({ ...stage, id: `stage-${stages.length + index + 1}` })));
  const fallbackFamilies = defaultFamilies(intent);
  let familyCursor = ordinal % Math.max(1, fallbackFamilies.length);
  while (stages.length < targetCount) {
    const previous = stages.at(-1)?.family;
    let chosen: PlanningStageFamily | null = null;
    for (let offset = 0; offset < fallbackFamilies.length; offset += 1) {
      const candidate = fallbackFamilies[(familyCursor + offset) % fallbackFamilies.length]!;
      if (candidate !== previous || fallbackFamilies.every((family) => family === previous)) {
        chosen = candidate;
        familyCursor = (familyCursor + offset + 1) % fallbackFamilies.length;
        break;
      }
    }
    if (!chosen) chosen = fallbackFamilies[familyCursor % fallbackFamilies.length] ?? 'activity';
    stages.push(stageFromFamily(`stage-${stages.length + 1}`, chosen, undefined, false, true));
  }
  return { stages, mustAnchors };
}

function toRetrievalAnchor(anchor: CompositionAnchor, intent: 'must_visit' | 'preferred'): RetrievalAnchor {
  return { placeId: anchor.placeId, intent, status: anchor.status, categoryCode: anchor.categoryCode, categoryActive: anchor.categoryActive, place: anchor.place };
}

function attachPreferredAnchors(stages: readonly StageSpec[], anchors: readonly CompositionAnchor[]): { stages: StageSpec[]; omitted: CompositionAnchor[] } {
  const next = stages.map((stage) => ({ ...stage }));
  const omitted: CompositionAnchor[] = [];
  for (const anchor of [...anchors].sort((left, right) => left.placeId.localeCompare(right.placeId))) {
    const compatible = next.find((stage) => !stage.mustAnchor && categoryMatches(anchor.categoryCode, stage.categoryCodes) && !stage.preferredAnchor);
    const fallback = next.find((stage) => !stage.mustAnchor && stage.fallback && !stage.preferredAnchor);
    const selected = compatible ?? fallback;
    if (!selected) { omitted.push(anchor); continue; }
    const index = next.findIndex((stage) => stage.id === selected.id);
    if (index < 0) { omitted.push(anchor); continue; }
    const replacementCodes = compatible ? selected.categoryCodes : anchor.categoryCode ? [anchor.categoryCode] : selected.categoryCodes;
    next[index] = { ...selected, categoryCodes: replacementCodes, family: stageFamilyForCategoryCodes(replacementCodes), preferredAnchor: anchor };
  }
  return { stages: next, omitted };
}

function issue(code: PlannerIssue['code'], message: string, stageId?: string): PlannerIssue {
  return { code, message, ...(stageId ? { stageId } : {}) };
}

function warning(code: PlannerWarning['code'], message: string, stageId?: string): PlannerWarning {
  return { code, message, ...(stageId ? { stageId } : {}) };
}

function addWarning(target: PlannerWarning[], value: PlannerWarning): void {
  if (!target.some((item) => item.code === value.code && item.stageId === value.stageId && item.preference === value.preference)) target.push(value);
}

function mergePreference(target: Map<string, PreferenceApplication>, value: PreferenceApplication): void {
  const key = `${value.dimension}:${value.value}`;
  const existing = target.get(key);
  if (!existing) { target.set(key, value); return; }
  const status = existing.status === 'applied' || value.status === 'applied' ? 'applied' : existing.status === 'neutral' || value.status === 'neutral' ? 'neutral' : 'unapplied';
  const evidence = [...new Set([...(existing.evidence ?? []), ...(value.evidence ?? [])])];
  target.set(key, { ...existing, ...value, status, ...(evidence.length > 0 ? { evidence } : {}) });
}

function aggregatePreferences(applied: Map<string, PreferenceApplication>, unapplied: Map<string, PreferenceApplication>, values: readonly PreferenceApplication[]): void {
  for (const value of values) {
    const key = `${value.dimension}:${value.value}`;
    if (value.status === 'applied' || value.status === 'neutral') {
      mergePreference(applied, value);
      unapplied.delete(key);
    } else if (!applied.has(key)) {
      mergePreference(unapplied, value);
    }
  }
}

function addCompositionPreference(intent: PlanningIntent, applied: Map<string, PreferenceApplication>, unapplied: Map<string, PreferenceApplication>, stages: readonly StageSpec[]): void {
  mergePreference(applied, { dimension: 'occasion', value: intent.occasion, status: 'applied', evidence: ['deterministic-family-order'] });
  if (intent.mobility.state === 'selected') mergePreference(applied, { dimension: 'mobility', value: intent.mobility.value, status: 'applied', evidence: ['bounded-radius-policy'] });
  if (selectedValues(intent.moods).includes('food_trip') && stages.some((stage) => stage.family === 'food' || stage.family === 'cafe' || stage.family === 'dessert')) {
    mergePreference(applied, { dimension: 'moods', value: 'food_trip', status: 'applied', evidence: ['food-composition'] });
    unapplied.delete('moods:food_trip');
  }
  if (selectedValues(intent.moods).includes('spontaneous')) {
    mergePreference(applied, { dimension: 'moods', value: 'spontaneous', status: 'applied', evidence: ['deterministic-diversity'] });
    unapplied.delete('moods:spontaneous');
  }
}

function budgetState(): BudgetState {
  return { knownMinMinor: 0, knownMaxMinor: 0, knownStopCount: 0, unknownStopCount: 0, currencyMismatchStopCount: 0, affordabilityUnverified: false };
}

function safeAdd(left: number, right: number): number | null {
  const next = left + right;
  return Number.isSafeInteger(next) ? next : null;
}

function assessCandidate(candidate: RetrievedCandidate, state: BudgetState, intent: PlanningIntent, normalizedTotalMinor: number): CandidateAssessment {
  const evidence = classifyPriceEvidence(candidate, intent.budget.currencyCode);
  if (evidence.kind === 'unknown') {
    if (intent.budget.unknownPricePolicy === 'exclude') return { eligible: false, budgetTier: 0, reason: 'unknown_price_excluded' };
    return { eligible: true, budgetTier: 1 };
  }
  const nextMin = safeAdd(state.knownMinMinor, evidence.minAmountMinor!);
  const nextMax = safeAdd(state.knownMaxMinor, evidence.maxAmountMinor!);
  if (nextMin === null || nextMax === null) return { eligible: false, budgetTier: 0, reason: 'strict_budget_impossible' };
  if (intent.budget.strictness === 'strict') {
    return nextMax <= normalizedTotalMinor
      ? { eligible: true, budgetTier: 5 }
      : { eligible: false, budgetTier: 0, reason: 'strict_budget_impossible' };
  }
  if (nextMin > normalizedTotalMinor) return { eligible: false, budgetTier: 0, reason: 'budget_overage' };
  return { eligible: true, budgetTier: nextMax <= normalizedTotalMinor ? 5 : 2 };
}

function recordBudget(state: BudgetState, candidate: RetrievedCandidate, intent: PlanningIntent, normalizedTotalMinor: number): boolean {
  const evidence = classifyPriceEvidence(candidate, intent.budget.currencyCode);
  if (evidence.kind === 'unknown') {
    state.unknownStopCount += 1;
    state.affordabilityUnverified = true;
    if (evidence.reason === 'currency_mismatch' || evidence.reason === 'currency_missing') state.currencyMismatchStopCount += 1;
    return true;
  }
  const nextMin = safeAdd(state.knownMinMinor, evidence.minAmountMinor!);
  const nextMax = safeAdd(state.knownMaxMinor, evidence.maxAmountMinor!);
  if (nextMin === null || nextMax === null) return false;
  state.knownMinMinor = nextMin;
  state.knownMaxMinor = nextMax;
  state.knownStopCount += 1;
  if (nextMax > normalizedTotalMinor) state.affordabilityUnverified = true;
  return true;
}

function candidateScore(candidate: RetrievedCandidate, stage: StageSpec, state: BudgetState, selectedChains: ReadonlySet<string>, ordinal: number, budgetTier: number): number {
  let score = 0;
  if (candidate.candidateEvidence.anchorIntent === 'must_visit') score += 1_000_000;
  if (candidate.candidateEvidence.anchorIntent === 'preferred') score += 100_000;
  score += candidate.candidateEvidence.preferenceSignals.length * 10_000;
  score += budgetTier * 1_000;
  const chain = candidate.candidateEvidence.chainId ?? candidate.chain_id ?? null;
  if (chain && selectedChains.has(chain.toLowerCase()) && candidate.candidateEvidence.anchorIntent !== 'must_visit') score -= 500;
  if (stageFamilyForCategoryCode(candidate.category_code) === stage.family) score += 150;
  if (stage.preferenceKeys.length > 0) score += 250;
  if (candidate.candidateEvidence.affordability === 'fits' || candidate.candidateEvidence.affordability === 'likely_fits') score += 100;
  if (candidate.candidateEvidence.affordability === 'may_exceed') score -= 25;
  if (state.knownStopCount > 0 && stageFamilyForCategoryCode(candidate.category_code) === stage.family) score -= 30;
  score -= Math.min(10_000, candidate.candidateEvidence.sequentialDistanceMeters) / 10;
  score -= Math.min(10_000, candidate.candidateEvidence.originalDistanceMeters) / 100;
  score += ordinal % 2 === 0 ? 0 : candidate.place_id.charCodeAt(candidate.place_id.length - 1) % 7;
  return score;
}

function publicPlace(candidate: RetrievedCandidate): PricedNearbyPlace {
  const { candidateEvidence: _evidence, chain_id: _chain, ...place } = candidate;
  return place;
}

function budgetSummary(intent: PlanningIntent, state: BudgetState, normalizedTotalMinor: number): BudgetSummary {
  return {
    currencyCode: intent.budget.currencyCode,
    basis: intent.budget.basis,
    strictness: intent.budget.strictness,
    budgetMinor: intent.budget.amountMinor,
    normalizedTotalMinor,
    partySize: intent.party.size,
    knownMinMinor: state.knownMinMinor,
    knownMaxMinor: state.knownMaxMinor,
    knownStopCount: state.knownStopCount,
    unknownStopCount: state.unknownStopCount,
    currencyMismatchStopCount: state.currencyMismatchStopCount,
    affordability: state.knownStopCount === 0 && state.unknownStopCount === 0 ? 'not_applicable' : state.affordabilityUnverified ? 'unverified' : 'verified',
  };
}

function noPlanResponse(requestId: string, anchorReviews: readonly AnchorReview[], issues: readonly PlannerIssue[], warnings: readonly PlannerWarning[]): GeneratePlanResponseV1 {
  return { responseVersion: GENERATION_RESPONSE_VERSION, requestId, outcome: 'no_plan', issues, anchorReviews, ...(warnings.length > 0 ? { warnings } : {}) };
}

function clarificationResponse(requestId: string, anchorReviews: readonly AnchorReview[], issues: readonly PlannerIssue[], warnings: readonly PlannerWarning[]): GeneratePlanResponseV1 {
  return { responseVersion: GENERATION_RESPONSE_VERSION, requestId, outcome: 'clarification_needed', issues, anchorReviews, ...(warnings.length > 0 ? { warnings } : {}) };
}

function errorResponse(requestId: string, code: 'database_error' | 'internal_error', retryable: boolean): GeneratePlanResponseV1 {
  return { responseVersion: GENERATION_RESPONSE_VERSION, requestId, outcome: 'error', error: { code, message: 'The planner is temporarily unavailable. Please try again.', retryable } };
}

/** Deterministic V1 composition. Factual venue evidence comes only from retrieval. */
export async function composeDeterministicPlan(input: DeterministicCompositionInput): Promise<GeneratePlanResponseV1> {
  const { request, requestId, anchorReviews, retrieval } = input;
  const intent = request.intent;
  const normalized = normalizeBudget(intent.budget, intent.party.size);
  const targetCount = stopCountForSchedule(intent.schedule);
  if (!normalized || targetCount === null || targetCount < 1 || targetCount > MAX_GENERATED_STAGES) return clarificationResponse(requestId, anchorReviews, [issue('unsupported_time_window', 'Choose an outing duration supported by the planner.')], []);
  const inputAnchors = input.anchors.filter((anchor) => intent.anchors.some((requested) => normalizedId(requested.placeId) === normalizedId(anchor.placeId)));
  const mustCount = inputAnchors.filter((anchor) => anchor.intent === 'must_visit').length;
  if (mustCount > targetCount) return clarificationResponse(requestId, anchorReviews, [issue('hard_constraint_unsatisfied', 'The required anchors exceed the available stop capacity.')], []);

  const ordinal = request.attempt?.ordinal ?? 0;
  const built = buildStageSpecs(intent, inputAnchors, targetCount, ordinal);
  const attached = attachPreferredAnchors(built.stages, inputAnchors.filter((anchor) => anchor.intent === 'preferred'));
  const stages = attached.stages;
  const warnings: PlannerWarning[] = [];
  for (const omitted of attached.omitted) addWarning(warnings, warning('preferred_anchor_omitted', 'A preferred anchor was not used because no compatible stage was available.'));
  if (!scopeCategoryCodes(intent)) {
    for (let index = 1; index < stages.length; index += 1) {
      if (stages[index - 1]?.family === stages[index]?.family) addWarning(warnings, warning('diversity_relaxed', 'A repeated category family was retained because the requested evidence did not provide a different supported family.', stages[index]?.id));
    }
  }
  const applied = new Map<string, PreferenceApplication>();
  const unapplied = new Map<string, PreferenceApplication>();
  addCompositionPreference(intent, applied, unapplied, stages);

  const selectedIds = new Set<string>();
  const selectedChains = new Set<string>();
  const stops: ItineraryStop<PricedNearbyPlace>[] = [];
  const missingStageIds: string[] = [];
  const budget = budgetState();
  let sequentialOrigin = intent.location.coordinates;
  let hardFailure: PlannerIssue | null = null;
  let noPlanFailure: PlannerIssue | null = null;
  let databasePolicyFailure = false;
  const excludedHistory = new Set(request.attempt?.excludedCombinations ?? []);
  const excludedStageCombinations = new Set<string>();
  for (const combination of excludedHistory) {
    for (const stageCombination of combination.split('|')) {
      if (stageCombination.includes(':')) excludedStageCombinations.add(stageCombination);
    }
  }
  const anchorInclusion = new Map<string, AnchorInclusionResult>(inputAnchors.map((anchor) => [normalizedId(anchor.placeId), { placeId: anchor.placeId, intent: anchor.intent, outcome: anchor.intent === 'preferred' ? 'omitted' : 'incompatible' }]));

  for (const stage of stages) {
    const stageAnchors: RetrievalAnchor[] = [];
    if (stage.mustAnchor) stageAnchors.push(toRetrievalAnchor(stage.mustAnchor, 'must_visit'));
    else if (stage.preferredAnchor) stageAnchors.push(toRetrievalAnchor(stage.preferredAnchor, 'preferred'));
    const result = await retrieval.retrieve({ intent, stageId: stage.id, sequentialOrigin, categoryCodes: stage.categoryCodes, requiredCandidateCount: 1, anchors: stageAnchors, selectedPlaceIds: [...selectedIds] });
    aggregatePreferences(applied, unapplied, result.metadata.appliedPreferences);
    aggregatePreferences(applied, unapplied, result.metadata.unappliedPreferences);
    for (const item of [...result.metadata.warnings, ...result.warnings]) addWarning(warnings, item);
    if (result.outcome === 'error') return errorResponse(requestId, 'database_error', true);
    if (result.outcome === 'policy_blocked') { databasePolicyFailure = true; break; }
    const candidates = result.candidates.filter((candidate) => !selectedIds.has(normalizedId(candidate.place_id)));
    const assessed = candidates.map((candidate) => ({ candidate, assessment: assessCandidate(candidate, budget, intent, normalized.totalAmountMinor) })).filter((entry) => entry.assessment.eligible);
    const ranked = rankByScore(assessed, (entry) => candidateScore(entry.candidate, stage, budget, selectedChains, ordinal, entry.assessment.budgetTier), (left, right) => left.candidate.place_id.localeCompare(right.candidate.place_id));
    let selected: RetrievedCandidate | null = null;
    let selectedAssessment: CandidateAssessment | null = null;
    const rotation = stage.mustAnchor || stage.preferredAnchor ? 0 : ordinal % Math.max(1, ranked.length);
    for (let offset = 0; offset < ranked.length; offset += 1) {
      const entry = ranked[(rotation + offset) % ranked.length]!;
      const candidateHistoryKey = stageCandidateKey(stage.id, entry.candidate.place_id);
      if (excludedHistory.has(candidateHistoryKey) || excludedStageCombinations.has(candidateHistoryKey)) continue;
      if (stage.mustAnchor && normalizedId(entry.candidate.place_id) !== normalizedId(stage.mustAnchor.placeId)) continue;
      selected = entry.candidate;
      selectedAssessment = entry.assessment;
      break;
    }
    if (!selected || !selectedAssessment) {
      const allReasons = candidates.map((candidate) => assessCandidate(candidate, budget, intent, normalized.totalAmountMinor).reason);
      const hasUnknownExclusion = allReasons.includes('unknown_price_excluded');
      const hasBudgetConflict = allReasons.includes('strict_budget_impossible') || allReasons.includes('budget_overage');
      if (stage.mustAnchor) {
        hardFailure = issue(hasUnknownExclusion ? 'unknown_price_excluded' : hasBudgetConflict ? 'strict_budget_impossible' : 'hard_constraint_unsatisfied', 'A required anchor could not satisfy the remaining hard constraints.', stage.id);
        anchorInclusion.set(normalizedId(stage.mustAnchor.placeId), { placeId: stage.mustAnchor.placeId, intent: 'must_visit', outcome: 'incompatible', stageId: stage.id, reason: hardFailure.code });
        break;
      }
      if (stage.required) {
        const requiredIssue = issue(hasUnknownExclusion ? 'unknown_price_excluded' : hasBudgetConflict ? 'strict_budget_impossible' : 'no_candidates', 'No eligible catalog evidence was available for this required stage.', stage.id);
        if (scopeCategoryCodes(intent) && requiredIssue.code === 'no_candidates') noPlanFailure = requiredIssue;
        else hardFailure = requiredIssue;
        break;
      }
      missingStageIds.push(stage.id);
      addWarning(warnings, warning('stage_unfilled', 'This optional stage could not be filled from the current catalog evidence.', stage.id));
      if (stage.preferredAnchor) {
        addWarning(warnings, warning('preferred_anchor_omitted', 'A preferred anchor was not used because it did not satisfy the remaining constraints.', stage.id));
        anchorInclusion.set(normalizedId(stage.preferredAnchor.placeId), { placeId: stage.preferredAnchor.placeId, intent: 'preferred', outcome: 'omitted', stageId: stage.id, reason: hasUnknownExclusion ? 'unknown_price_excluded' : hasBudgetConflict ? 'strict_budget_impossible' : 'no_candidates' });
      }
      continue;
    }
    if (!recordBudget(budget, selected, intent, normalized.totalAmountMinor)) {
      hardFailure = issue('strict_budget_impossible', 'The cumulative price evidence exceeds safe numeric bounds.', stage.id);
      break;
    }
    const selectedId = normalizedId(selected.place_id);
    selectedIds.add(selectedId);
    const chainId = selected.candidateEvidence.chainId ?? selected.chain_id;
    if (chainId) selectedChains.add(chainId.toLowerCase());
    stops.push({ stageId: stage.id, place: publicPlace(selected) });
    sequentialOrigin = { latitude: selected.latitude, longitude: selected.longitude };
    if (stage.mustAnchor) anchorInclusion.set(normalizedId(stage.mustAnchor.placeId), { placeId: stage.mustAnchor.placeId, intent: 'must_visit', outcome: 'included', stageId: stage.id });
    if (stage.preferredAnchor) {
      const preferredIncluded = selectedId === normalizedId(stage.preferredAnchor.placeId) || selected.candidateEvidence.anchorIntent === 'preferred';
      if (preferredIncluded) anchorInclusion.set(normalizedId(stage.preferredAnchor.placeId), { placeId: stage.preferredAnchor.placeId, intent: 'preferred', outcome: 'included', stageId: stage.id });
      else {
        anchorInclusion.set(normalizedId(stage.preferredAnchor.placeId), { placeId: stage.preferredAnchor.placeId, intent: 'preferred', outcome: 'omitted', stageId: stage.id, reason: 'insufficient_candidates' });
        addWarning(warnings, warning('preferred_anchor_omitted', 'A preferred anchor was not used in the generated plan.', stage.id));
      }
    }
    if (selectedAssessment.budgetTier < 5) budget.affordabilityUnverified = true;
  }

  if (databasePolicyFailure) return errorResponse(requestId, 'internal_error', false);
  if (hardFailure) return clarificationResponse(requestId, anchorReviews, [hardFailure], warnings);
  if (noPlanFailure) return noPlanResponse(requestId, anchorReviews, [noPlanFailure], warnings);
  if (stops.length === 0) return noPlanResponse(requestId, anchorReviews, [issue('no_candidates', 'No eligible catalog evidence was available for the requested plan.')], warnings);
  for (const anchor of inputAnchors) {
    if (anchor.intent === 'must_visit' && anchorInclusion.get(normalizedId(anchor.placeId))?.outcome !== 'included') return clarificationResponse(requestId, anchorReviews, [issue('hard_constraint_unsatisfied', 'A required anchor was not included in the generated plan.')], warnings);
    if (anchor.intent === 'preferred' && anchorInclusion.get(normalizedId(anchor.placeId))?.outcome !== 'included') addWarning(warnings, warning('preferred_anchor_omitted', 'A preferred anchor was not used in the generated plan.'));
  }
  if (budget.unknownStopCount > 0) {
    addWarning(warnings, warning('unknown_price', 'Some selected stops do not have verified same-currency price evidence.'));
    addWarning(warnings, warning('budget_unverified', 'The full plan affordability cannot be verified from current catalog evidence.'));
  }
  if (budget.currencyMismatchStopCount > 0) addWarning(warnings, warning('currency_mismatch', 'Some selected stops use different or missing currency evidence.'));
  if (stops.length < targetCount) addWarning(warnings, warning('stage_unfilled', 'The plan contains fewer stops than the duration target because eligible evidence was limited.'));

  const state = {
    start: { ...intent.location.coordinates, label: intent.location.label },
    budgetMinor: normalized.totalAmountMinor,
    partySize: intent.party.size,
    currencyCode: intent.budget.currencyCode,
    stages: stages.map((stage): ItineraryStage => ({ id: stage.id, title: stage.title, categoryCodes: stage.categoryCodes, required: stage.required, source: 'wise', selectionConstraint: selectionConstraintForCategoryCode(stage.categoryCodes[0]) })),
    stops,
  };
  const proposal: PlanProposalV1 = {
    intent,
    state,
    missingStageIds,
    historyKey: historyKeyForStops(stops),
    budgetSummary: budgetSummary(intent, budget, normalized.totalAmountMinor),
    anchorInclusions: [...anchorInclusion.values()],
    appliedPreferences: [...applied.values()].filter((value) => value.status === 'applied' || value.status === 'neutral'),
    unappliedPreferences: [...unapplied.values()].filter((value) => value.status === 'unapplied'),
    warnings,
  };
  return { responseVersion: GENERATION_RESPONSE_VERSION, requestId, outcome: missingStageIds.length > 0 || stops.length < targetCount ? 'partial_plan' : 'proposal', anchorReviews, proposal };
}
