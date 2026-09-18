import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyBudgetStatus,
  classifyPriceEvidence,
  multiplyMinorUnits,
  normalizeBudget,
  normalizeBudgetMinor,
  summarizeCurrencyAwarePrices,
} from '../src/budget.ts';
import {
  serializeGeneratePlanRequest,
  serializeGeneratePlanResponse,
  validateGeneratePlanRequest,
  validateGeneratePlanResponse,
  type GeneratePlanRequestV1,
  type GeneratePlanResponseV1,
} from '../src/contracts.ts';
import { historyKeyForStops, filterCandidatesByPlaceId, uniqueByPlaceId } from '../src/dedupe.ts';
import { createPlanningEngine, type PlanningDependencies } from '../src/engine.ts';
import { stopCountForDuration, stopCountForSchedule, preferredSequentialRadiusMeters, PLANNER_POLICY } from '../src/policy.ts';
import { deferRepeatedKeys, rankByScore, roundRobinByKey, stableSortBy } from '../src/ranking.ts';
import { validatePlanningIntent, type PlanningIntent } from '../src/intent.ts';

const placeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const intent = (): PlanningIntent => ({
  planningIntentVersion: 1,
  occasion: 'date',
  location: {
    source: 'selected_area', label: 'Test area', coordinates: { latitude: 14.55, longitude: 121.05 },
    context: { locality: null, city: null, region: null, countryCode: 'PH' }, geography: { kind: 'radius', radiusMeters: 5_000 },
  },
  party: { size: 2, children: null },
  budget: { amountMinor: 100_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
  schedule: { kind: 'duration', durationMinutes: 150, outingDate: null, startTime: null, timeZone: null },
  moods: { state: 'selected', values: ['romantic'] },
  food: { state: 'selected', values: ['cafe'] },
  activities: { state: 'selected', values: ['art_museum'] },
  mobility: { state: 'selected', value: 'keep_close' },
  anchors: [], constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
});

const place = (id: string, overrides: Record<string, unknown> = {}) => ({
  place_id: id, name: id, category_code: 'food.restaurant', category_name: 'Restaurant', latitude: 14.55, longitude: 121.05,
  has_price: true, estimated_group_min_minor: 20_000, estimated_group_max_minor: 30_000, currency_code: 'PHP',
  ...overrides,
});

const proposal = (value = intent()) => ({
  intent: value,
  state: {
    start: { latitude: 14.55, longitude: 121.05, label: 'Test area' }, budgetMinor: 100_000, partySize: 2, currencyCode: 'PHP',
    stages: [{ id: 'food-1', title: 'Food', categoryCodes: ['food.restaurant'], required: true, source: 'wise' }],
    stops: [{ stageId: 'food-1', place: place(placeId(1)) }],
  },
  missingStageIds: [], historyKey: 'food-1:' + placeId(1),
  budgetSummary: { currencyCode: 'PHP', basis: 'total', strictness: 'strict', budgetMinor: 100_000, normalizedTotalMinor: 100_000, partySize: 2, knownMinMinor: 20_000, knownMaxMinor: 30_000, knownStopCount: 1, unknownStopCount: 0, currencyMismatchStopCount: 0, affordability: 'verified' },
  anchorInclusions: [], appliedPreferences: [], unappliedPreferences: [], warnings: [],
});

const request = (): GeneratePlanRequestV1 => ({ requestVersion: 1, intent: intent(), draftRevision: 3, attempt: { ordinal: 0, excludedCombinations: [] } });

test('generation request V1 accepts the canonical intent but never PlannerDraft state', () => {
  const result = validateGeneratePlanRequest(request());
  assert.equal(result.success, true);
  assert.equal(validateGeneratePlanRequest({ ...request(), requestVersion: 2 }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), extra: true }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), intent: { ...intent(), anchors: Array.from({ length: 7 }, (_, index) => ({ placeId: placeId(index + 1), intent: 'preferred', order: { kind: 'any' } })) } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), attempt: { ordinal: 5, excludedCombinations: [] } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), attempt: { ordinal: 0, excludedCombinations: Array.from({ length: 7 }, (_, index) => `stage-${index}:place`) } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), attempt: { ordinal: 0, excludedCombinations: ['x'.repeat(201)] } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), intent: { ...intent(), party: { size: 51, children: null } } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), intent: { ...intent(), location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 50_001 } } } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), intent: { ...intent(), schedule: { ...intent().schedule, durationMinutes: 59 } } }).success, false);
  assert.equal(validateGeneratePlanRequest({ ...request(), intent: { ...intent(), schedule: { ...intent().schedule, durationMinutes: 721 } } }).success, false);
});

