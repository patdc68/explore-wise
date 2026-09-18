import { classifyBudgetStatus, classifyPriceEvidence, normalizeBudget, type BudgetStatus, type PriceEvidenceClassification } from './budget.ts';
import type { PlannerIssue, PlannerWarning, PreferenceApplication, PreferenceDimension } from './contracts.ts';
import type { PlanningCoordinates, PricedNearbyPlace } from './domain.ts';
import type { PlanningIntent } from './intent.ts';
import {
  MAX_BROAD_CANDIDATES,
  MAX_BUDGET_EVIDENCE_CANDIDATES,
  MAX_CATEGORY_CODES_PER_QUERY,
  MAX_DATABASE_CALLS,
  MAX_PREFERENCE_EVIDENCE_CANDIDATES,
  PLANNER_POLICY,
  preferredSequentialRadiusMeters,
} from './policy.ts';

export type CandidatePoolKind = 'broad' | 'budget_evidence' | 'preference_evidence' | 'anchor';

export type RetrievalAnchor = Readonly<{
  placeId: string;
  intent: 'must_visit' | 'preferred';
  status?: string;
  categoryCode?: string | null;
  categoryActive?: boolean;
  place: PricedNearbyPlace | null;
}>;

export type CandidateSearchRequest = Readonly<{
  origin: PlanningCoordinates;
  radiusMeters: number;
  categoryCodes: readonly string[];
  resultLimit: number;
  budgetMinor: number | null;
  partySize: number;
  pool: Exclude<CandidatePoolKind, 'anchor'>;
}>;

export type AnchorCandidateRequest = Readonly<{
  anchor: RetrievalAnchor;
  budgetMinor: number | null;
  partySize: number;
}>;

export type CandidateChainMembership = Readonly<{ placeId: string; chainId: string }>;

/**
 * The repository is deliberately narrower than the future planner. It can
 * retrieve bounded, authoritative records, but it cannot compose or order an
 * itinerary.
 */
export type CandidateRetrievalRepository = Readonly<{
  findNearbyCandidates: (request: CandidateSearchRequest) => Promise<readonly PricedNearbyPlace[]>;
  findAnchorCandidate?: (request: AnchorCandidateRequest) => Promise<PricedNearbyPlace | null>;
  findChainMemberships?: (placeIds: readonly string[]) => Promise<readonly CandidateChainMembership[]>;
}>;

export type PreferenceSignal = Readonly<{
  dimension: PreferenceDimension;
  value: string;
  categoryCodes: readonly string[];
  application: PreferenceApplication;
}>;

export type StructuredCandidateRetrievalRequest = Readonly<{
  stageId: string;
  originalOrigin: PlanningCoordinates;
  sequentialOrigin: PlanningCoordinates;
  hardRadiusMeters: number;
  preferredRadiusMeters: number;
  broadCategoryCodes: readonly string[];
  preferenceCategoryCodes: readonly string[];
  hardCategoryCodes: readonly string[] | null;
  partySize: number;
  budgetMinor: number | null;
  budgetCurrencyCode: string;
  budgetStrictness: 'strict' | 'flexible';
  unknownPricePolicy: 'allow_with_disclosure' | 'exclude';
  excludedPlaceIds: readonly string[];
  excludedCategoryCodes: readonly string[];
  selectedPlaceIds: readonly string[];
  anchors: readonly RetrievalAnchor[];
  preferenceSignals: readonly PreferenceSignal[];
  requiredCandidateCount: number;
}>;

export type CandidateEvidence = Readonly<{
  sourcePools: readonly CandidatePoolKind[];
  preferenceSignals: readonly string[];
  sequentialDistanceMeters: number;
  originalDistanceMeters: number;
  affordability: BudgetStatus;
  priceEvidence: 'known' | 'unknown';
  priceReason: PriceEvidenceClassification['reason'];
  currencyCode: string | null;
  chainId?: string | null;
  anchorIntent?: 'must_visit' | 'preferred';
}>;

export type RetrievedCandidate = PricedNearbyPlace & Readonly<{ candidateEvidence: CandidateEvidence }>;

export type CandidatePoolCounts = Readonly<{
  broad: number;
  budgetEvidence: number;
  preferenceEvidence: number;
  anchor: number;
}>;

export type CandidateRetrievalMetadata = Readonly<{
  stageId: string;
  originalOrigin: PlanningCoordinates;
  sequentialOrigin: PlanningCoordinates;
  hardRadiusMeters: number;
  preferredRadiusMeters: number;
  usedRadiusMeters: number;
  expansionUsed: boolean;
  poolCounts: CandidatePoolCounts;
  mergedCandidateCount: number;
  deduplicatedCandidateCount: number;
  unknownPriceCount: number;
  excludedCount: number;
  databaseCallCount: number;
  databaseCallCap: number;
  databaseCallCapReached: boolean;
  appliedPreferences: readonly PreferenceApplication[];
  unappliedPreferences: readonly PreferenceApplication[];
  warnings: readonly PlannerWarning[];
}>;

