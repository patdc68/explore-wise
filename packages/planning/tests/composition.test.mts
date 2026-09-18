import assert from 'node:assert/strict';
import test from 'node:test';

import { composeDeterministicPlan, type CompositionAnchor } from '../src/composition.ts';
import type { GeneratePlanRequestV1 } from '../src/contracts.ts';
import type { PlanningIntent } from '../src/intent.ts';
import { preferenceSignalsForIntent, type CandidateRetrievalService, type RetrievedCandidate } from '../src/retrieval.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function intent(overrides: Partial<PlanningIntent> = {}): PlanningIntent {
  return {
    planningIntentVersion: 1,
    occasion: 'date',
    location: {
      source: 'selected_area', label: 'Test area', coordinates: { latitude: 0, longitude: 0 },
      context: { locality: null, city: null, region: null, countryCode: 'PH' }, geography: { kind: 'radius', radiusMeters: 5_000 },
    },
    party: { size: 2, children: null },
    budget: { amountMinor: 10_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
    schedule: { kind: 'duration', durationMinutes: 150, outingDate: null, startTime: null, timeZone: null },
    moods: { state: 'no_preference' }, food: { state: 'no_preference' }, activities: { state: 'no_preference' },
    mobility: { state: 'skipped' }, anchors: [], constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
    ...overrides,
  };
}

function place(n: number, categoryCode: string, overrides: Record<string, unknown> = {}) {
  return {
    place_id: id(n), name: `Place ${n}`, category_code: categoryCode, category_name: categoryCode,
    latitude: 0.001 * n, longitude: 0, distance_meters: null, has_price: true,
    pricing_basis: 'branch_verified', pricing_status: 'current', pricing_unit: 'per_group',
    min_amount_minor: 500, max_amount_minor: 1_000, currency_code: 'PHP', confidence_level: 'HIGH',
    price_precision: 'exact', pricing_channel: 'menu', price_source_label: 'fixture', last_verified_at: '2026-01-01T00:00:00Z',
    effective_price_source: 'branch', budget_status: null, estimated_group_min_minor: 500, estimated_group_max_minor: 1_000,
    ...overrides,
  };
}

function candidate(value: ReturnType<typeof place>, stageId: string): RetrievedCandidate {
  return {
    ...value,
    candidateEvidence: {
      sourcePools: ['broad'], preferenceSignals: [], sequentialDistanceMeters: 100, originalDistanceMeters: 100,
      affordability: 'fits', priceEvidence: value.has_price && value.currency_code === 'PHP' ? 'known' : 'unknown',
      priceReason: value.currency_code === 'PHP' ? 'known' : 'currency_mismatch', currencyCode: value.currency_code ?? null,
    },
    stageId,
  } as RetrievedCandidate;
}

function retrievalFor(values: readonly ReturnType<typeof place>[]): CandidateRetrievalService {
  return {
    retrieve: async (input) => {
      const matching = values.filter((value) => {
        const requested = input.categoryCodes ?? [];
        return requested.length === 0 || requested.some((code) => value.category_code === code || value.category_code.startsWith(`${code}.`) || code.startsWith(`${value.category_code}.`));
      }).filter((value) => !input.selectedPlaceIds?.some((selected) => selected.toLowerCase() === value.place_id.toLowerCase()))
        .filter((value) => !input.intent.constraints.excludedPlaceIds.some((excluded) => excluded.toLowerCase() === value.place_id.toLowerCase()))
        .filter((value) => !input.intent.constraints.excludedCategoryCodes.some((excluded) => value.category_code === excluded || value.category_code.startsWith(`${excluded}.`)))
        .filter((value) => input.intent.budget.unknownPricePolicy !== 'exclude' || (value.has_price && value.currency_code === input.intent.budget.currencyCode));
      const candidates = matching.map((value) => candidate(value, input.stageId));
      const signals = preferenceSignalsForIntent(input.intent);
      return {
        outcome: candidates.length > 0 ? 'complete' : 'insufficient', candidates,
        metadata: {
          stageId: input.stageId, originalOrigin: input.intent.location.coordinates, sequentialOrigin: input.sequentialOrigin,
          hardRadiusMeters: 5_000, preferredRadiusMeters: 2_000, usedRadiusMeters: 2_000, expansionUsed: false,
          poolCounts: { broad: candidates.length, budgetEvidence: 0, preferenceEvidence: 0, anchor: 0 },
          mergedCandidateCount: candidates.length, deduplicatedCandidateCount: candidates.length, unknownPriceCount: candidates.filter((item) => item.candidateEvidence.priceEvidence === 'unknown').length,
          excludedCount: 0, databaseCallCount: 1, databaseCallCap: 20, databaseCallCapReached: false,
          appliedPreferences: signals.filter((signal) => signal.application.status === 'applied').map((signal) => signal.application),
          unappliedPreferences: signals.filter((signal) => signal.application.status === 'unapplied').map((signal) => signal.application), warnings: [],
        }, issues: candidates.length > 0 ? [] : [{ code: 'no_candidates', message: 'No fixture candidate.', stageId: input.stageId }], warnings: [],
      };
    },
  };
}