test('all response discriminators validate and canonical serialization is insertion-order independent', () => {
  const anchorReviews = [{ placeId: placeId(1), intent: 'must_visit' as const, status: 'valid' as const }];
  const proposalResponse: GeneratePlanResponseV1 = { responseVersion: 1, requestId: 'request-1', outcome: 'proposal', anchorReviews, proposal: proposal() };
  const partialResponse: GeneratePlanResponseV1 = { responseVersion: 1, requestId: 'request-2', outcome: 'partial_plan', anchorReviews, proposal: proposal() };
  const clarification: GeneratePlanResponseV1 = { responseVersion: 1, requestId: 'request-3', outcome: 'clarification_needed', anchorReviews, issues: [{ code: 'strict_budget_impossible', message: 'Budget cannot satisfy all required stops.' }] };
  const noPlan: GeneratePlanResponseV1 = { responseVersion: 1, requestId: 'request-4', outcome: 'no_plan', anchorReviews: [], issues: [{ code: 'no_candidates', message: 'No candidates.' }] };
  const error: GeneratePlanResponseV1 = { responseVersion: 1, requestId: 'request-5', outcome: 'error', error: { code: 'database_error', message: 'Try again.', retryable: true } };
  for (const response of [proposalResponse, partialResponse, clarification, noPlan, error]) assert.equal(validateGeneratePlanResponse(response).success, true);
  assert.equal(validateGeneratePlanResponse({ ...error, outcome: 'unknown' }).success, false);
  const reorderedRequest = { intent: request().intent, attempt: request().attempt, requestVersion: request().requestVersion, draftRevision: request().draftRevision } as GeneratePlanRequestV1;
  const reorderedResponse = { proposal: proposalResponse.proposal, anchorReviews: proposalResponse.anchorReviews, outcome: proposalResponse.outcome, requestId: proposalResponse.requestId, responseVersion: proposalResponse.responseVersion } as GeneratePlanResponseV1;
  assert.equal(serializeGeneratePlanRequest(request()), serializeGeneratePlanRequest(reorderedRequest));
  assert.equal(serializeGeneratePlanResponse(proposalResponse), serializeGeneratePlanResponse(reorderedResponse));
});

test('central policy bounds duration, evening windows, mobility and generation limits', () => {
  assert.equal(PLANNER_POLICY.partySize.max, 50);
  assert.equal(PLANNER_POLICY.maxCandidatePool, 50);
  assert.equal(PLANNER_POLICY.maxGeneratedStages, 5);
  assert.equal(PLANNER_POLICY.maxDatabaseCalls, 20);
  assert.equal(PLANNER_POLICY.maxAttempts, 5);
  assert.equal(stopCountForDuration(59), null);
  assert.equal(stopCountForDuration(60), 1);
  assert.equal(stopCountForDuration(119), 1);
  assert.equal(stopCountForDuration(150), 2);
  assert.equal(stopCountForDuration(239), 2);
  assert.equal(stopCountForDuration(240), 3);
  assert.equal(stopCountForDuration(480), 4);
  assert.equal(stopCountForDuration(720), 5);
  assert.equal(stopCountForDuration(721), null);
  assert.equal(stopCountForSchedule({ kind: 'window', outingDate: null, startTime: '18:00', endTime: '01:00', endDayOffset: 1, timeZone: 'Asia/Manila' }), 4);
  assert.equal(preferredSequentialRadiusMeters('keep_close', 5_000), 2_000);
  assert.equal(preferredSequentialRadiusMeters('short_rides_ok', 2_000), 2_000);
  assert.equal(preferredSequentialRadiusMeters('flexible', 5_000), 5_000);
  assert.equal(preferredSequentialRadiusMeters('neutral', 3_000), 3_000);
});