export type CandidateRetrievalResult = Readonly<{
  outcome: 'complete' | 'insufficient' | 'policy_blocked' | 'error';
  candidates: readonly RetrievedCandidate[];
  metadata: CandidateRetrievalMetadata;
  issues: readonly PlannerIssue[];
  warnings: readonly PlannerWarning[];
}>;

export type CandidateRetrievalInput = Readonly<{
  intent: PlanningIntent;
  stageId: string;
  sequentialOrigin: PlanningCoordinates;
  categoryCodes?: readonly string[];
  requiredCandidateCount?: number;
  anchors?: readonly RetrievalAnchor[];
  selectedPlaceIds?: readonly string[];
}>;

export type CandidateRetrievalService = Readonly<{
  retrieve: (input: CandidateRetrievalInput) => Promise<CandidateRetrievalResult>;
}>;

export type CandidateRetrievalServiceOptions = Readonly<{
  maxDatabaseCalls?: number;
  /** Called immediately before each repository operation. Returning false blocks the call. */
  onDatabaseCall?: () => boolean;
  /** Optional composition-facing evidence targets. Defaults preserve the full bounded pools. */
  evidenceTargets?: Readonly<{
    budget?: number;
    preference?: number;
  }>;
}>;

const CATEGORY_CHILDREN: Readonly<Record<string, readonly string[]>> = Object.freeze({
  food: ['food.restaurant', 'food.cafe', 'food.bakery', 'food.dessert'],
  activity: ['activity.recreation'],
  entertainment: ['entertainment.cinema'],
  outdoor: ['outdoor.park'],
  attraction: ['attraction.museum', 'attraction.culture'],
});

const PREFERENCE_CATEGORY_MAP: Readonly<Record<PreferenceDimension, Readonly<Record<string, readonly string[]>>>> = Object.freeze({
  occasion: {},
  mobility: {},
  food: {
    cafe: ['food.cafe'],
    restaurant: ['food.restaurant'],
    dessert: ['food.dessert', 'food.bakery'],
    // The catalog has no fast-food subtype; restaurant is conservative,
    // explicitly partial evidence rather than a claim about the venue.
    fast_food: ['food.restaurant'],
    casual: [],
    local_food: [],
    drinks: [],
  },
  activities: {
    art_museum: ['attraction.museum', 'attraction.culture'],
    outdoor_park: ['outdoor.park', 'outdoor'],
    movie: ['entertainment.cinema'],
    games_arcade: ['activity.recreation'],
    sightseeing: ['attraction', 'attraction.culture'],
    shopping: [],
    nightlife: [],
    wellness: [],
  },
  moods: {
    outdoorsy: ['outdoor.park', 'outdoor'],
    // Food-trip intent is applied by the composition policy, not by guessing
    // that every individual candidate is a meal stop.
    food_trip: [],
    fun: ['activity.recreation', 'entertainment.cinema', 'outdoor.park'],
    artsy: ['attraction.museum', 'attraction.culture'],
    adventurous: ['activity.recreation', 'outdoor.park', 'attraction.culture'],
    romantic: [],
    chill: [],
    spontaneous: [],
  },
});

const PARTIAL_PREFERENCE_VALUES = new Set(['fast_food', 'games_arcade', 'sightseeing', 'fun', 'artsy', 'adventurous']);

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function expandCategoryCodes(values: readonly string[]): string[] {
  const expanded: string[] = [];
  for (const code of uniqueStrings(values)) {
    const children = CATEGORY_CHILDREN[code];
    if (children) expanded.push(...children);
    else expanded.push(code);
  }
  return uniqueStrings(expanded);
}

function categoryMatches(candidateCode: string | null | undefined, requestedCodes: readonly string[]): boolean {
  if (!requestedCodes.length) return true;
  if (!candidateCode) return false;
  const normalized = candidateCode.toLowerCase();
  return requestedCodes.some((code) => normalized === code || normalized.startsWith(`${code}.`));
}

function categoryIsExcluded(candidateCode: string | null | undefined, excludedCodes: readonly string[]): boolean {
  return excludedCodes.length > 0 && categoryMatches(candidateCode, excludedCodes);
}

function intersectCategoryCodes(
  requestedCodes: readonly string[],
  hardCodes: readonly string[] | null,
): string[] {
  if (!hardCodes?.length) return [...requestedCodes];
  if (!requestedCodes.length) return [...hardCodes];
  return requestedCodes.filter((code) => hardCodes.some((hard) => code === hard || code.startsWith(`${hard}.`) || hard.startsWith(`${code}.`)));
}

function preferenceValues(value: PlanningIntent['moods'] | PlanningIntent['food'] | PlanningIntent['activities']): readonly string[] {
  return value.state === 'selected' ? value.values : [];
}

function preferenceApplication(
  dimension: PreferenceDimension,
  value: string,
  categoryCodes: readonly string[],
): PreferenceApplication {
  if (!categoryCodes.length) {
    let reason = 'No authoritative category evidence is available in the current catalog.';
    if (value === 'spontaneous') reason = 'Diversity is applied during composition.';
    else if (value === 'food_trip') reason = 'Food-trip composition is applied after retrieval.';
    return { dimension, value, status: 'unapplied', reason };
  }
  return {
    dimension,
    value,
    status: 'applied',
    evidence: categoryCodes,
    ...(PARTIAL_PREFERENCE_VALUES.has(value) ? { reason: 'Applied conservatively through broad category evidence.' } : {}),
  };
}

