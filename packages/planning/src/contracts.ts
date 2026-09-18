import { planningIntentValidator, validatePlanningIntent, type PlanningIntent } from './intent.ts';
import type { ItineraryState, PricedNearbyPlace } from './domain.ts';
import {
  GENERATION_REQUEST_VERSION,
  GENERATION_RESPONSE_VERSION,
  MAX_ATTEMPT_ORDINAL,
  MAX_CATEGORY_CODES_PER_QUERY,
  MAX_COMBINATION_LENGTH,
  MAX_EXCLUDED_COMBINATIONS_PER_ATTEMPT,
  MAX_GENERATED_STAGES,
  MAX_GENERATION_ANCHORS,
  MAX_PARTY_SIZE,
  MAX_RADIUS_METERS,
  MAX_REQUEST_BODY_BYTES,
  stopCountForSchedule,
} from './policy.ts';
import { array, enumeration, number, object, optional, text, validate, type Result, type Validator } from './validation.ts';

export type GeneratePlanRequestV1 = Readonly<{
  requestVersion: typeof GENERATION_REQUEST_VERSION;
  intent: PlanningIntent;
  draftRevision?: number;
  attempt?: Readonly<{
    excludedCombinations: readonly string[];
    ordinal: number;
  }>;
}>;

export type PlannerIssueCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'invalid_intent'
  | 'unsupported_geography'
  | 'anchor_inactive'
  | 'anchor_outside_geography'
  | 'anchor_excluded'
  | 'anchor_duplicate'
  | 'anchor_scope_conflict'
  | 'anchor_price_incompatible'
  | 'hard_constraint_unsatisfied'
  | 'no_candidates'
  | 'insufficient_candidates'
  | 'strict_budget_impossible'
  | 'unknown_price_excluded'
  | 'unsupported_time_window'
  | 'unsupported_preference'
  | 'database_error'
  | 'rate_limited'
  | 'internal_error'
  | 'stale_request';