function request(value: PlanningIntent, ordinal = 0): GeneratePlanRequestV1 {
  return { requestVersion: 1, intent: value, attempt: { ordinal, excludedCombinations: [] } };
}

async function compose(value: PlanningIntent, values: readonly ReturnType<typeof place>[], anchors: readonly CompositionAnchor[] = [], ordinal = 0, excludedCombinations: readonly string[] = []) {
  return composeDeterministicPlan({ request: { ...request(value, ordinal), attempt: { ordinal, excludedCombinations } }, requestId: 'composition-test', anchors, anchorReviews: [], retrieval: retrievalFor(values) });
}

test('duration policy produces 1, 2, 3, 4 and 5 stops without exceeding target capacity', async () => {
  const values = ['food.cafe', 'food.restaurant', 'attraction.museum', 'outdoor.park', 'entertainment.cinema', 'activity.recreation', 'food.dessert', 'attraction.culture'].map((category, index) => place(index + 1, category));
  for (const [duration, expected] of [[90, 1], [150, 2], [240, 3], [480, 4], [600, 5]] as const) {
    const result = await compose(intent({ schedule: { kind: 'duration', durationMinutes: duration, outingDate: null, startTime: null, timeZone: null } }), values);
    assert.ok(result.outcome === 'proposal' || result.outcome === 'partial_plan');
    assert.equal(result.proposal.state.stops.length, expected);
    assert.ok(result.proposal.state.stops.length <= 5);
  }
});

test('food and activity preferences compose with deterministic alternation', async () => {
  const result = await compose(intent({ food: { state: 'selected', values: ['restaurant'] }, activities: { state: 'selected', values: ['art_museum'] } }), [place(1, 'food.restaurant'), place(2, 'attraction.museum')]);
  assert.equal(result.outcome, 'proposal');
  assert.deepEqual(result.proposal.state.stops.map((stop) => stop.place.category_code), ['food.restaurant', 'attraction.museum']);
});

test('surprise-me ordinal is deterministic and can rotate an alternate valid composition', async () => {
  const values = [place(1, 'food.restaurant'), place(2, 'outdoor.park'), place(3, 'food.cafe'), place(4, 'attraction.museum')];
  const first = await compose(intent({ moods: { state: 'selected', values: ['spontaneous'] } }), values, [], 0);
  const same = await compose(intent({ moods: { state: 'selected', values: ['spontaneous'] } }), values, [], 0);
  const alternate = await compose(intent({ moods: { state: 'selected', values: ['spontaneous'] } }), values, [], 1);
  assert.equal(first.proposal.historyKey, same.proposal.historyKey);
  assert.notEqual(first.proposal.historyKey, alternate.proposal.historyKey);
});

test('must anchors are included exactly once and over-capacity anchors clarify', async () => {
  const anchorOne = place(1, 'food.restaurant');
  const anchorTwo = place(2, 'outdoor.park');
  const anchors: CompositionAnchor[] = [
    { placeId: anchorOne.place_id, intent: 'must_visit', status: 'active', categoryCode: anchorOne.category_code, categoryName: 'Restaurant', categoryActive: true, place: anchorOne },
    { placeId: anchorTwo.place_id, intent: 'must_visit', status: 'active', categoryCode: anchorTwo.category_code, categoryName: 'Park', categoryActive: true, place: anchorTwo },
  ];
  const anchorIntent = { ...intent(), anchors: anchors.map((anchor) => ({ placeId: anchor.placeId, intent: anchor.intent, order: { kind: 'any' as const } })) };
  const result = await compose(anchorIntent, [anchorOne, anchorTwo], anchors);
  assert.equal(result.outcome, 'proposal');
  assert.equal(new Set(result.proposal.state.stops.map((stop) => stop.place.place_id)).size, 2);
  const tooMany = await compose({ ...anchorIntent, schedule: { kind: 'duration', durationMinutes: 90, outingDate: null, startTime: null, timeZone: null } }, [anchorOne, anchorTwo], anchors);
  assert.equal(tooMany.outcome, 'clarification_needed');
});