export function preferenceSignalsForIntent(intent: PlanningIntent): readonly PreferenceSignal[] {
  const dimensions: readonly [PreferenceDimension, readonly string[]][] = [
    ['moods', preferenceValues(intent.moods)],
    ['food', preferenceValues(intent.food)],
    ['activities', preferenceValues(intent.activities)],
  ];
  const signals: PreferenceSignal[] = [];
  for (const [dimension, values] of dimensions) {
    for (const value of values) {
      const categoryCodes = expandCategoryCodes(PREFERENCE_CATEGORY_MAP[dimension][value] ?? []);
      signals.push({ dimension, value, categoryCodes, application: preferenceApplication(dimension, value, categoryCodes) });
    }
  }
  return signals;
}

function coordinatesAreValid(value: PlanningCoordinates): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

function distanceMeters(left: PlanningCoordinates, right: PlanningCoordinates): number {
  const earthRadiusMeters = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitudeA = radians(left.latitude);
  const latitudeB = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function uniqueIds(values: readonly string[]): string[] {
  return uniqueStrings(values);
}

function safeCandidateId(value: string): string {
  return value.toLowerCase();
}

function candidateIdsEqual(left: unknown, right: string): boolean {
  return typeof left === 'string' && safeCandidateId(left) === safeCandidateId(right);
}

function safeCandidatePlace(place: unknown): place is PricedNearbyPlace {
  if (typeof place !== 'object' || place === null) return false;
  const candidate = place as PricedNearbyPlace;
  return typeof candidate.place_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate.place_id)
    && typeof candidate.name === 'string' && candidate.name.trim().length > 0
    && typeof candidate.category_code === 'string' && candidate.category_code.trim().length > 0
    && typeof candidate.category_name === 'string' && candidate.category_name.trim().length > 0
    && coordinatesAreValid({ latitude: candidate.latitude, longitude: candidate.longitude });
}

type MutableCandidatePoolCounts = {
  broad: number;
  budgetEvidence: number;
  preferenceEvidence: number;
  anchor: number;
};

function emptyPoolCounts(): MutableCandidatePoolCounts {
  return { broad: 0, budgetEvidence: 0, preferenceEvidence: 0, anchor: 0 };
}

function warning(code: PlannerWarning['code'], message: string, stageId: string): PlannerWarning {
  return { code, message, stageId };
}

function issue(code: PlannerIssue['code'], message: string, stageId: string): PlannerIssue {
  return { code, message, stageId };
}

function safeWarningPush(target: PlannerWarning[], value: PlannerWarning): void {
  if (!target.some((existing) => existing.code === value.code && existing.stageId === value.stageId && existing.preference === value.preference)) target.push(value);
}