export type PlannerIssue = Readonly<{
  code: PlannerIssueCode;
  message: string;
  path?: string;
  stageId?: string;
  placeId?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type PlannerWarningCode =
  | 'unknown_price'
  | 'currency_mismatch'
  | 'preferred_anchor_omitted'
  | 'mobility_expanded'
  | 'stage_unfilled'
  | 'unsupported_preference'
  | 'diversity_relaxed'
  | 'budget_unverified';

export type PlannerWarning = Readonly<{
  code: PlannerWarningCode;
  message: string;
  stageId?: string;
  placeId?: string;
  preference?: string;
}>;

export type AnchorReviewStatus = 'valid' | 'incompatible';
export type AnchorReview = Readonly<{
  placeId: string;
  intent: 'must_visit' | 'preferred';
  status: AnchorReviewStatus;
  reason?: PlannerIssueCode;
  checkedRevision?: number;
}>;

export type AnchorInclusionOutcome = 'included' | 'omitted' | 'incompatible';
export type AnchorInclusionResult = Readonly<{
  placeId: string;
  intent: 'must_visit' | 'preferred';
  outcome: AnchorInclusionOutcome;
  stageId?: string;
  reason?: PlannerIssueCode;
}>;

export type PreferenceDimension = 'occasion' | 'moods' | 'food' | 'activities' | 'mobility';
export type PreferenceApplication = Readonly<{
  dimension: PreferenceDimension;
  value: string;
  status: 'applied' | 'unapplied' | 'neutral';
  evidence?: readonly string[];
  reason?: string;
}>;

export type BudgetSummary = Readonly<{
  currencyCode: string;
  basis: 'total' | 'per_person';
  strictness: 'strict' | 'flexible';
  budgetMinor: number;
  normalizedTotalMinor: number;
  partySize: number;
  knownMinMinor: number;
  knownMaxMinor: number;
  knownStopCount: number;
  unknownStopCount: number;
  currencyMismatchStopCount: number;
  affordability: 'verified' | 'unverified' | 'not_applicable';
}>;

export type PlanProposalV1 = Readonly<{
  intent: PlanningIntent;
  state: ItineraryState<PricedNearbyPlace>;
  missingStageIds: readonly string[];
  historyKey: string;
  budgetSummary: BudgetSummary;
  anchorInclusions: readonly AnchorInclusionResult[];
  appliedPreferences: readonly PreferenceApplication[];
  unappliedPreferences: readonly PreferenceApplication[];
  warnings: readonly PlannerWarning[];
  explicitFoodNoMatch?: string | null;
  anchorPlaceId?: string | null;
}>;

export type GeneratePlanResponseV1 =
  | Readonly<{
      responseVersion: typeof GENERATION_RESPONSE_VERSION;
      requestId: string;
      outcome: 'proposal' | 'partial_plan';
      anchorReviews: readonly AnchorReview[];
      proposal: PlanProposalV1;
    }>
  | Readonly<{
      responseVersion: typeof GENERATION_RESPONSE_VERSION;
      requestId: string;
      outcome: 'clarification_needed' | 'no_plan';
      issues: readonly PlannerIssue[];
      anchorReviews: readonly AnchorReview[];
      warnings?: readonly PlannerWarning[];
    }>
  | Readonly<{
      responseVersion: typeof GENERATION_RESPONSE_VERSION;
      requestId: string;
      outcome: 'error';
      error: Readonly<{ code: PlannerIssueCode; message: string; retryable: boolean }>;
    }>;

const attemptValidator = object({
  excludedCombinations: array(text, 0, MAX_EXCLUDED_COMBINATIONS_PER_ATTEMPT),
  ordinal: number(0, MAX_ATTEMPT_ORDINAL, true),
});

const requestValidator: Validator<GeneratePlanRequestV1> = object({
  requestVersion: enumeration([GENERATION_REQUEST_VERSION]),
  intent: planningIntentValidator,
  draftRevision: optional(number(0, Number.MAX_SAFE_INTEGER, true)),
  attempt: optional(attemptValidator),
}) as Validator<GeneratePlanRequestV1>;

const issue = (path: string, message: string): Result<never> => ({ success: false, issues: [{ path, message }] });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonblankText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const issueCodes: readonly PlannerIssueCode[] = ['invalid_request', 'unsupported_version', 'invalid_intent', 'unsupported_geography', 'anchor_inactive', 'anchor_outside_geography', 'anchor_excluded', 'anchor_duplicate', 'anchor_scope_conflict', 'anchor_price_incompatible', 'hard_constraint_unsatisfied', 'no_candidates', 'insufficient_candidates', 'strict_budget_impossible', 'unknown_price_excluded', 'unsupported_time_window', 'unsupported_preference', 'database_error', 'rate_limited', 'internal_error', 'stale_request'];
const isIssueCode = (value: unknown): value is PlannerIssueCode => typeof value === 'string' && issueCodes.includes(value as PlannerIssueCode);
const warningCodes: readonly PlannerWarningCode[] = ['unknown_price', 'currency_mismatch', 'preferred_anchor_omitted', 'mobility_expanded', 'stage_unfilled', 'unsupported_preference', 'diversity_relaxed', 'budget_unverified'];
const isWarningCode = (value: unknown): value is PlannerWarningCode => typeof value === 'string' && warningCodes.includes(value as PlannerWarningCode);

function serializedByteLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return null;
  }
}