test('budget normalization is minor-unit safe and does not activate a flexible overage', () => {
  const budget = intent().budget;
  assert.equal(normalizeBudgetMinor(budget, 2), 100_000);
  assert.equal(normalizeBudgetMinor({ ...budget, basis: 'per_person', amountMinor: 50_000 }, 2), 100_000);
  assert.equal(normalizeBudgetMinor(budget, 51), null);
  assert.equal(normalizeBudget({ ...budget, basis: 'per_person', amountMinor: 50_000 }, 2)?.totalAmountMinor, 100_000);
  assert.equal(multiplyMinorUnits(Number.MAX_SAFE_INTEGER, 2), null);
  assert.equal(classifyPriceEvidence({ has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null }, 'PHP').kind, 'unknown');
  assert.equal(classifyPriceEvidence({ has_price: true, estimated_group_min_minor: 1, estimated_group_max_minor: 2, currency_code: 'USD' }, 'PHP').reason, 'currency_mismatch');
  assert.equal(classifyBudgetStatus({ has_price: true, pricing_basis: 'branch_verified', estimated_group_min_minor: 95, estimated_group_max_minor: 105, currency_code: 'PHP' }, 100, 'PHP'), 'may_exceed');
  assert.equal(classifyBudgetStatus({ has_price: true, pricing_basis: 'branch_verified', estimated_group_min_minor: 105, estimated_group_max_minor: 105, currency_code: 'PHP' }, 100, 'PHP'), 'exceeds');
  assert.equal(summarizeCurrencyAwarePrices([{ place: place('known') }, { place: place('unknown', { has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null }) }], 'PHP').unknownStopCount, 1);
});

test('exact-place history and stable diversity primitives preserve supplied order', () => {
  const one = place('one');
  const two = place('two');
  const stops = [{ stageId: 'a', place: one }, { stageId: 'b', place: two }, { stageId: 'c', place: one }];
  assert.deepEqual(uniqueByPlaceId([one, one, two]).map((value) => value.place_id), ['one', 'two']);
  assert.equal(historyKeyForStops(stops), 'a:one|b:two|c:one');
  assert.deepEqual(filterCandidatesByPlaceId(stops.slice(0, 2), 'c', [one, two, place('three')]).map((value) => value.place_id), ['three']);
  assert.deepEqual(stableSortBy([{ id: 'a', score: 1 }, { id: 'b', score: 1 }, { id: 'c', score: 2 }], (left, right) => right.score - left.score).map((value) => value.id), ['c', 'a', 'b']);
  assert.deepEqual(rankByScore([{ id: 'a', score: 1 }, { id: 'b', score: 1 }, { id: 'c', score: 2 }], (value) => value.score).map((value) => value.id), ['c', 'a', 'b']);
  assert.deepEqual(roundRobinByKey([{ id: 'a', family: 'food' }, { id: 'b', family: 'food' }, { id: 'c', family: 'activity' }], (value) => value.family).map((value) => value.id), ['a', 'c', 'b']);
  assert.deepEqual(deferRepeatedKeys([{ id: 'a', family: 'chain' }, { id: 'b', family: 'chain' }, { id: 'c', family: 'other' }], (value) => value.family === 'other' ? null : value.family).map((value) => value.id), ['a', 'c', 'b']);
});

test('engine dependencies are injectable and contain no platform clients', () => {
  const dependencies: PlanningDependencies = {
    anchors: { findActivePlaces: async () => [] },
    categories: { findActiveCategories: async () => [] },
    candidates: { retrieveCandidates: async () => [] },
    runtime: { now: () => new Date(0), requestId: () => 'test-request' },
  };
  const engine = createPlanningEngine(dependencies);
  assert.equal(engine.dependencies, dependencies);
  assert.equal(engine.validateIntent(intent()).success, true);
  assert.equal(validatePlanningIntent(intent()).success, true);
});
