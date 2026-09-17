import assert from 'node:assert/strict';
import test from 'node:test';
import type { GoogleMatchStatus, GooglePlaceMatchResult } from '../../../supabase/functions/_shared/google-place-identity/types.ts';
import {
  GoogleIdentityInputError,
  GoogleIdentityService,
  type GoogleIdentityRepository,
  type StoredGoogleIdentityPlace,
  validateGoogleIdentityRequest,
} from '../../../supabase/functions/ensure-google-place-identity/service.ts';

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
] as const;

function place(id: string, status: GoogleMatchStatus, overrides: Partial<StoredGoogleIdentityPlace> = {}): StoredGoogleIdentityPlace {
  return {
    id,
    name: `Place ${id.at(-1)}`,
    address: 'Makati Avenue',
    city: 'Makati',
    district: null,
    region: 'Metro Manila',
    countryCode: 'PH',
    categoryCode: 'food.restaurant',
    latitude: 14.55,
    longitude: 121.02,
    source: 'foursquare_os',
    sourcePlaceId: id,
    googlePlaceId: status === 'matched' ? `google-${id}` : null,
    googleMatchStatus: status,
    googleMatchConfidence: status === 'matched' ? 0.95 : null,
    googleMatchCheckedAt: status === 'not_checked' ? null : '2026-09-14T00:00:00.000Z',
    googlePlaceIdRefreshedAt: status === 'matched' ? '2026-09-14T00:00:00.000Z' : null,
    googleMatchAlgorithmVersion: status === 'not_checked' ? null : 'google-text-v1.1.0',
    ...overrides,
  };
}

function matchResult(id: string, status: Exclude<GoogleMatchStatus, 'not_checked'> = 'matched'): GooglePlaceMatchResult {
  return {
    ewPlaceId: id,
    bestGooglePlaceId: status === 'matched' ? `new-google-${id}` : status === 'error' ? null : `candidate-${id}`,
    status,
    confidence: status === 'error' ? null : 0.95,
    candidateCount: status === 'error' ? 0 : 1,
    nameSimilarity: status === 'error' ? null : 1,
    coordinateDistanceMeters: status === 'error' ? null : 10,
    localitySupport: status === 'error' ? null : 1,
    categorySupport: status === 'error' ? null : 1,
    ambiguityReason: null,
    reason: status === 'error' ? 'Google failed.' : 'test',
    algorithmVersion: 'google-text-v1.1.0',
    apiCallCount: 1,
    candidates: [],
  };
}

class MemoryRepository implements GoogleIdentityRepository {
  readonly records = new Map<string, StoredGoogleIdentityPlace>();
  writes = 0;

  constructor(places: readonly StoredGoogleIdentityPlace[]) {
    for (const item of places) this.records.set(item.id, item);
  }

  async readPlaces(placeIds: readonly string[]): Promise<readonly StoredGoogleIdentityPlace[]> {
    return placeIds.flatMap((id) => this.records.get(id) ?? []);
  }

  async persistIfStatus(current: StoredGoogleIdentityPlace, expected: 'not_checked' | 'error', result: GooglePlaceMatchResult, checkedAt: string): Promise<StoredGoogleIdentityPlace> {
    const latest = this.records.get(current.id)!;
    if (latest.googleMatchStatus !== expected) return latest;
    this.writes += 1;
    const saved: StoredGoogleIdentityPlace = {
      ...latest,
      googlePlaceId: result.status === 'matched' ? result.bestGooglePlaceId : null,
      googleMatchStatus: result.status,
      googleMatchConfidence: result.confidence,
      googleMatchCheckedAt: checkedAt,
      googlePlaceIdRefreshedAt: result.status === 'matched' ? checkedAt : null,
      googleMatchAlgorithmVersion: result.algorithmVersion,
    };
    this.records.set(current.id, saved);
    return saved;
  }
}

for (const status of ['matched', 'unmatched', 'needs_review', 'ambiguous'] as const) {
  test(`${status} identity returns its stored state with zero Google calls`, async () => {
    const repository = new MemoryRepository([place(ids[0], status)]);
    let calls = 0;
    const service = new GoogleIdentityService(repository, async (candidate) => { calls += 1; return matchResult(candidate.id); });
    const [result] = await service.ensure([ids[0]]);
    assert.equal(calls, 0);
    assert.equal(repository.writes, 0);
    assert.equal(result?.google_api_calls, 0);
    assert.equal(result?.google_match_status, status);
  });
}