function buildRequest(input: CandidateRetrievalInput): Readonly<{ request: StructuredCandidateRetrievalRequest; signals: readonly PreferenceSignal[] }> | PlannerIssue {
  const { intent } = input;
  if (intent.location.geography.kind !== 'radius') return issue('unsupported_geography', 'Radius-based geography is required for candidate retrieval.', input.stageId);
  if (!coordinatesAreValid(intent.location.coordinates) || !coordinatesAreValid(input.sequentialOrigin)) return issue('invalid_request', 'Candidate retrieval requires valid coordinates.', input.stageId);
  const budget = normalizeBudget(intent.budget, intent.party.size);
  if (!budget) return issue('invalid_request', 'The planning budget could not be normalized safely.', input.stageId);

  const hardCategoryCodes = intent.constraints.categoryScope.kind === 'only'
    ? expandCategoryCodes(intent.constraints.categoryScope.categoryCodes)
    : null;
  const requestedCategoryCodes = expandCategoryCodes(input.categoryCodes ?? []);
  const broadCategoryCodes = intersectCategoryCodes(requestedCategoryCodes, hardCategoryCodes);
  const rawSignals = preferenceSignalsForIntent(intent);
  const signals = rawSignals.map((signal) => {
    const effectiveEvidence = intersectCategoryCodes(expandCategoryCodes(signal.categoryCodes), hardCategoryCodes);
    if (signal.application.status === 'applied' && effectiveEvidence.length === 0) {
      return {
        ...signal,
        application: {
          dimension: signal.dimension,
          value: signal.value,
          status: 'unapplied' as const,
          reason: 'The hard category scope has no overlap with this preference evidence.',
        },
      };
    }
    if (signal.application.status === 'applied') {
      return { ...signal, application: { ...signal.application, evidence: effectiveEvidence } };
    }
    return signal;
  });
  const preferenceCategoryCodes = intersectCategoryCodes(
    expandCategoryCodes(signals.flatMap((signal) => signal.categoryCodes)),
    hardCategoryCodes,
  );
  const categoryCodeSets = [broadCategoryCodes, preferenceCategoryCodes, hardCategoryCodes ?? []];
  if (categoryCodeSets.some((codes) => codes.length > MAX_CATEGORY_CODES_PER_QUERY)) {
    return issue('hard_constraint_unsatisfied', 'Candidate retrieval category bounds were exceeded.', input.stageId);
  }
  if (hardCategoryCodes && !broadCategoryCodes.length && requestedCategoryCodes.length > 0) {
    return issue('hard_constraint_unsatisfied', 'The stage category does not intersect the hard category scope.', input.stageId);
  }
  if (hardCategoryCodes && !hardCategoryCodes.length) return issue('hard_constraint_unsatisfied', 'The hard category scope is empty.', input.stageId);

  const hardRadiusMeters = intent.location.geography.radiusMeters;
  if (!Number.isSafeInteger(hardRadiusMeters)
    || hardRadiusMeters < PLANNER_POLICY.radiusMeters.min
    || hardRadiusMeters > PLANNER_POLICY.radiusMeters.max) {
    return issue('invalid_request', 'Candidate retrieval requires a bounded hard geography radius.', input.stageId);
  }
  const preferredRadiusMeters = preferredSequentialRadiusMeters(intent.mobility, hardRadiusMeters);
  const excludedPlaceIds = uniqueIds([...
    intent.constraints.excludedPlaceIds,
    ...(input.selectedPlaceIds ?? []),
  ]);
  const excludedCategoryCodes = uniqueStrings(intent.constraints.excludedCategoryCodes);
  const requiredCandidateCount = input.requiredCandidateCount ?? 1;
  if (!Number.isSafeInteger(requiredCandidateCount) || requiredCandidateCount < 1 || requiredCandidateCount > MAX_BROAD_CANDIDATES) {
    return issue('invalid_request', 'Candidate retrieval requires a bounded positive candidate count.', input.stageId);
  }
  return {
    request: {
      stageId: input.stageId,
      originalOrigin: intent.location.coordinates,
      sequentialOrigin: input.sequentialOrigin,
      hardRadiusMeters,
      preferredRadiusMeters,
      broadCategoryCodes,
      preferenceCategoryCodes,
      hardCategoryCodes,
      partySize: intent.party.size,
      budgetMinor: budget.totalAmountMinor,
      budgetCurrencyCode: budget.currencyCode,
      budgetStrictness: budget.strictness,
      unknownPricePolicy: budget.unknownPricePolicy,
      excludedPlaceIds,
      excludedCategoryCodes,
      selectedPlaceIds: uniqueIds(input.selectedPlaceIds ?? []),
      anchors: input.anchors ?? [],
      preferenceSignals: signals,
      requiredCandidateCount,
    },
    signals,
  };
}

type MutableCandidate = {
  place: PricedNearbyPlace;
  sourcePools: Set<CandidatePoolKind>;
  preferenceSignals: Set<string>;
  sequentialDistanceMeters: number;
  originalDistanceMeters: number;
  affordability: BudgetStatus;
  priceEvidence: 'known' | 'unknown';
  priceReason: PriceEvidenceClassification['reason'];
  currencyCode: string | null;
  chainId?: string | null;
  anchorIntent?: 'must_visit' | 'preferred';
};

function finalCandidate(candidate: MutableCandidate): RetrievedCandidate {
  return {
    ...candidate.place,
    candidateEvidence: {
      sourcePools: [...candidate.sourcePools],
      preferenceSignals: [...candidate.preferenceSignals],
      sequentialDistanceMeters: candidate.sequentialDistanceMeters,
      originalDistanceMeters: candidate.originalDistanceMeters,
      affordability: candidate.affordability,
      priceEvidence: candidate.priceEvidence,
      priceReason: candidate.priceReason,
      currencyCode: candidate.currencyCode,
      ...(candidate.chainId !== undefined ? { chainId: candidate.chainId } : {}),
      ...(candidate.anchorIntent ? { anchorIntent: candidate.anchorIntent } : {}),
    },
  };
}

function candidateBudgetStatus(
  place: PricedNearbyPlace,
  request: StructuredCandidateRetrievalRequest,
): Readonly<{ status: BudgetStatus; kind: 'known' | 'unknown'; reason: PriceEvidenceClassification['reason']; currencyCode: string | null }> {
  const evidence = classifyPriceEvidence(place, request.budgetCurrencyCode);
  if (request.budgetMinor === null) return { status: 'unknown', kind: evidence.kind, reason: evidence.reason, currencyCode: evidence.currencyCode };
  return {
    status: classifyBudgetStatus(place, request.budgetMinor, request.budgetCurrencyCode),
    kind: evidence.kind,
    reason: evidence.reason,
    currencyCode: evidence.currencyCode,
  };
}

type AcceptedCandidate =
  | Readonly<{ candidate: MutableCandidate; exclusion: false }>
  | Readonly<{ candidate: null; exclusion: true }>;

function catalogRecordIsActive(place: PricedNearbyPlace): boolean {
  const record = place as PricedNearbyPlace & Readonly<{
    status?: unknown;
    is_active?: unknown;
    category_active?: unknown;
    category_is_active?: unknown;
  }>;
  if (record.status !== undefined && record.status !== 'active') return false;
  if (record.is_active !== undefined && record.is_active !== true) return false;
  if (record.category_active !== undefined && record.category_active !== true) return false;
  if (record.category_is_active !== undefined && record.category_is_active !== true) return false;
  return true;
}

