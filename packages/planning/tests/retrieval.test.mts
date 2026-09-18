import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBudget } from '../src/budget.ts';
import { createCandidateRetrievalService, type AnchorCandidateRequest, type CandidateRetrievalRepository, type CandidateSearchRequest, type RetrievalAnchor } from '../src/retrieval.ts';
import type { PlanningIntent } from '../src/intent.ts';
import type { PricedNearbyPlace } from '../src/domain.ts';

const origin = { latitude: 0, longitude: 0 } as const;
const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const thirdId = '00000000-0000-4000-8000-000000000003';

function intent(overrides: Partial<PlanningIntent> = {}): PlanningIntent {
  return {
    planningIntentVersion: 1,
    occasion: 'date',
    location: {
      source: 'selected_area',
      label: 'Synthetic test area',
      coordinates: origin,
      context: { locality: null, city: null, region: null, countryCode: null },
      geography: { kind: 'radius', radiusMeters: 5_000 },
    },
    party: { size: 2, children: null },
    budget: { amountMinor: 1_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
    schedule: { kind: 'duration', durationMinutes: 180, outingDate: null, startTime: null, timeZone: null },
    moods: { state: 'unanswered' },
    food: { state: 'no_preference' },
    activities: { state: 'no_preference' },
    mobility: { state: 'skipped' },
    anchors: [],
    constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
    ...overrides,
  };
}

function place(
  id: string,
  latitude = 0.005,
  longitude = 0,
  categoryCode = 'food.restaurant',
  overrides: Partial<PricedNearbyPlace> = {},
): PricedNearbyPlace {
  return {
    place_id: id,
    name: `Synthetic place ${id.slice(-1)}`,
    category_code: categoryCode,
    category_name: categoryCode,
    address: null,
    city: null,
    region: null,
    country_code: 'PH',
    latitude,
    longitude,
    distance_meters: null,
    has_price: true,
    pricing_basis: 'branch_verified',
    pricing_status: 'current',
    pricing_unit: 'per_group',
    min_amount_minor: 100,
    max_amount_minor: 200,
    currency_code: 'PHP',
    confidence_level: 'HIGH',
    price_precision: 'exact',
    pricing_channel: 'menu',
    price_source_label: 'Synthetic test evidence',
    last_verified_at: '2026-01-01T00:00:00Z',
    effective_price_source: 'branch',
    budget_status: null,
    estimated_group_min_minor: 100,
    estimated_group_max_minor: 200,
    ...overrides,
  };
}

class FakeRepository implements CandidateRetrievalRepository {
  readonly calls: CandidateSearchRequest[] = [];
  readonly anchorCalls: AnchorCandidateRequest[] = [];
  readonly chainCalls: string[][] = [];
  private readonly nearby: (request: CandidateSearchRequest) => readonly PricedNearbyPlace[];
  private readonly anchor: ((request: AnchorCandidateRequest) => PricedNearbyPlace | null) | undefined;
  private readonly chains: ((placeIds: readonly string[]) => readonly { placeId: string; chainId: string }[]) | undefined;
  constructor(
    nearby: (request: CandidateSearchRequest) => readonly PricedNearbyPlace[] = () => [],
    anchor: ((request: AnchorCandidateRequest) => PricedNearbyPlace | null) | undefined = undefined,
    chains: ((placeIds: readonly string[]) => readonly { placeId: string; chainId: string }[]) | undefined = undefined,
  ) {
    this.nearby = nearby;
    this.anchor = anchor;
    this.chains = chains;
  }
  async findNearbyCandidates(request: CandidateSearchRequest): Promise<readonly PricedNearbyPlace[]> {
    this.calls.push(request);
    return this.nearby(request);
  }
  async findAnchorCandidate(request: AnchorCandidateRequest): Promise<PricedNearbyPlace | null> {
    this.anchorCalls.push(request);
    return this.anchor?.(request) ?? null;
  }
  async findChainMemberships(placeIds: readonly string[]): Promise<readonly { placeId: string; chainId: string }[]> {
    this.chainCalls.push([...placeIds]);
    return this.chains?.(placeIds) ?? [];
  }
}

function service(repository: CandidateRetrievalRepository, maxDatabaseCalls?: number) {
  return createCandidateRetrievalService(repository, maxDatabaseCalls === undefined ? {} : { maxDatabaseCalls });
}

function retrieve(repository: CandidateRetrievalRepository, value: PlanningIntent, options: Partial<Parameters<ReturnType<typeof service>['retrieve']>[0]> = {}) {
  return service(repository).retrieve({ stageId: 'stage-1', sequentialOrigin: origin, ...options, intent: value });
}

test('keeps candidates inside both sequential and original hard geography', async () => {
  const inside = place(firstId, 0.01);
  const drifted = place(secondId, 0.04);
  const repository = new FakeRepository((request) => request.radiusMeters >= 2_000 ? [inside, drifted] : []);
  const result = await retrieve(repository, intent({ location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 3_000 } }, mobility: { state: 'selected', value: 'keep_close' } }));
  assert.deepEqual(result.candidates.map((candidate) => candidate.place_id), [firstId]);
  assert.equal(result.metadata.expansionUsed, false);
  assert.equal(result.metadata.originalDistanceMeters, undefined);
  assert.equal(result.candidates[0]?.candidateEvidence.originalDistanceMeters < 3_000, true);
});

