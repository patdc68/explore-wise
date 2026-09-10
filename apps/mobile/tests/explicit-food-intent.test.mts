import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichWiseIntent, foodFocusFor, normalizeAskWiseWireIntent, type AskWiseIntent } from '../src/services/ask-wise-normalization.ts';
import { buildFoodCandidatePool, chooseFoodProposalCandidate, explicitFoodMatchLevel, isQuickService, shortlistWithSelectedCandidate, stageRankingContextFromIntent } from '../src/services/food-candidate-diversity.ts';
import { budgetStatusForCandidate, composePlanningCandidatePool, coordinatesFromPostgisPoint, withPlanningBudgetStatus } from '../src/services/planning-food-retrieval.ts';
import { buildWiseProposal } from '../src/services/wise-proposal.ts';

const place = (name: string, options: { id?: string; category?: string; categoryName?: string; priced?: boolean; budgetStatus?: string; distance?: number; min?: number; max?: number } = {}) => {
  const priced = options.priced ?? true;
  return {
    place_id: options.id ?? name.toLowerCase().replace(/\W+/g, '-'), name, latitude: 14.5547, longitude: 121.0244,
    category_code: options.category ?? 'food.restaurant', category_name: options.categoryName ?? 'Restaurants', distance_meters: options.distance ?? 300,
    has_price: priced, pricing_basis: priced ? 'brand_reference' : null, pricing_status: priced ? 'paid' : null, pricing_unit: priced ? 'per_group' : null,
    estimated_group_min_minor: priced ? (options.min ?? 50_000) : null, estimated_group_max_minor: priced ? (options.max ?? 60_000) : null,
    budget_status: priced ? (options.budgetStatus ?? 'likely_fits') : 'unknown', price_source_label: priced ? 'Official brand reference' : 'Price not available yet',
  } as any;
};

const ramenIntent = (overrides: Partial<AskWiseIntent> = {}): AskWiseIntent => ({
  budgetMinor: 200_000, partySize: 2, location: 'Makati', currencyCode: 'PHP', timeContext: 'tonight', preferences: ['ramen'], exclusions: [],
  stages: ['food_talk'], inferredStages: [], activityFocus: null, explicitQuickService: false, explicitNightlife: false, foodFocus: 'ramen', outingContext: 'date', ...overrides,
});

const ramenFixture = () => [
  place('Ramen A', { priced: false, distance: 450 }),
  place('Ramen B', { distance: 550 }),
  place('Japanese Ramen C', { categoryName: 'Japanese Ramen Restaurant', priced: false, distance: 650 }),
  place('Jollibee', { categoryName: 'Fast Food', distance: 100 }),
  place('KFC', { categoryName: 'Fast Food', distance: 120 }),
  place('Regular Restaurant D', { priced: false, distance: 200 }),
];

test('raw ramen prompt preserves date, party, budget, and structured food preference through client normalization', () => {
  const prompt = 'Ramen date in Makati, budget 2000 for two';
  const wire = { budget_minor: 200_000, party_size: 2, location: 'Makati', currency_code: 'PHP', time_context: 'tonight', preferences: ['ramen'], exclusions: [], stages: ['food_talk'] as const };
  const normalized = enrichWiseIntent(normalizeAskWiseWireIntent({ ...wire, stages: [...wire.stages] }), prompt);
  assert.equal(normalized.outingContext, 'date');
  assert.equal(normalized.partySize, 2);
  assert.equal(normalized.budgetMinor, 200_000);
  assert.deepEqual(normalized.preferences, ['ramen']);
  assert.equal(normalized.foodFocus, 'ramen');
});

test('food preference normalization is generic across supported grounded food signals', () => {
  for (const [prompt, expected] of [['pizza please', 'pizza'], ['sushi tonight', 'sushi'], ['coffee date', 'cafe'], ['a burger', 'burger'], ['fast food nearby', 'fast_food']] as const) assert.equal(foodFocusFor(prompt), expected);
  assert.equal(foodFocusFor('', ['ramen']), 'ramen');
});

test('explicit ramen builds a hard primary pool before price, proposal, or Customize ordering', async () => {
  const candidates = ramenFixture();
  const context = stageRankingContextFromIntent(ramenIntent());
  const pool = buildFoodCandidatePool(candidates, context);
  assert.equal(pool.mode, 'explicit_food');
  assert.equal(pool.eligible.length, 3);
  assert.ok(pool.eligible.every((candidate) => explicitFoodMatchLevel(candidate, 'ramen') === 'strong'));
  assert.ok(pool.broader.some(isQuickService));
  assert.ok(explicitFoodMatchLevel(pool.eligible[0]!, 'ramen') === 'strong');
  assert.equal(chooseFoodProposalCandidate(candidates, context)?.place_id, pool.eligible[0]?.place_id);
  assert.deepEqual(shortlistWithSelectedCandidate(['food', 'food.restaurant'], candidates, null, 8, context).map((candidate) => candidate.place_id), pool.eligible.map((candidate) => candidate.place_id));
  const proposal = await buildWiseProposal({ intent: ramenIntent(), start: { latitude: 14.5547, longitude: 121.0244, label: 'Makati' }, fetcher: async () => candidates });
  assert.ok(explicitFoodMatchLevel(proposal.state.stops[0]!.place, 'ramen') === 'strong');
  assert.equal(proposal.state.stops[0]?.place.place_id, pool.eligible[0]?.place_id);
});