function acceptedCandidate(
  place: PricedNearbyPlace,
  request: StructuredCandidateRetrievalRequest,
  pool: CandidatePoolKind,
  radiusMeters: number,
  anchorIntent?: 'must_visit' | 'preferred',
): AcceptedCandidate | null {
  if (!safeCandidatePlace(place)) return null;
  if (!catalogRecordIsActive(place)) return null;
  const id = safeCandidateId(place.place_id);
  const categoryCode = typeof place.category_code === 'string' ? place.category_code.toLowerCase() : null;
  const sequentialDistance = distanceMeters(request.sequentialOrigin, { latitude: place.latitude, longitude: place.longitude });
  const originalDistance = distanceMeters(request.originalOrigin, { latitude: place.latitude, longitude: place.longitude });
  if (sequentialDistance > radiusMeters || originalDistance > request.hardRadiusMeters) return null;
  if (!categoryMatches(categoryCode, request.hardCategoryCodes ?? [])) return null;
  if (pool !== 'anchor' && !categoryMatches(categoryCode, request.broadCategoryCodes)) return null;
  if (request.excludedPlaceIds.includes(id) || request.selectedPlaceIds.includes(id)) return { candidate: null, exclusion: true };
  if (categoryCode && categoryIsExcluded(categoryCode, request.excludedCategoryCodes)) return { candidate: null, exclusion: true };
  const budget = candidateBudgetStatus(place, request);
  if (budget.kind === 'unknown' && request.unknownPricePolicy === 'exclude') return null;
  if (request.budgetStrictness === 'strict' && budget.kind === 'known' && !['fits', 'likely_fits'].includes(budget.status)) return null;
  const preferenceSignals = request.preferenceSignals
    .filter((signal) => signal.categoryCodes.length > 0 && categoryMatches(categoryCode, signal.categoryCodes))
    .map((signal) => `${signal.dimension}:${signal.value}`);
  return {
    exclusion: false,
    candidate: {
      place: { ...place, place_id: id, distance_meters: sequentialDistance, budget_status: budget.status },
      sourcePools: new Set([pool]),
      preferenceSignals: new Set(preferenceSignals),
      sequentialDistanceMeters: sequentialDistance,
      originalDistanceMeters: originalDistance,
      affordability: budget.status,
      priceEvidence: budget.kind,
      priceReason: budget.reason,
      currencyCode: budget.currencyCode,
      ...(anchorIntent ? { anchorIntent } : {}),
    },
  };
}

function anchorRejectionCode(
  anchor: RetrievalAnchor,
  place: PricedNearbyPlace,
  request: StructuredCandidateRetrievalRequest,
): PlannerIssue['code'] {
  if (!candidateIdsEqual(place.place_id, anchor.placeId)) return 'anchor_inactive';
  if (anchor.status !== undefined && anchor.status !== 'active') return 'anchor_inactive';
  if (anchor.categoryActive === false || !catalogRecordIsActive(place)) return 'anchor_inactive';
  const categoryCode = typeof place.category_code === 'string' ? place.category_code.toLowerCase() : null;
  if (anchor.categoryCode && categoryCode !== anchor.categoryCode.toLowerCase()) return 'anchor_scope_conflict';
  if (categoryCode && categoryIsExcluded(categoryCode, request.excludedCategoryCodes)) return 'anchor_excluded';
  if (request.excludedPlaceIds.includes(safeCandidateId(place.place_id))) return 'anchor_excluded';
  if (!categoryMatches(categoryCode, request.hardCategoryCodes ?? [])) return 'anchor_scope_conflict';
  const sequentialDistance = distanceMeters(request.sequentialOrigin, { latitude: place.latitude, longitude: place.longitude });
  const originalDistance = distanceMeters(request.originalOrigin, { latitude: place.latitude, longitude: place.longitude });
  if (sequentialDistance > request.hardRadiusMeters || originalDistance > request.hardRadiusMeters) return 'anchor_outside_geography';
  const budget = candidateBudgetStatus(place, request);
  if ((budget.kind === 'unknown' && request.unknownPricePolicy === 'exclude')
    || (request.budgetStrictness === 'strict' && budget.kind === 'known' && !['fits', 'likely_fits'].includes(budget.status))) return 'anchor_price_incompatible';
  return 'anchor_inactive';
}

function poolPriority(candidate: MutableCandidate): number {
  if (candidate.anchorIntent === 'must_visit') return 0;
  if (candidate.anchorIntent === 'preferred') return 1;
  if (candidate.sourcePools.has('preference_evidence')) return 2;
  if (candidate.sourcePools.has('budget_evidence')) return 3;
  return 4;
}

function capCandidates(values: readonly MutableCandidate[]): MutableCandidate[] {
  return [...values]
    .sort((left, right) => poolPriority(left) - poolPriority(right)
      || left.originalDistanceMeters - right.originalDistanceMeters
      || left.place.place_id.localeCompare(right.place.place_id))
    .slice(0, MAX_BROAD_CANDIDATES);
}

