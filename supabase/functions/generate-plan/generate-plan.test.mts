import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyBudgetStatus,
  classifyPriceEvidence,
  multiplyMinorUnits,
  normalizeBudgetMinor,
} from '../../../packages/planning/src/budget.ts';
import {
  type GeneratePlanResponseV1,
} from '../../../packages/planning/src/contracts.ts';
import { type PlanningIntent } from '../../../packages/planning/src/intent.ts';
import type { CandidateRetrievalRepository, CandidateSearchRequest } from '../../../packages/planning/src/retrieval.ts';
import { authContextForTests, createRequestAuthenticator } from './auth.ts';
import { createGeneratePlanHandler } from './handler.ts';
import { createDeterministicPlannerGenerator } from './generator.ts';
import { createInMemoryRateLimiter } from './rate-limit.ts';
import type { AnchorCatalogRecord, PlannerGenerationInput, PlannerLogEvent, PlanningBoundaryRepository } from './types.ts';

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

function intent(overrides: Partial<PlanningIntent> = {}): PlanningIntent {
  return {
    planningIntentVersion: 1,
    occasion: 'date',
    location: {
      source: 'selected_area',
      label: 'Test area',
      coordinates: { latitude: 14.55, longitude: 121.05 },
      context: { locality: null, city: null, region: null, countryCode: 'PH' },
      geography: { kind: 'radius', radiusMeters: 5_000 },
    },
    party: { size: 2, children: null },
    budget: { amountMinor: 100_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
    schedule: { kind: 'duration', durationMinutes: 150, outingDate: null, startTime: null, timeZone: null },
    moods: { state: 'selected', values: ['romantic'] },
    food: { state: 'selected', values: ['cafe'] },
    activities: { state: 'selected', values: ['art_museum'] },
    mobility: { state: 'selected', value: 'keep_close' },
    anchors: [],
    constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
    ...overrides,
  };
}

function body(overrides: Partial<{ requestVersion: number; intent: PlanningIntent; draftRevision: number; attempt: unknown }> = {}) {
  return {
    requestVersion: 1,
    intent: intent(),
    draftRevision: 7,
    attempt: { ordinal: 0, excludedCombinations: [] },
    ...overrides,
  };
}

function placeRecord(placeId: string, overrides: Partial<AnchorCatalogRecord> = {}): AnchorCatalogRecord {
  return {
    placeId,
    status: 'active',
    categoryCode: 'food.restaurant',
    categoryName: 'Restaurant',
    categoryActive: true,
    place: {
      place_id: placeId,
      name: `Place ${placeId.slice(-2)}`,
      category_code: 'food.restaurant',
      category_name: 'Restaurant',
      address: null,
      city: 'Makati',
      region: 'Metro Manila',
      country_code: 'PH',
      latitude: 14.55,
      longitude: 121.05,
      has_price: false,
      pricing_basis: null,
      pricing_status: null,
      pricing_unit: null,
      min_amount_minor: null,
      max_amount_minor: null,
      currency_code: null,
      confidence_level: null,
      price_precision: null,
      pricing_channel: null,
      price_source_label: null,
      last_verified_at: null,
      effective_price_source: null,
      budget_status: null,
      estimated_group_min_minor: null,
      estimated_group_max_minor: null,
      google_place_id: null,
      google_match_confidence: null,
    },
    ...overrides,
  };
}

function repository(records: readonly AnchorCatalogRecord[] = [], activeCategories: readonly string[] = []): PlanningBoundaryRepository {
  return {
    readAnchors: async (placeIds) => records.filter((record) => placeIds.includes(record.placeId)),
    findActivePlaces: async (placeIds) => records.filter((record) => placeIds.includes(record.placeId) && record.status === 'active' && record.categoryActive && record.place !== null).map((record) => record.place!),
    findActiveCategories: async (codes) => activeCategories.filter((code) => codes.includes(code)).map((code) => ({ code, name: code, isActive: true })),
  };
}

function pricedPlace(placeId: string, categoryCode: string, overrides: Record<string, unknown> = {}) {
  return {
    ...placeRecord(placeId).place!,
    category_code: categoryCode,
    category_name: categoryCode,
    has_price: true,
    pricing_basis: 'branch_verified',
    pricing_status: 'current',
    pricing_unit: 'per_group',
    currency_code: 'PHP',
    estimated_group_min_minor: 1_000,
    estimated_group_max_minor: 2_000,
    ...overrides,
  };
}

function candidateRepository(values: readonly ReturnType<typeof pricedPlace>[], records: readonly AnchorCatalogRecord[] = [], activeCategories: readonly string[] = []): PlanningBoundaryRepository & CandidateRetrievalRepository {
  const boundary = repository(records, activeCategories);
  return {
    ...boundary,
    findNearbyCandidates: async (query: CandidateSearchRequest) => values.filter((value) => query.categoryCodes.length === 0 || query.categoryCodes.some((code) => value.category_code === code || value.category_code.startsWith(`${code}.`) || code.startsWith(`${value.category_code}.`))),
    findAnchorCandidate: async ({ anchor }) => values.find((value) => value.place_id.toLowerCase() === anchor.placeId.toLowerCase()) ?? null,
    findChainMemberships: async () => [],
  };
}

function request(value: unknown, init: RequestInit = {}): Request {
  return new Request('https://example.test/generate-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: 'public-test-key' },
    body: JSON.stringify(value),
    ...init,
  });
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function makeHandler(options: Partial<Parameters<typeof createGeneratePlanHandler>[0]> = {}) {
  const events: PlannerLogEvent[] = [];
  let generatorCalls = 0;
  const generator = async (input: PlannerGenerationInput): Promise<GeneratePlanResponseV1> => {
    generatorCalls += 1;
    return {
      responseVersion: 1,
      requestId: input.requestId,
      outcome: 'no_plan',
      issues: [{ code: 'no_candidates', message: 'No candidates were requested in this boundary test.' }],
      anchorReviews: [],
    };
  };
  const handler = createGeneratePlanHandler({
    repository: repository(),
    authorize: async () => authContextForTests(),
    generator,
    rateLimiter: () => false,
    logger: (event) => events.push(event),
    requestId: () => 'request-test-1',
    now: () => 1_000,
    ...options,
  });
  return { handler, events, get generatorCalls() { return generatorCalls; } };
}

test('HTTP boundary rejects wrong method, content type, malformed JSON, and oversized bodies', async () => {
  const wrongMethod = makeHandler();
  assert.equal((await wrongMethod.handler(new Request('https://example.test/generate-plan', { method: 'GET' }))).status, 405);
  assert.equal((await wrongMethod.handler(new Request('https://example.test/generate-plan', { method: 'POST', body: '{}' }))).status, 415);
  const wrongContentType = makeHandler();
  const wrongTypeResponse = await wrongContentType.handler(request(body(), { headers: { 'content-type': 'text/plain', apikey: 'public-test-key' } }));
  assert.equal(wrongTypeResponse.status, 415);
  const invalidJson = makeHandler();
  const invalidJsonResponse = await invalidJson.handler(new Request('https://example.test/generate-plan', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'public-test-key' }, body: '{' }));
  assert.equal(invalidJsonResponse.status, 400);
  const tooLarge = makeHandler();
  const largeResponse = await tooLarge.handler(new Request('https://example.test/generate-plan', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'public-test-key', 'content-length': '20000' }, body: '{}' }));
  assert.equal(largeResponse.status, 413);
  const actualLarge = makeHandler();
  const actualLargeResponse = await actualLarge.handler(new Request('https://example.test/generate-plan', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'public-test-key' }, body: JSON.stringify({ payload: 'x'.repeat(17_000) }) }));
  assert.equal(actualLargeResponse.status, 413);
});