test('no ramen evidence yields an actionable no-match state instead of a silent QSR substitution', async () => {
  const candidates = [place('Jollibee', { categoryName: 'Fast Food' }), place('KFC', { categoryName: 'Fast Food' }), place('Regular Restaurant')];
  const context = stageRankingContextFromIntent(ramenIntent());
  const pool = buildFoodCandidatePool(candidates, context);
  assert.equal(pool.mode, 'explicit_food_no_match');
  assert.deepEqual(pool.eligible, []);
  assert.equal(pool.broader.length, 3);
  assert.equal(chooseFoodProposalCandidate(candidates, context), undefined);
  const proposal = await buildWiseProposal({ intent: ramenIntent(), start: { latitude: 14.5547, longitude: 121.0244, label: 'Makati' }, fetcher: async () => candidates });
  assert.equal(proposal.state.stops.length, 0);
  assert.deepEqual(proposal.missingStageIds, ['food_talk-1']);
  assert.equal(proposal.explicitFoodNoMatch, 'ramen');
});

test('Try another keeps ramen eligibility and never falls immediately to unrelated fast food', async () => {
  const candidates = ramenFixture();
  const first = await buildWiseProposal({ intent: ramenIntent(), start: { latitude: 14.5547, longitude: 121.0244, label: 'Makati' }, fetcher: async () => candidates });
  const second = await buildWiseProposal({ intent: first.intent, start: first.state.start, fetcher: async () => candidates, excludedCombinations: first.historyKey.split('|') });
  assert.equal(first.intent.foodFocus, 'ramen');
  assert.ok(explicitFoodMatchLevel(first.state.stops[0]!.place, 'ramen') === 'strong');
  assert.ok(explicitFoodMatchLevel(second.state.stops[0]!.place, 'ramen') === 'strong');
  assert.notEqual(first.state.stops[0]?.place.place_id, second.state.stops[0]?.place.place_id);
});

test('relevance-first composition retains unknown-price intent matches before a price-first slice can truncate them', () => {
  const broad = Array.from({ length: 50 }, (_, index) => place(`Regular ${index + 1}`, { priced: false, id: `regular-${index + 1}`, distance: index + 1 }));
  const budgetEvidence = Array.from({ length: 20 }, (_, index) => place(index % 2 ? `KFC ${index}` : `Jollibee ${index}`, { id: `qsr-${index}`, distance: index + 1 }));
  const explicitMatches = [place('Ramen Unknown', { priced: false, id: 'ramen-unknown', distance: 400 })];
  const composed = composePlanningCandidatePool({ broad, budgetEvidence, explicitMatches, resultLimit: 50 });
  assert.equal(composed.length, 50);
  assert.equal(composed[0]?.place_id, 'ramen-unknown');
  assert.ok(composed.some((candidate) => candidate.place_id.startsWith('regular-')));
  assert.ok(composed.some((candidate) => candidate.place_id.startsWith('qsr-')));
  const classified = withPlanningBudgetStatus(composed, 200_000);
  assert.equal(classified.find((candidate) => candidate.place_id === 'ramen-unknown')?.budget_status, 'unknown');
  assert.equal(budgetStatusForCandidate(explicitMatches[0]!, 200_000), 'unknown');
});

test('four-friend budget per person produces an observable QSR-to-regular ordering shift', () => {
  const candidates = [
    place('Jollibee', { categoryName: 'Fast Food' }), place('KFC', { categoryName: 'Fast Food' }),
    place('Regular A', { priced: false }), place('Regular B', { priced: false }), place('Regular C', { priced: false }),
  ];
  const low = buildFoodCandidatePool(candidates, { outingContext: 'friends_group', budgetMinor: 200_000, partySize: 4, currencyCode: 'PHP' }).eligible;
  const high = buildFoodCandidatePool(candidates, { outingContext: 'friends_group', budgetMinor: 400_000, partySize: 4, currencyCode: 'PHP' }).eligible;
  assert.ok(low.slice(0, 2).some(isQuickService));
  assert.ok(high.slice(0, 3).every((candidate) => !isQuickService(candidate)));
  assert.notDeepEqual(low.slice(0, 3).map((candidate) => candidate.place_id), high.slice(0, 3).map((candidate) => candidate.place_id));
});

test('PostGIS point decoding keeps targeted retrieval geographic and deterministic', () => {
  const coordinates = coordinatesFromPostgisPoint('0101000020E6100000A52DAEF199435E408A90BA9D7D752D40');
  assert.ok(coordinates);
  assert.ok(Math.abs(coordinates!.longitude - 121.056271) < 0.001);
  assert.ok(Math.abs(coordinates!.latitude - 14.729474) < 0.001);
});