function baseMetadata(
  request: StructuredCandidateRetrievalRequest,
  signals: readonly PreferenceSignal[],
  callCount: number,
  capReached: boolean,
  databaseCallCap: number,
): CandidateRetrievalMetadata {
  const applications = signals.map((signal) => signal.application);
  return {
    stageId: request.stageId,
    originalOrigin: request.originalOrigin,
    sequentialOrigin: request.sequentialOrigin,
    hardRadiusMeters: request.hardRadiusMeters,
    preferredRadiusMeters: request.preferredRadiusMeters,
    usedRadiusMeters: request.preferredRadiusMeters,
    expansionUsed: false,
    poolCounts: emptyPoolCounts(),
    mergedCandidateCount: 0,
    deduplicatedCandidateCount: 0,
    unknownPriceCount: 0,
    excludedCount: 0,
    databaseCallCount: callCount,
    databaseCallCap,
    databaseCallCapReached: capReached,
    appliedPreferences: applications.filter((application) => application.status === 'applied'),
    unappliedPreferences: applications.filter((application) => application.status === 'unapplied'),
    warnings: [],
  };
}

function resultForIssue(request: StructuredCandidateRetrievalRequest | null, signals: readonly PreferenceSignal[], retrievalIssue: PlannerIssue): CandidateRetrievalResult {
  const effectiveRequest = request ?? {
    stageId: retrievalIssue.stageId ?? 'unknown',
    originalOrigin: { latitude: 0, longitude: 0 },
    sequentialOrigin: { latitude: 0, longitude: 0 },
    hardRadiusMeters: 0,
    preferredRadiusMeters: 0,
    budgetCurrencyCode: 'XXX',
    budgetStrictness: 'strict' as const,
    unknownPricePolicy: 'exclude' as const,
    budgetMinor: null,
    broadCategoryCodes: [],
    preferenceCategoryCodes: [],
    hardCategoryCodes: null,
    partySize: 1,
    excludedPlaceIds: [],
    excludedCategoryCodes: [],
    selectedPlaceIds: [],
    anchors: [],
    preferenceSignals: signals,
    requiredCandidateCount: 1,
  };
  const metadata = baseMetadata(effectiveRequest, signals, 0, false, MAX_DATABASE_CALLS);
  return { outcome: 'insufficient', candidates: [], metadata, issues: [retrievalIssue], warnings: metadata.warnings };
}