test('preferred anchors are selected when feasible and omitted softly when not', async () => {
  const preferred = place(1, 'food.cafe');
  const preferredAnchor = { placeId: preferred.place_id, intent: 'preferred' as const, status: 'active', categoryCode: preferred.category_code, categoryName: 'Cafe', categoryActive: true, place: preferred };
  const preferredIntent = { ...intent({ food: { state: 'selected', values: ['cafe'] }, schedule: { kind: 'duration', durationMinutes: 90, outingDate: null, startTime: null, timeZone: null } }), anchors: [{ placeId: preferred.place_id, intent: 'preferred' as const, order: { kind: 'any' as const } }] };
  const result = await compose(preferredIntent, [preferred], [preferredAnchor]);
  assert.equal(result.outcome, 'proposal');
  assert.equal(result.proposal.anchorInclusions[0]?.outcome, 'included');
  const omitted = await compose({ ...preferredIntent, constraints: { excludedPlaceIds: [], excludedCategoryCodes: ['food.cafe'], categoryScope: { kind: 'any' } } }, [preferred], [preferredAnchor]);
  assert.ok(omitted.outcome === 'no_plan' || omitted.outcome === 'clarification_needed' || (omitted.outcome === 'partial_plan' && omitted.proposal.warnings.some((item) => item.code === 'preferred_anchor_omitted')));
});

test('cumulative strict budget rejects a later stop without treating the partial plan as complete', async () => {
  const values = [place(1, 'food.restaurant', { estimated_group_min_minor: 6_000, estimated_group_max_minor: 6_000 }), place(2, 'outdoor.park', { estimated_group_min_minor: 6_000, estimated_group_max_minor: 6_000 })];
  const result = await compose(intent({ budget: { amountMinor: 10_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' } }), values);
  assert.equal(result.outcome, 'partial_plan');
  assert.equal(result.proposal.state.stops.length, 1);
  assert.equal(result.proposal.budgetSummary.knownMaxMinor, 6_000);
});

test('flexible budgets prefer fitting evidence and never invent a ten-percent allowance', async () => {
  const fitting = place(1, 'food.restaurant', { estimated_group_min_minor: 9_000, estimated_group_max_minor: 10_000 });
  const definiteOver = place(2, 'outdoor.park', { estimated_group_min_minor: 10_001, estimated_group_max_minor: 10_001 });
  const result = await compose(intent({ budget: { ...intent().budget, strictness: 'flexible' } }), [fitting, definiteOver]);
  assert.equal(result.proposal.state.stops[0]?.place.place_id, fitting.place_id);
  assert.equal(result.proposal.budgetSummary.affordability, 'verified');
  assert.equal(result.proposal.state.stops.some((stop) => stop.place.place_id === definiteOver.place_id), false);
});

test('currency mismatch is unknown, never zero, and disclosure is preserved', async () => {
  const result = await compose(intent(), [place(1, 'food.restaurant', { currency_code: 'USD' })]);
  assert.equal(result.proposal.budgetSummary.unknownStopCount, 1);
  assert.equal(result.proposal.budgetSummary.currencyMismatchStopCount, 1);
  assert.equal(result.proposal.budgetSummary.affordability, 'unverified');
  assert.ok(result.proposal.warnings.some((item) => item.code === 'currency_mismatch'));
});

test('unsupported romantic/chill signals remain unapplied and do not receive fabricated scoring', async () => {
  const result = await compose(intent({ moods: { state: 'selected', values: ['romantic', 'chill'] } }), [place(1, 'food.restaurant')]);
  assert.ok(result.proposal.unappliedPreferences.some((item) => item.value === 'romantic'));
  assert.ok(result.proposal.unappliedPreferences.some((item) => item.value === 'chill'));
  assert.equal(result.proposal.appliedPreferences.some((item) => item.value === 'romantic' || item.value === 'chill'), false);
});

test('unknown-price exclusion and hard category scope remain hard', async () => {
  const unknown = place(1, 'food.cafe', { has_price: false, currency_code: null, estimated_group_min_minor: null, estimated_group_max_minor: null });
  const excluded = await compose(intent({ budget: { ...intent().budget, unknownPricePolicy: 'exclude' }, constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'only', categoryCodes: ['food.cafe'] } } }), [unknown]);
  assert.ok(excluded.outcome === 'clarification_needed' || excluded.outcome === 'no_plan');
});

test('exact EW UUID deduplication remains true across stages', async () => {
  const same = place(1, 'food.restaurant');
  const result = await compose(intent({ schedule: { kind: 'duration', durationMinutes: 240, outingDate: null, startTime: null, timeZone: null } }), [same]);
  const ids = result.proposal.state.stops.map((stop) => stop.place.place_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('attempt history excludes a previously returned stage combination deterministically', async () => {
  const values = [place(1, 'food.cafe'), place(2, 'food.cafe')];
  const first = await compose(intent({ schedule: { kind: 'duration', durationMinutes: 90, outingDate: null, startTime: null, timeZone: null } }), values);
  const second = await compose(intent({ schedule: { kind: 'duration', durationMinutes: 90, outingDate: null, startTime: null, timeZone: null } }), values, [], 0, [first.proposal.historyKey]);
  assert.notEqual(second.proposal.historyKey, first.proposal.historyKey);
});