/** Authoritative request shape/bounds check used by the future server boundary. */
export function validateGeneratePlanRequest(value: unknown): Result<GeneratePlanRequestV1> {
  const parsed = validate(requestValidator, value);
  if (!parsed.success) return parsed;
  const intent = parsed.data.intent;
  if (intent.anchors.length > MAX_GENERATION_ANCHORS) return issue('$.intent.anchors', `Generation supports at most ${MAX_GENERATION_ANCHORS} anchors`);
  if (intent.location.geography.kind === 'radius' && intent.location.geography.radiusMeters > MAX_RADIUS_METERS) return issue('$.intent.location.geography.radiusMeters', 'Radius exceeds the generation boundary');
  if (intent.constraints.categoryScope.kind === 'only' && intent.constraints.categoryScope.categoryCodes.length > MAX_CATEGORY_CODES_PER_QUERY) return issue('$.intent.constraints.categoryScope.categoryCodes', `At most ${MAX_CATEGORY_CODES_PER_QUERY} category codes are supported per query`);
  if (stopCountForSchedule(intent.schedule) === null) return issue('$.intent.schedule', 'Schedule duration is outside the supported generation window');
  if (parsed.data.attempt?.excludedCombinations.some((combination) => combination.length > MAX_COMBINATION_LENGTH)) return issue('$.attempt.excludedCombinations', `Combinations may not exceed ${MAX_COMBINATION_LENGTH} characters`);
  const bytes = serializedByteLength(value);
  if (bytes === null || bytes > MAX_REQUEST_BODY_BYTES) return issue('$', `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
  return parsed;
}

function validAnchorReview(value: unknown): value is AnchorReview {
  return isRecord(value) && isNonblankText(value.placeId) && (value.intent === 'must_visit' || value.intent === 'preferred')
    && (value.status === 'valid' || value.status === 'incompatible')
    && (value.reason === undefined || isIssueCode(value.reason))
    && (value.checkedRevision === undefined || isFiniteNonnegative(value.checkedRevision));
}

function validIssue(value: unknown): value is PlannerIssue {
  return isRecord(value) && isIssueCode(value.code) && isNonblankText(value.message)
    && (value.path === undefined || typeof value.path === 'string')
    && (value.stageId === undefined || typeof value.stageId === 'string')
    && (value.placeId === undefined || typeof value.placeId === 'string');
}

function validWarning(value: unknown): value is PlannerWarning {
  return isRecord(value) && isWarningCode(value.code) && isNonblankText(value.message)
    && (value.stageId === undefined || typeof value.stageId === 'string')
    && (value.placeId === undefined || typeof value.placeId === 'string')
    && (value.preference === undefined || typeof value.preference === 'string');
}

function validAnchorInclusion(value: unknown): value is AnchorInclusionResult {
  return isRecord(value) && isNonblankText(value.placeId)
    && (value.intent === 'must_visit' || value.intent === 'preferred')
    && (value.outcome === 'included' || value.outcome === 'omitted' || value.outcome === 'incompatible')
    && (value.stageId === undefined || typeof value.stageId === 'string')
    && (value.reason === undefined || isIssueCode(value.reason));
}

function validPreferenceApplication(value: unknown): value is PreferenceApplication {
  return isRecord(value) && (value.dimension === 'occasion' || value.dimension === 'moods' || value.dimension === 'food' || value.dimension === 'activities' || value.dimension === 'mobility')
    && isNonblankText(value.value) && (value.status === 'applied' || value.status === 'unapplied' || value.status === 'neutral')
    && (value.evidence === undefined || (Array.isArray(value.evidence) && value.evidence.every(isNonblankText)))
    && (value.reason === undefined || typeof value.reason === 'string');
}

function validState(value: unknown): value is ItineraryState<PricedNearbyPlace> {
  if (!isRecord(value) || !isRecord(value.start) || !isFiniteNumber(value.start.latitude) || Math.abs(value.start.latitude) > 90
    || !isFiniteNumber(value.start.longitude) || Math.abs(value.start.longitude) > 180 || !isNonblankText(value.start.label)
    || !isFiniteNonnegative(value.budgetMinor) || !isFiniteNonnegative(value.partySize) || value.partySize < 1 || value.partySize > MAX_PARTY_SIZE
    || (value.currencyCode !== undefined && (typeof value.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(value.currencyCode)))
    || !Array.isArray(value.stages) || value.stages.length > MAX_GENERATED_STAGES || !Array.isArray(value.stops)) return false;
  const stageIds = new Set<string>();
  for (const stage of value.stages) {
    if (!isRecord(stage) || !isNonblankText(stage.id) || stageIds.has(stage.id) || !isNonblankText(stage.title)
      || !Array.isArray(stage.categoryCodes) || !stage.categoryCodes.every(isNonblankText)
      || typeof stage.required !== 'boolean' || (stage.source !== 'wise' && stage.source !== 'user_added')) return false;
    stageIds.add(stage.id);
  }
  const placeIds = new Set<string>();
  const selectedStages = new Set<string>();
  for (const stop of value.stops) {
    if (!isRecord(stop) || !isNonblankText(stop.stageId) || !stageIds.has(stop.stageId) || selectedStages.has(stop.stageId) || !isRecord(stop.place)
      || !isNonblankText(stop.place.place_id) || placeIds.has(stop.place.place_id) || !isNonblankText(stop.place.name)
      || !isFiniteNumber(stop.place.latitude) || Math.abs(stop.place.latitude) > 90 || !isFiniteNumber(stop.place.longitude) || Math.abs(stop.place.longitude) > 180
      || typeof stop.place.has_price !== 'boolean'
      || !(stop.place.estimated_group_min_minor === null || isFiniteNonnegative(stop.place.estimated_group_min_minor))
      || !(stop.place.estimated_group_max_minor === null || isFiniteNonnegative(stop.place.estimated_group_max_minor))) return false;
    selectedStages.add(stop.stageId); placeIds.add(stop.place.place_id);
  }
  return value.stages.every((stage) => !stage.required || selectedStages.has(stage.id));
}

function validBudgetSummary(value: unknown): value is BudgetSummary {
  return isRecord(value) && /^[A-Z]{3}$/.test(String(value.currencyCode))
    && (value.basis === 'total' || value.basis === 'per_person')
    && (value.strictness === 'strict' || value.strictness === 'flexible')
    && isFiniteNonnegative(value.budgetMinor) && isFiniteNonnegative(value.normalizedTotalMinor)
    && typeof value.partySize === 'number' && Number.isSafeInteger(value.partySize) && value.partySize >= 1 && value.partySize <= MAX_PARTY_SIZE
    && isFiniteNonnegative(value.knownMinMinor) && isFiniteNonnegative(value.knownMaxMinor)
    && isFiniteNonnegative(value.knownStopCount) && isFiniteNonnegative(value.unknownStopCount)
    && isFiniteNonnegative(value.currencyMismatchStopCount)
    && (value.affordability === 'verified' || value.affordability === 'unverified' || value.affordability === 'not_applicable');
}

function validProposal(value: unknown): value is PlanProposalV1 {
  if (!isRecord(value) || !validatePlanningIntent(value.intent).success || !validState(value.state)
    || !Array.isArray(value.missingStageIds) || !value.missingStageIds.every(isNonblankText)
    || typeof value.historyKey !== 'string' || !validBudgetSummary(value.budgetSummary)
    || !Array.isArray(value.anchorInclusions) || !value.anchorInclusions.every(validAnchorInclusion)
    || !Array.isArray(value.appliedPreferences) || !value.appliedPreferences.every(validPreferenceApplication)
    || !Array.isArray(value.unappliedPreferences) || !value.unappliedPreferences.every(validPreferenceApplication)
    || !Array.isArray(value.warnings) || !value.warnings.every(validWarning)) return false;
  return true;
}

/** Lightweight response discriminator validation for adapters and tests. */
export function validateGeneratePlanResponse(value: unknown): Result<GeneratePlanResponseV1> {
  if (!isRecord(value) || value.responseVersion !== GENERATION_RESPONSE_VERSION || !isNonblankText(value.requestId) || typeof value.outcome !== 'string') return issue('$', 'Invalid generation response envelope');
  if (value.outcome === 'proposal' || value.outcome === 'partial_plan') {
    if (!Array.isArray(value.anchorReviews) || !value.anchorReviews.every(validAnchorReview) || !validProposal(value.proposal)) return issue('$', 'Invalid proposal response');
    return { success: true, data: value as GeneratePlanResponseV1 };
  }
  if (value.outcome === 'clarification_needed' || value.outcome === 'no_plan') {
    if (!Array.isArray(value.issues) || !value.issues.every(validIssue) || !Array.isArray(value.anchorReviews) || !value.anchorReviews.every(validAnchorReview)) return issue('$', 'Invalid planner outcome response');
    return { success: true, data: value as GeneratePlanResponseV1 };
  }
  if (value.outcome === 'error') {
    if (!isRecord(value.error) || !isIssueCode(value.error.code) || !isNonblankText(value.error.message) || typeof value.error.retryable !== 'boolean') return issue('$', 'Invalid planner error response');
    return { success: true, data: value as GeneratePlanResponseV1 };
  }
  return issue('$.outcome', 'Unsupported generation response outcome');
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

/** Canonical JSON is useful for request logging/tests without depending on object insertion order. */
export function serializeGeneratePlanRequest(value: GeneratePlanRequestV1): string {
  return JSON.stringify(canonicalize(value));
}

export function serializeGeneratePlanResponse(value: GeneratePlanResponseV1): string {
  return JSON.stringify(canonicalize(value));
}