test('not_checked invokes the production matcher once and stores a matched Place ID', async () => {
  const repository = new MemoryRepository([place(ids[0], 'not_checked')]);
  let calls = 0;
  const service = new GoogleIdentityService(repository, async (candidate) => { calls += 1; return matchResult(candidate.id); });
  const [result] = await service.ensure([ids[0]]);
  assert.equal(calls, 1);
  assert.equal(repository.writes, 1);
  assert.equal(result?.google_match_status, 'matched');
  assert.equal(result?.google_place_id, `new-google-${ids[0]}`);
  assert.equal(result?.google_match_algorithm_version, 'google-text-v1.1.0');
});

test('a non-matched terminal result never stores a Google Place ID', async () => {
  for (const status of ['unmatched', 'needs_review', 'ambiguous', 'error'] as const) {
    const repository = new MemoryRepository([place(ids[0], 'not_checked')]);
    const service = new GoogleIdentityService(repository, async (candidate) => matchResult(candidate.id, status));
    const [result] = await service.ensure([ids[0]]);
    assert.equal(result?.google_match_status, status);
    assert.equal(result?.google_place_id, null);
    assert.equal(repository.records.get(ids[0])?.googlePlaceId, null);
  }
});

test('validates maximum batch size and rejects malformed UUIDs', () => {
  assert.deepEqual(validateGoogleIdentityRequest({ place_ids: ids.slice(0, 5) }), ids.slice(0, 5));
  assert.throws(() => validateGoogleIdentityRequest({ place_ids: ids }), (error: unknown) => error instanceof GoogleIdentityInputError && error.code === 'batch_too_large');
  assert.throws(() => validateGoogleIdentityRequest({ place_ids: ['not-a-uuid'] }), (error: unknown) => error instanceof GoogleIdentityInputError && error.code === 'invalid_place_id');
});

test('one Google failure persists error without corrupting other batch results', async () => {
  const repository = new MemoryRepository([place(ids[0], 'not_checked'), place(ids[1], 'not_checked')]);
  const service = new GoogleIdentityService(repository, async (candidate) => matchResult(candidate.id, candidate.id === ids[0] ? 'error' : 'matched'));
  const results = await service.ensure([ids[0], ids[1]]);
  assert.deepEqual(results.map((result) => result.google_match_status), ['error', 'matched']);
  assert.equal(repository.records.get(ids[0])?.googlePlaceId, null);
  assert.equal(repository.records.get(ids[1])?.googlePlaceId, `new-google-${ids[1]}`);
});

test('simultaneous requests share one in-flight match and later matched requests make no Google call', async () => {
  const repository = new MemoryRepository([place(ids[0], 'not_checked')]);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const service = new GoogleIdentityService(repository, async (candidate) => { calls += 1; await gate; return matchResult(candidate.id); });
  const first = service.ensure([ids[0]]);
  const second = service.ensure([ids[0]]);
  await Promise.resolve();
  release();
  const simultaneous = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(simultaneous.flat().reduce((total, result) => total + result.google_api_calls, 0), 1);
  await service.ensure([ids[0]]);
  assert.equal(calls, 1);
});

test('one request never runs more than three Google matches concurrently', async () => {
  const repository = new MemoryRepository(ids.slice(0, 5).map((id) => place(id, 'not_checked')));
  let active = 0;
  let maximum = 0;
  const service = new GoogleIdentityService(repository, async (candidate) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return matchResult(candidate.id);
  });
  await service.ensure(ids.slice(0, 5));
  assert.equal(maximum, 3);
});

test('ordinary repeat calls never retry unmatched or review states', async () => {
  for (const status of ['unmatched', 'needs_review'] as const) {
    const repository = new MemoryRepository([place(ids[0], 'not_checked')]);
    let calls = 0;
    const service = new GoogleIdentityService(repository, async (candidate) => { calls += 1; return matchResult(candidate.id, status); });
    await service.ensure([ids[0]]);
    await service.ensure([ids[0]]);
    assert.equal(calls, 1);
  }
});

test('error retries are spaced by the conservative retry interval', async () => {
  let calls = 0;
  const matcher = async (candidate: { id: string }) => { calls += 1; return matchResult(candidate.id, 'matched'); };
  const recentRepository = new MemoryRepository([place(ids[0], 'error', { googleMatchCheckedAt: '2026-09-14T12:00:00.000Z' })]);
  const recent = new GoogleIdentityService(recentRepository, matcher, () => new Date('2026-09-15T00:00:00.000Z'));
  await recent.ensure([ids[0]]);
  assert.equal(calls, 0);
  const staleRepository = new MemoryRepository([place(ids[0], 'error', { googleMatchCheckedAt: '2026-09-13T00:00:00.000Z' })]);
  const stale = new GoogleIdentityService(staleRepository, matcher, () => new Date('2026-09-15T00:00:00.000Z'));
  await stale.ensure([ids[0]]);
  assert.equal(calls, 1);
});