test('a chained retrieval cannot drift outside original geography and expansion never exceeds it', async () => {
  const drifted = place(firstId, 0.04);
  const repository = new FakeRepository((request) => request.radiusMeters >= 3_000 ? [drifted] : []);
  const result = await retrieve(repository, intent({ location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 3_000 } }, mobility: { state: 'selected', value: 'keep_close' } }));
  assert.equal(result.candidates.length, 0);
  assert.equal(result.metadata.expansionUsed, true);
  assert.deepEqual(repository.calls.map((call) => call.radiusMeters), [2_000, 2_000, 3_000, 3_000]);
  assert.equal(Math.max(...repository.calls.map((call) => call.radiusMeters)), 3_000);
});

test('uses the centralized mobility radii before one hard-radius expansion', async () => {
  for (const [mobility, expected] of [
    [{ state: 'selected', value: 'keep_close' }, 2_000],
    [{ state: 'selected', value: 'short_rides_ok' }, 5_000],
    [{ state: 'selected', value: 'flexible' }, 10_000],
    [{ state: 'skipped' }, 5_000],
  ] as const) {
    const repository = new FakeRepository(() => []);
    const result = await retrieve(repository, intent({ location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 20_000 } }, mobility }));
    assert.equal(result.metadata.preferredRadiusMeters, expected);
    assert.equal(repository.calls[0]?.radiusMeters, expected);
    assert.equal(result.metadata.expansionUsed, true);
    assert.equal(repository.calls.at(-1)?.radiusMeters, 20_000);
  }
});

test('enforces bounded pools and deduplicates one EW UUID across evidence slices', async () => {
  const duplicate = place(firstId, 0.001);
  const broad = Array.from({ length: 70 }, (_, index) => place(`00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`, 0.001 + index / 100_000, 0, 'food.cafe', { has_price: false, currency_code: null, estimated_group_min_minor: null, estimated_group_max_minor: null }));
  const repository = new FakeRepository((request) => request.pool === 'broad' ? [duplicate, ...broad] : [duplicate]);
  const result = await retrieve(repository, intent({ food: { state: 'selected', values: ['restaurant'] } }), { requiredCandidateCount: 1 });
  assert.equal(result.metadata.poolCounts.broad <= 50, true);
  assert.equal(result.metadata.poolCounts.budgetEvidence <= 12, true);
  assert.equal(result.metadata.poolCounts.preferenceEvidence <= 16, true);
  assert.equal(result.metadata.deduplicatedCandidateCount, new Set(result.candidates.map((candidate) => candidate.place_id)).size);
  assert.equal(result.candidates.filter((candidate) => candidate.place_id === firstId).length, 1);
  assert.equal(result.candidates[0]?.candidateEvidence.sourcePools.includes('broad'), true);
  assert.equal(result.candidates[0]?.candidateEvidence.sourcePools.includes('preference_evidence'), true);
});