export function createCandidateRetrievalService(
  repository: CandidateRetrievalRepository,
  options: CandidateRetrievalServiceOptions = {},
): CandidateRetrievalService {
  const requestedCallCap = options.maxDatabaseCalls ?? MAX_DATABASE_CALLS;
  const databaseCallCap = Number.isSafeInteger(requestedCallCap)
    ? Math.min(MAX_DATABASE_CALLS, Math.max(0, requestedCallCap))
    : MAX_DATABASE_CALLS;
  const evidenceTarget = (value: number | undefined, fallback: number): number => {
    if (value === undefined || !Number.isSafeInteger(value)) return fallback;
    return Math.min(fallback, Math.max(0, value));
  };
  const budgetEvidenceTarget = evidenceTarget(options.evidenceTargets?.budget, MAX_BUDGET_EVIDENCE_CANDIDATES);
  const preferenceEvidenceTarget = evidenceTarget(options.evidenceTargets?.preference, MAX_PREFERENCE_EVIDENCE_CANDIDATES);
  return {
    retrieve: async (input): Promise<CandidateRetrievalResult> => {
      const built = buildRequest(input);
      if ('code' in built) return resultForIssue(null, [], built);
      const request = built.request;
      const signals = built.signals;
      let databaseCallCount = 0;
      let databaseCallCapReached = false;
      let repositoryError = false;
      let policyBlocked = false;
      let excludedCount = 0;
      const issues: PlannerIssue[] = [];
      const warnings: PlannerWarning[] = [];
      const poolCounts = emptyPoolCounts();
      const merged = new Map<string, MutableCandidate>();

      const callRepository = async <T>(operation: () => Promise<T>): Promise<T | null> => {
        if (databaseCallCount >= databaseCallCap) {
          databaseCallCapReached = true;
          policyBlocked = true;
          return null;
        }
        if (options.onDatabaseCall && !options.onDatabaseCall()) {
          databaseCallCapReached = true;
          policyBlocked = true;
          return null;
        }
        databaseCallCount += 1;
        try {
          return await operation();
        } catch {
          repositoryError = true;
          return null;
        }
      };

      const addCandidate = (value: MutableCandidate): void => {
        const key = safeCandidateId(value.place.place_id);
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, value);
          return;
        }
        for (const source of value.sourcePools) existing.sourcePools.add(source);
        for (const signal of value.preferenceSignals) existing.preferenceSignals.add(signal);
        if (value.anchorIntent === 'must_visit' || (value.anchorIntent === 'preferred' && !existing.anchorIntent)) existing.anchorIntent = value.anchorIntent;
        if (value.priceEvidence === 'known' && existing.priceEvidence === 'unknown') {
          existing.priceEvidence = value.priceEvidence;
          existing.priceReason = value.priceReason;
          existing.currencyCode = value.currencyCode;
          existing.affordability = value.affordability;
          existing.place = value.place;
        }
      };

      for (const anchor of request.anchors) {
        let place = anchor.place;
        if (repository.findAnchorCandidate) {
          const hydrated = await callRepository(() => repository.findAnchorCandidate!({ anchor, budgetMinor: request.budgetMinor, partySize: request.partySize }));
          if (repositoryError) break;
          place = hydrated;
        }
        if (!place) {
          if (anchor.intent === 'must_visit') issues.push(issue('anchor_inactive', 'A required anchor is not available in the active catalog.', request.stageId));
          else safeWarningPush(warnings, warning('preferred_anchor_omitted', 'A preferred anchor could not be included.', request.stageId));
          continue;
        }
        const anchorCategoryMismatch = anchor.categoryCode !== undefined
          && anchor.categoryCode !== null
          && (typeof place.category_code !== 'string' || place.category_code.toLowerCase() !== anchor.categoryCode.toLowerCase());
        const anchorIdentityMismatch = !candidateIdsEqual(place.place_id, anchor.placeId);
        const accepted = anchorIdentityMismatch || anchorCategoryMismatch
          ? null
          : acceptedCandidate(place, request, 'anchor', request.hardRadiusMeters, anchor.intent);
        if (!accepted || accepted.exclusion) {
          const code: PlannerIssue['code'] = accepted?.exclusion ? 'anchor_excluded' : anchorRejectionCode(anchor, place, request);
          if (anchor.intent === 'must_visit') issues.push(issue(code, 'A required anchor does not satisfy the hard retrieval constraints.', request.stageId));
          else safeWarningPush(warnings, warning('preferred_anchor_omitted', 'A preferred anchor does not satisfy the hard retrieval constraints.', request.stageId));
          continue;
        }
        poolCounts.anchor += 1;
        addCandidate(accepted.candidate);
      }

      if (repositoryError) {
        const metadata = baseMetadata(request, signals, databaseCallCount, databaseCallCapReached, databaseCallCap);
        return { outcome: 'error', candidates: [], metadata, issues: [issue('database_error', 'Candidate retrieval is temporarily unavailable.', request.stageId)], warnings: metadata.warnings };
      }

      const retrieveRadius = async (radiusMeters: number, expanded: boolean): Promise<void> => {
        if (policyBlocked || repositoryError) return;
        const query = async (pool: Exclude<CandidatePoolKind, 'anchor'>, categoryCodes: readonly string[], resultLimit: number, budgetMinor: number | null): Promise<number> => {
          const data = await callRepository(() => repository.findNearbyCandidates({
            origin: request.sequentialOrigin,
            radiusMeters,
            categoryCodes,
            resultLimit,
            budgetMinor,
            partySize: request.partySize,
            pool,
          }));
          if (data === null) return 0;
          let acceptedCount = 0;
          for (const place of data.slice(0, resultLimit)) {
            const accepted = acceptedCandidate(place, request, pool, radiusMeters);
            if (!accepted) continue;
            if (accepted.exclusion) {
              excludedCount += 1;
              continue;
            }
            acceptedCount += 1;
            addCandidate(accepted.candidate);
          }
          if (pool === 'broad') poolCounts.broad = Math.min(MAX_BROAD_CANDIDATES, poolCounts.broad + acceptedCount);
          else if (pool === 'budget_evidence') poolCounts.budgetEvidence = Math.min(MAX_BUDGET_EVIDENCE_CANDIDATES, poolCounts.budgetEvidence + acceptedCount);
          else poolCounts.preferenceEvidence = Math.min(MAX_PREFERENCE_EVIDENCE_CANDIDATES, poolCounts.preferenceEvidence + acceptedCount);
          return acceptedCount;
        };

        const broadCount = await query('broad', request.broadCategoryCodes, MAX_BROAD_CANDIDATES, null);
        if (policyBlocked || repositoryError) return;
        const knownBudgetCount = [...merged.values()].filter((candidate) => candidate.priceEvidence === 'known').length;
        if (request.budgetMinor !== null && knownBudgetCount < budgetEvidenceTarget && budgetEvidenceTarget > 0) {
          await query('budget_evidence', request.broadCategoryCodes, budgetEvidenceTarget, request.budgetMinor);
        }
        if (policyBlocked || repositoryError) return;
        const preferenceCount = [...merged.values()].filter((candidate) => candidate.preferenceSignals.size > 0).length;
        if (request.preferenceCategoryCodes.length > 0 && preferenceCount < preferenceEvidenceTarget && preferenceEvidenceTarget > 0) {
          await query('preference_evidence', request.preferenceCategoryCodes, preferenceEvidenceTarget, null);
        }
        if (expanded && broadCount === 0) safeWarningPush(warnings, warning('mobility_expanded', 'The preferred sequential radius did not provide enough candidates; the hard geography radius was used.', request.stageId));
      };

      await retrieveRadius(request.preferredRadiusMeters, false);
      let expansionUsed = false;
      if (!policyBlocked && !repositoryError && merged.size < request.requiredCandidateCount && request.preferredRadiusMeters < request.hardRadiusMeters) {
        expansionUsed = true;
        await retrieveRadius(request.hardRadiusMeters, true);
        safeWarningPush(warnings, warning('mobility_expanded', 'The preferred sequential radius was expanded once to the hard geography radius.', request.stageId));
      }

      if (repositoryError) {
        const metadata = baseMetadata(request, signals, databaseCallCount, databaseCallCapReached, databaseCallCap);
        return { outcome: 'error', candidates: [], metadata, issues: [issue('database_error', 'Candidate retrieval is temporarily unavailable.', request.stageId)], warnings: [...warnings, ...metadata.warnings] };
      }

      const capped = capCandidates([...merged.values()]);
      if (repository.findChainMemberships && capped.length > 0 && !policyBlocked) {
        const chainIds = capped.map((candidate) => candidate.place.place_id);
        const memberships = await callRepository(() => repository.findChainMemberships!(chainIds));
        if (memberships === null && !policyBlocked) safeWarningPush(warnings, warning('diversity_relaxed', 'Chain diversity metadata was unavailable for this retrieval.', request.stageId));
        if (memberships) {
          const membershipByPlace = new Map<string, string>();
          for (const membership of memberships) {
            const placeId = safeCandidateId(membership.placeId);
            if (!membershipByPlace.has(placeId)) membershipByPlace.set(placeId, membership.chainId);
          }
          for (const candidate of capped) {
            const chainId = membershipByPlace.get(safeCandidateId(candidate.place.place_id));
            if (chainId) {
              candidate.chainId = chainId;
              candidate.place = { ...candidate.place, chain_id: chainId };
            }
          }
        }
      }

      if (repositoryError) {
        const metadata = baseMetadata(request, signals, databaseCallCount, databaseCallCapReached, databaseCallCap);
        return { outcome: 'error', candidates: [], metadata, issues: [issue('database_error', 'Candidate retrieval is temporarily unavailable.', request.stageId)], warnings: [...warnings, ...metadata.warnings] };
      }

      const candidates = capped.map(finalCandidate);
      const unknownPriceCount = candidates.filter((candidate) => candidate.candidateEvidence.priceEvidence === 'unknown').length;
      if (unknownPriceCount > 0) safeWarningPush(warnings, warning('unknown_price', 'Some candidates have no verified same-currency price evidence.', request.stageId));
      if (candidates.some((candidate) => candidate.candidateEvidence.priceEvidence === 'unknown')) safeWarningPush(warnings, warning('budget_unverified', 'Affordability is unverified for candidates without matching price evidence.', request.stageId));
      if (candidates.some((candidate) => candidate.candidateEvidence.priceReason === 'currency_mismatch' || candidate.candidateEvidence.priceReason === 'currency_missing')) {
        safeWarningPush(warnings, warning('currency_mismatch', 'Some candidates use missing or different currency evidence and cannot be compared to the planning budget.', request.stageId));
      }
      for (const application of request.preferenceSignals.map((signal) => signal.application).filter((value) => value.status === 'unapplied')) {
        safeWarningPush(warnings, { code: 'unsupported_preference', message: application.reason ?? 'A preference has no supported catalog evidence.', stageId: request.stageId, preference: application.value });
      }
      const metadata: CandidateRetrievalMetadata = {
        ...baseMetadata(request, signals, databaseCallCount, databaseCallCapReached, databaseCallCap),
        usedRadiusMeters: expansionUsed ? request.hardRadiusMeters : request.preferredRadiusMeters,
        expansionUsed,
        poolCounts,
        mergedCandidateCount: merged.size,
        deduplicatedCandidateCount: candidates.length,
        unknownPriceCount,
        excludedCount,
        databaseCallCount,
        databaseCallCapReached,
        warnings,
      };
      if (policyBlocked) {
        return { outcome: 'policy_blocked', candidates, metadata, issues: [issue('internal_error', 'Candidate retrieval reached its database call limit.', request.stageId)], warnings };
      }
      if (issues.length > 0) return { outcome: 'insufficient', candidates, metadata, issues, warnings };
      if (candidates.length < request.requiredCandidateCount) {
        return {
          outcome: 'insufficient',
          candidates,
          metadata,
          issues: [issue(candidates.length === 0 ? 'no_candidates' : 'insufficient_candidates', 'The hard retrieval constraints did not produce enough candidates.', request.stageId)],
          warnings,
        };
      }
      return { outcome: 'complete', candidates, metadata, issues: [], warnings };
    },
  };
}

export const RETRIEVAL_LIMITS = Object.freeze({
  broad: MAX_BROAD_CANDIDATES,
  budgetEvidence: MAX_BUDGET_EVIDENCE_CANDIDATES,
  preferenceEvidence: MAX_PREFERENCE_EVIDENCE_CANDIDATES,
  databaseCalls: MAX_DATABASE_CALLS,
  maxCategoryCodesPerQuery: MAX_CATEGORY_CODES_PER_QUERY,
});

export const RETRIEVAL_POLICY = PLANNER_POLICY;