test('OPTIONS is supported only for CORS preflight and responses are JSON envelopes', async () => {
  const { handler } = makeHandler();
  const optionsResponse = await handler(new Request('https://example.test/generate-plan', { method: 'OPTIONS' }));
  assert.equal(optionsResponse.status, 204);
  assert.equal(optionsResponse.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  const response = await handler(request(body()));
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal((await jsonResponse(response)).responseVersion, 1);
});

test('contract validation rejects version, enum, party, coordinate, radius, anchor, and attempt violations before the generator', async () => {
  const cases: readonly [string, unknown][] = [
    ['version', body({ requestVersion: 2 })],
    ['enum', body({ intent: intent({ occasion: 'unknown' as PlanningIntent['occasion'] }) })],
    ['party low', body({ intent: intent({ party: { size: 0, children: null } as PlanningIntent['party'] }) })],
    ['party high', body({ intent: intent({ party: { size: 51, children: null } as PlanningIntent['party'] }) })],
    ['currency shape', body({ intent: intent({ budget: { ...intent().budget, currencyCode: 'US' as PlanningIntent['budget']['currencyCode'] } }) })],
    ['latitude', body({ intent: intent({ location: { ...intent().location, coordinates: { latitude: 91, longitude: 121.05 } } }) })],
    ['radius low', body({ intent: intent({ location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 0 } } }) })],
    ['radius high', body({ intent: intent({ location: { ...intent().location, geography: { kind: 'radius', radiusMeters: 50_001 } } }) })],
    ['anchor count', body({ intent: intent({ anchors: Array.from({ length: 7 }, (_, index) => ({ placeId: id(index + 1), intent: 'preferred', order: { kind: 'any' } })) }) })],
    ['attempt ordinal', body({ attempt: { ordinal: 5, excludedCombinations: [] } })],
    ['attempt history', body({ attempt: { ordinal: 0, excludedCombinations: Array.from({ length: 7 }, (_, index) => `stage:${index}`) } })],
    ['category query union', body({ intent: intent({ constraints: {
      excludedPlaceIds: [],
      excludedCategoryCodes: Array.from({ length: 10 }, (_, index) => `excluded.${index}`),
      categoryScope: { kind: 'only', categoryCodes: Array.from({ length: 11 }, (_, index) => `only.${index}`) },
    } }) })],
  ];
  for (const [name, value] of cases) {
    const testHandler = makeHandler();
    const response = await testHandler.handler(request(value));
    assert.ok(response.status === 400 || response.status === 422, name);
    assert.equal(testHandler.generatorCalls, 0, name);
  }
});