test('active catalog and hard category scope are enforced locally as a second defense', async () => {
  const inactive = place(firstId, 0.001, 0, 'food.cafe', { status: 'inactive' } as Partial<PricedNearbyPlace>);
  const wrongCategory = place(secondId, 0.001, 0, 'food.restaurant');
  const valid = place(thirdId, 0.001, 0, 'food.cafe');
  const repository = new FakeRepository(() => [inactive, wrongCategory, valid]);
  const result = await retrieve(repository, intent({ constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'only', categoryCodes: ['food.cafe'] } } }));
  assert.deepEqual(result.candidates.map((candidate) => candidate.place_id), [thirdId]);
});

test('exclusions remain hard during fallback expansion', async () => {
  const excluded = place(firstId, 0.001);
  const repository = new FakeRepository((request) => request.radiusMeters > 2_000 ? [excluded] : []);
  const result = await retrieve(repository, intent({ location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 3_000 } }, mobility: { state: 'selected', value: 'keep_close' }, constraints: { excludedPlaceIds: [firstId], excludedCategoryCodes: [], categoryScope: { kind: 'any' } } }));
  assert.equal(result.candidates.length, 0);
  assert.equal(result.metadata.excludedCount > 0, true);
});

test('same-currency strict budget rejects over-cap and crossing ranges; flexible has no hidden tolerance', async () => {
  const crossing = place(firstId, 0.001, 0, 'food.restaurant', { min_amount_minor: 100, max_amount_minor: 1_100, estimated_group_min_minor: 100, estimated_group_max_minor: 1_100 });
  const over = place(secondId, 0.001, 0, 'food.restaurant', { min_amount_minor: 1_001, max_amount_minor: 1_200, estimated_group_min_minor: 1_001, estimated_group_max_minor: 1_200 });
  const strictRepository = new FakeRepository(() => [crossing, over]);
  const strict = await retrieve(strictRepository, intent());
  assert.equal(strict.candidates.length, 0);
  const flexible = await retrieve(new FakeRepository(() => [over]), intent({ budget: { ...intent().budget, strictness: 'flexible' } }));
  assert.equal(flexible.candidates.length, 1);
  assert.equal(flexible.candidates[0]?.candidateEvidence.affordability, 'exceeds');
});

test('currency mismatch and unknown prices stay unknown, following explicit policy', async () => {
  const mismatch = place(firstId, 0.001, 0, 'food.restaurant', { currency_code: 'USD' });
  const unknown = place(secondId, 0.001, 0, 'food.restaurant', { has_price: false, currency_code: null, estimated_group_min_minor: null, estimated_group_max_minor: null });
  const allowed = await retrieve(new FakeRepository(() => [mismatch, unknown]), intent());
  assert.equal(allowed.candidates.length, 2);
  assert.equal(allowed.metadata.unknownPriceCount, 2);
  assert.equal(allowed.warnings.some((warning) => warning.code === 'currency_mismatch'), true);
  const excluded = await retrieve(new FakeRepository(() => [mismatch, unknown]), intent({ budget: { ...intent().budget, unknownPricePolicy: 'exclude' } }));
  assert.equal(excluded.candidates.length, 0);
});