test('duplicate and excluded anchors return clarification outcomes without database work', async () => {
  const duplicate = id(1);
  const duplicateHandler = makeHandler();
  const duplicateResponse = await duplicateHandler.handler(request(body({ intent: intent({ anchors: [
    { placeId: duplicate, intent: 'must_visit', order: { kind: 'any' } },
    { placeId: duplicate, intent: 'preferred', order: { kind: 'any' } },
  ] }) })));
  const duplicateJson = await jsonResponse(duplicateResponse);
  assert.equal(duplicateResponse.status, 422);
  assert.equal(duplicateJson.outcome, 'clarification_needed');
  assert.equal((duplicateJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_duplicate');

  const excludedHandler = makeHandler();
  const excludedResponse = await excludedHandler.handler(request(body({ intent: intent({
    anchors: [{ placeId: duplicate, intent: 'must_visit', order: { kind: 'any' } }],
    constraints: { excludedPlaceIds: [duplicate], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
  }) })));
  const excludedJson = await jsonResponse(excludedResponse);
  assert.equal(excludedResponse.status, 422);
  assert.equal((excludedJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_excluded');
});

test('unsupported locality is a clarification and never reaches repository or generator', async () => {
  let repositoryCalls = 0;
  const { handler, generatorCalls } = makeHandler({
    repository: {
      ...repository(),
      findActiveCategories: async () => { repositoryCalls += 1; return []; },
      readAnchors: async () => { repositoryCalls += 1; return []; },
    },
  });
  const response = await handler(request(body({ intent: intent({ location: { ...intent().location, geography: { kind: 'locality', localityId: 'untrusted-label' } } }) })));
  const parsed = await jsonResponse(response);
  assert.equal(response.status, 422);
  assert.equal(parsed.outcome, 'clarification_needed');
  assert.equal((parsed.issues as Array<{ code: string }>)[0]?.code, 'unsupported_geography');
  assert.equal(repositoryCalls, 0);
  assert.equal(generatorCalls, 0);
});

test('anchor validation distinguishes missing/inactive, outside, excluded-category, scope conflict, and valid anchors', async () => {
  const anchor = id(1);
  const missing = makeHandler({ repository: repository() });
  const missingResponse = await missing.handler(request(body({ intent: intent({ anchors: [{ placeId: anchor, intent: 'must_visit', order: { kind: 'any' } }] }) })));
  const missingJson = await jsonResponse(missingResponse);
  assert.equal(missingJson.issues && missingResponse.status, 422);
  assert.equal((missingJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_inactive');

  const inactive = makeHandler({ repository: repository([placeRecord(anchor, { status: 'inactive' })]) });
  const inactiveJson = await jsonResponse(await inactive.handler(request(body({ intent: intent({ anchors: [{ placeId: anchor, intent: 'must_visit', order: { kind: 'any' } }] }) }))));
  assert.equal((inactiveJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_inactive');

  const outside = placeRecord(anchor, { place: { ...placeRecord(anchor).place!, latitude: 15.55 } });
  const outsideHandler = makeHandler({ repository: repository([outside]) });
  const outsideJson = await jsonResponse(await outsideHandler.handler(request(body({ intent: intent({ anchors: [{ placeId: anchor, intent: 'must_visit', order: { kind: 'any' } }] }) }))));
  assert.equal((outsideJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_outside_geography');

  const excludedCategory = placeRecord(anchor);
  const excludedCategoryHandler = makeHandler({ repository: repository([excludedCategory], ['food.restaurant']) });
  const excludedCategoryJson = await jsonResponse(await excludedCategoryHandler.handler(request(body({ intent: intent({
    anchors: [{ placeId: anchor, intent: 'preferred', order: { kind: 'any' } }],
    constraints: { excludedPlaceIds: [], excludedCategoryCodes: ['food.restaurant'], categoryScope: { kind: 'any' } },
  }) }))));
  assert.equal((excludedCategoryJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_excluded');

  const scopeHandler = makeHandler({ repository: repository([excludedCategory], ['food.cafe']) });
  const scopeJson = await jsonResponse(await scopeHandler.handler(request(body({ intent: intent({
    anchors: [{ placeId: anchor, intent: 'must_visit', order: { kind: 'any' } }],
    constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'only', categoryCodes: ['food.cafe'] } },
  }) }))));
  assert.equal((scopeJson.issues as Array<{ code: string }>)[0]?.code, 'anchor_scope_conflict');

  const validId = id(2);
  const validHandler = makeHandler({ repository: repository([placeRecord(anchor), placeRecord(validId)]) });
  const validJson = await jsonResponse(await validHandler.handler(request(body({ intent: intent({ anchors: [
    { placeId: anchor, intent: 'must_visit', order: { kind: 'any' } },
    { placeId: validId, intent: 'preferred', order: { kind: 'any' } },
  ] }) }))));
  assert.equal(validJson.outcome, 'no_plan');
  const reviews = validJson.anchorReviews as Array<{ placeId: string; intent: string; status: string; checkedRevision?: number }>;
  assert.deepEqual(reviews.map((review) => [review.placeId, review.intent, review.status, review.checkedRevision]), [
    [anchor, 'must_visit', 'valid', 7],
    [validId, 'preferred', 'valid', 7],
  ]);
});

test('valid requests reach the injected generator, while repository failures become retryable errors', async () => {
  let input: PlannerGenerationInput | null = null;
  const success = makeHandler({
    generator: async (value) => {
      input = value;
      return { responseVersion: 1, requestId: value.requestId, outcome: 'no_plan', issues: [], anchorReviews: [] };
    },
  });
  const response = await success.handler(request(body()));
  assert.equal(response.status, 422);
  assert.ok(input);
  assert.equal(input!.request.requestVersion, 1);

  const failed = makeHandler({ repository: {
    ...repository(),
    findActiveCategories: async () => { throw new Error('SQL internals must not escape'); },
  } });
  const failedResponse = await failed.handler(request(body({ intent: intent({ constraints: { excludedPlaceIds: [], excludedCategoryCodes: ['food.restaurant'], categoryScope: { kind: 'any' } } }) })));
  const failedJson = await jsonResponse(failedResponse);
  assert.equal(failedResponse.status, 503);
  assert.equal((failedJson.error as { code: string }).code, 'database_error');
  assert.equal(JSON.stringify(failedJson).includes('SQL internals'), false);
});

test('the active deterministic generator returns a grounded proposal through the real boundary', async () => {
  const values = [pricedPlace(id(20), 'food.cafe'), pricedPlace(id(21), 'attraction.museum')];
  const planningRepository = candidateRepository(values, [], ['food.restaurant']);
  const activeIntent = intent({ food: { state: 'selected', values: ['cafe'] }, activities: { state: 'selected', values: ['art_museum'] } });
  const events: PlannerLogEvent[] = [];
  const handler = createGeneratePlanHandler({
    repository: planningRepository,
    generator: createDeterministicPlannerGenerator(planningRepository),
    authorize: async () => authContextForTests(),
    rateLimiter: () => false,
    logger: (event) => events.push(event),
    requestId: () => 'real-generator-request',
    now: () => 1_000,
  });
  const response = await handler(request(body({ intent: activeIntent })));
  const parsed = await jsonResponse(response) as { outcome: string; proposal?: { state?: { stops?: Array<{ place: { place_id: string } }> }; budgetSummary?: { currencyCode: string } } };
  assert.equal(parsed.outcome, 'proposal');
  assert.deepEqual(parsed.proposal?.state?.stops?.map((stop) => stop.place.place_id), [id(20), id(21)]);
  assert.equal(parsed.proposal?.budgetSummary?.currencyCode, 'PHP');
  assert.ok((events.at(-1)?.databaseCallCount ?? 99) <= 20);
  assert.equal(JSON.stringify(parsed).includes('Plan generation is not available'), false);
});

test('preflight and deterministic retrieval share one request-wide twenty-call allowance', async () => {
  const values = Array.from({ length: 12 }, (_, index) => pricedPlace(id(index + 30), index % 2 === 0 ? 'food.cafe' : 'attraction.museum'));
  const planningRepository = candidateRepository(values, [], ['food.restaurant']);
  let repositoryCalls = 0;
  const countedRepository = {
    ...planningRepository,
    findActiveCategories: async (codes: readonly string[]) => { repositoryCalls += 1; return planningRepository.findActiveCategories(codes); },
    findNearbyCandidates: async (query: CandidateSearchRequest) => { repositoryCalls += 1; return planningRepository.findNearbyCandidates(query); },
    findChainMemberships: async (placeIds: readonly string[]) => { repositoryCalls += 1; return planningRepository.findChainMemberships!(placeIds); },
  };
  const activeIntent = intent({
    schedule: { kind: 'duration', durationMinutes: 720, outingDate: null, startTime: null, timeZone: null },
    constraints: { excludedPlaceIds: [], excludedCategoryCodes: ['food.restaurant'], categoryScope: { kind: 'any' } },
  });
  const events: PlannerLogEvent[] = [];
  const handler = createGeneratePlanHandler({
    repository: countedRepository,
    generator: createDeterministicPlannerGenerator(countedRepository),
    authorize: async () => authContextForTests(),
    rateLimiter: () => false,
    logger: (event) => events.push(event),
    requestId: () => 'call-budget-request',
  });
  await handler(request(body({ intent: activeIntent })));
  assert.ok(repositoryCalls <= 20);
  assert.equal(events.at(-1)?.databaseCallCount, repositoryCalls);
});

test('per-person budgets remain valid at the boundary and generator failures are safe retryable errors', async () => {
  const perPerson = makeHandler();
  const perPersonResponse = await perPerson.handler(request(body({ intent: intent({ budget: { ...intent().budget, amountMinor: 50_000, basis: 'per_person' } }) })));
  assert.equal(perPersonResponse.status, 422);
  assert.equal(perPerson.generatorCalls, 1);

  const failed = makeHandler({ generator: async () => { throw new Error('generator internals must not escape'); } });
  const response = await failed.handler(request(body()));
  const parsed = await jsonResponse(response);
  assert.equal(response.status, 503);
  assert.equal((parsed.error as { code: string }).code, 'internal_error');
  assert.equal(JSON.stringify(parsed).includes('generator internals'), false);
});

test('revision is echoed only as review metadata and logger output is aggregate/privacy-safe', async () => {
  const placeId = id(3);
  const { handler, events } = makeHandler({ repository: repository([placeRecord(placeId)]), generator: async (input) => ({
    responseVersion: 1,
    requestId: input.requestId,
    outcome: 'no_plan',
    issues: [{ code: 'no_candidates', message: 'No candidates.' }],
    anchorReviews: [{ placeId: 'wrong-id', intent: 'preferred', status: 'valid' }],
  }) });
  const response = await handler(request(body({ intent: intent({ anchors: [{ placeId, intent: 'preferred', order: { kind: 'any' } }] }) })));
  const parsed = await jsonResponse(response);
  assert.equal((parsed.anchorReviews as Array<{ checkedRevision?: number }>)[0]?.checkedRevision, 7);
  assert.equal(JSON.stringify(events).includes(placeId), false);
  assert.equal(JSON.stringify(events).includes('14.55'), false);
  assert.equal(JSON.stringify(events).includes('Test area'), false);
});

test('shared budget and currency boundary semantics reject overflow, preserve basis, and never treat unknown as free', () => {
  assert.equal(normalizeBudgetMinor({ amountMinor: 50_000, currencyCode: 'PHP', basis: 'per_person', strictness: 'strict', unknownPricePolicy: 'exclude' }, 2), 100_000);
  assert.equal(multiplyMinorUnits(Number.MAX_SAFE_INTEGER, 2), null);
  assert.equal(classifyPriceEvidence({ has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null }, 'PHP').kind, 'unknown');
  assert.equal(classifyPriceEvidence({ has_price: true, estimated_group_min_minor: 1, estimated_group_max_minor: 2, currency_code: 'USD' }, 'PHP').reason, 'currency_mismatch');
  assert.equal(classifyBudgetStatus({ has_price: true, pricing_basis: 'branch_verified', estimated_group_min_minor: 105, estimated_group_max_minor: 105, currency_code: 'PHP' }, 100, 'PHP'), 'exceeds');
  assert.equal(classifyBudgetStatus({ has_price: true, pricing_basis: 'branch_verified', estimated_group_min_minor: 95, estimated_group_max_minor: 105, currency_code: 'PHP' }, 100, 'PHP'), 'may_exceed');
});

test('authentication supports anonymous calls, optional verified sessions, and fails closed for wrong keys', async () => {
  const authenticator = createRequestAuthenticator({ SUPABASE_PUBLISHABLE_KEY: 'public-key' }, async (token) => token === 'valid' ? { userId: id(9) } : null);
  const anonymous = await authenticator(new Request('https://example.test', { headers: { apikey: 'public-key' } }));
  assert.deepEqual(anonymous, { authClass: 'anonymous' });
  const authenticated = await authenticator(new Request('https://example.test', { headers: { apikey: 'public-key', authorization: 'Bearer valid' } }));
  assert.deepEqual(authenticated, { authClass: 'authenticated', userId: id(9) });
  const stale = await authenticator(new Request('https://example.test', { headers: { apikey: 'public-key', authorization: 'Bearer stale' } }));
  assert.deepEqual(stale, { authClass: 'anonymous' });
  assert.equal(await authenticator(new Request('https://example.test', { headers: { apikey: 'wrong-key' } })), null);
});

test('in-memory rate limiting is bounded best effort and does not claim durable distribution', () => {
  const limiter = createInMemoryRateLimiter({ maxRequests: 2, windowMs: 60_000, maxTrackedClients: 1 });
  const make = (ip: string) => new Request('https://example.test', { headers: { 'x-forwarded-for': ip } });
  assert.equal(limiter(make('one')), false);
  assert.equal(limiter(make('one')), false);
  assert.equal(limiter(make('one')), true);
  assert.equal(limiter(make('two')), false);
});