test('per-person budget multiplication and overflow remain centralized', async () => {
  const normalized = normalizeBudget({ amountMinor: 100, currencyCode: 'PHP', basis: 'per_person', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' }, 2);
  assert.equal(normalized?.totalAmountMinor, 200);
  const fitting = place(firstId, 0.001, 0, 'food.restaurant', { estimated_group_min_minor: 150, estimated_group_max_minor: 200, min_amount_minor: 150, max_amount_minor: 200 });
  const result = await retrieve(new FakeRepository(() => [fitting]), intent({ party: { size: 2, children: null }, budget: { ...intent().budget, amountMinor: 100, basis: 'per_person' } }));
  assert.equal(result.candidates.length, 1);
  const overflow = await retrieve(new FakeRepository(() => [fitting]), intent({ party: { size: 50, children: null }, budget: { ...intent().budget, amountMinor: Number.MAX_SAFE_INTEGER, basis: 'per_person' } }));
  assert.equal(overflow.issues[0]?.code, 'invalid_request');
});

test('supported preference evidence is applied conservatively and unsupported values are reported', async () => {
  const cafe = place(firstId, 0.001, 0, 'food.cafe');
  const result = await retrieve(new FakeRepository(() => [cafe]), intent({ food: { state: 'selected', values: ['cafe'] }, moods: { state: 'selected', values: ['romantic'] } }));
  assert.equal(result.candidates[0]?.candidateEvidence.preferenceSignals.includes('food:cafe'), true);
  assert.equal(result.candidates[0]?.candidateEvidence.preferenceSignals.some((signal) => signal.includes('romantic')), false);
  assert.equal(result.metadata.appliedPreferences.some((preference) => preference.value === 'cafe'), true);
  assert.equal(result.metadata.unappliedPreferences.some((preference) => preference.value === 'romantic'), true);
  assert.equal(result.warnings.some((warning) => warning.code === 'unsupported_preference' && warning.preference === 'romantic'), true);
});

test('validated anchors are represented exactly once and preferred anchors remain soft evidence', async () => {
  const anchorPlace = place(firstId, 0.001);
  const anchor: RetrievalAnchor = { placeId: firstId, intent: 'must_visit', categoryCode: 'food.restaurant', categoryActive: true, status: 'active', place: anchorPlace };
  const preferredPlace = place(secondId, 0.002);
  const preferred: RetrievalAnchor = { placeId: secondId, intent: 'preferred', categoryCode: 'food.restaurant', categoryActive: true, status: 'active', place: preferredPlace };
  const repository = new FakeRepository(() => [anchorPlace, preferredPlace], (request) => request.anchor.placeId === firstId ? anchorPlace : preferredPlace);
  const result = await retrieve(repository, intent({ anchors: [{ placeId: firstId, intent: 'must_visit', order: { kind: 'any' } }, { placeId: secondId, intent: 'preferred', order: { kind: 'any' } }] }), { anchors: [anchor, preferred] });
  assert.equal(result.candidates.filter((candidate) => candidate.place_id === firstId).length, 1);
  assert.equal(result.candidates.find((candidate) => candidate.place_id === firstId)?.candidateEvidence.anchorIntent, 'must_visit');
  assert.equal(result.candidates.find((candidate) => candidate.place_id === secondId)?.candidateEvidence.anchorIntent, 'preferred');
});

test('chain metadata is requested only for the bounded deduplicated candidate IDs', async () => {
  const one = place(firstId, 0.001);
  const two = place(secondId, 0.002);
  const repository = new FakeRepository(() => [one, two], undefined, (ids) => ids.map((placeId) => ({ placeId, chainId: `chain-${placeId.slice(-1)}` })));
  const result = await retrieve(repository, intent({ budget: { ...intent().budget, unknownPricePolicy: 'allow_with_disclosure' } }), { requiredCandidateCount: 2 });
  assert.equal(repository.chainCalls.length, 1);
  assert.deepEqual(repository.chainCalls[0]?.sort(), [firstId, secondId].sort());
  assert.equal(result.candidates.every((candidate) => candidate.candidateEvidence.chainId?.startsWith('chain-')), true);
});

test('database call cap and repository failures are typed without leaking internals', async () => {
  const cappedRepository = new FakeRepository(() => []);
  const capped = await service(cappedRepository, 1).retrieve({ stageId: 'stage-1', sequentialOrigin: origin, intent: intent() });
  assert.equal(capped.outcome, 'policy_blocked');
  assert.equal(capped.metadata.databaseCallCount, 1);
  assert.equal(capped.metadata.databaseCallCap, 1);
  const failing: CandidateRetrievalRepository = { findNearbyCandidates: async () => { throw new Error('SQL secret should not escape'); } };
  const failed = await retrieve(failing, intent());
  assert.equal(failed.outcome, 'error');
  assert.equal(failed.issues[0]?.code, 'database_error');
  assert.equal(failed.issues[0]?.message.includes('SQL'), false);
});
