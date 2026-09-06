import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichWiseIntent, type AskWiseIntent } from '../src/services/ask-wise-normalization.ts';
import {
  FOOD_AFFORDABILITY_BANDS_MINOR,
  affordabilityPressureFor,
  chooseFoodProposalCandidate,
  deriveBudgetPerPersonMinor,
  diversifyFoodCandidates,
  isQuickService,
  orderStageCandidates,
  visibleStageCandidates,
} from '../src/services/food-candidate-diversity.ts';
import { buildWiseProposal } from '../src/services/wise-proposal.ts';

type PlaceOptions = {
  category?: string;
  categoryName?: string;
  priced?: boolean;
  budgetStatus?: string;
  distance?: number;
  min?: number | null;
  max?: number | null;
};

const place = (name: string, options: PlaceOptions = {}) => {
  const priced = options.priced ?? true;
  return {
    place_id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    latitude: 14.55,
    longitude: 121.05,
    category_code: options.category ?? 'food.restaurant',
    category_name: options.categoryName ?? 'Restaurant',
    distance_meters: options.distance ?? 300,
    has_price: priced,
    pricing_basis: priced ? 'brand_reference' : null,
    estimated_group_min_minor: priced ? (options.min ?? 50_000) : null,
    estimated_group_max_minor: priced ? (options.max ?? 60_000) : null,
    budget_status: priced ? (options.budgetStatus ?? 'likely_fits') : 'unknown',
  } as any;
};

const regularPool = () => [
  place('Jollibee BGC', { category: 'food.fast_food', categoryName: 'Fast Food' }),
  place('KFC BGC', { category: 'food.fast_food', categoryName: 'Fast Food', distance: 350 }),
  place('Mang Inasal BGC', { category: 'food.fast_food', categoryName: 'Fast Food', distance: 400 }),
  place('Regular Restaurant A', { distance: 450 }),
  place('Regular Restaurant B', { distance: 500 }),
  place('Independent Restaurant C', { priced: false, distance: 550 }),
];

const context = (outingContext: AskWiseIntent['outingContext'], budgetMinor: number | null, partySize: number | null, overrides: Record<string, unknown> = {}) => ({
  outingContext,
  budgetMinor,
  partySize,
  currencyCode: 'PHP',
  ...overrides,
});

const intent = (overrides: Partial<AskWiseIntent> = {}): AskWiseIntent => ({
  budgetMinor: 200_000,
  partySize: 2,
  location: 'Makati',
  currencyCode: 'PHP',
  timeContext: 'tonight',
  exclusions: [],
  stages: ['food_talk'],
  inferredStages: [],
  preferences: [],
  activityFocus: null,
  explicitQuickService: false,
  explicitNightlife: false,
  foodFocus: null,
  outingContext: 'date',
  ...overrides,
});

test('budget per person uses integer minor units and isolated PHP pressure bands', () => {
  assert.equal(deriveBudgetPerPersonMinor(200_000, 4), 50_000);
  assert.equal(deriveBudgetPerPersonMinor(70_001, 2), 35_000);
  assert.equal(deriveBudgetPerPersonMinor(200_000, null), null);
  assert.equal(deriveBudgetPerPersonMinor(null, 4), null);
  assert.equal(deriveBudgetPerPersonMinor(200_000, 0), null);
  assert.deepEqual(FOOD_AFFORDABILITY_BANDS_MINOR.PHP, { strongMax: 40_000, moderateMax: 65_000, normalMax: 100_000 });
  assert.equal(affordabilityPressureFor(40_000, 'PHP'), 'strong');
  assert.equal(affordabilityPressureFor(40_001, 'PHP'), 'moderate');
  assert.equal(affordabilityPressureFor(65_001, 'PHP'), 'normal');
  assert.equal(affordabilityPressureFor(100_001, 'PHP'), 'weak');
  assert.equal(affordabilityPressureFor(50_000, 'JPY'), null);
});

test('date for two at PHP 2,000 is restaurant-led without removing unknown-price restaurants', () => {
  const ranked = orderStageCandidates(['food', 'food.restaurant'], regularPool(), context('date', 200_000, 2));
  assert.ok(ranked.slice(0, 3).every((candidate) => !isQuickService(candidate)));
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Regular Restaurant A') < ranked.findIndex((candidate) => candidate.name === 'Jollibee BGC'));
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Independent Restaurant C') < ranked.findIndex((candidate) => candidate.name === 'Jollibee BGC'));
  assert.equal(ranked.find((candidate) => candidate.name === 'Independent Restaurant C')?.budget_status, 'unknown');
});

test('date for two at PHP 700 raises affordable QSR while an affordable regular restaurant can still lead', () => {
  const pool = regularPool().map((candidate) => candidate.name === 'Regular Restaurant A'
    ? { ...candidate, budget_status: 'likely_fits' }
    : !isQuickService(candidate) ? { ...candidate, budget_status: candidate.has_price ? 'likely_exceeds' : 'unknown' } : candidate);
  const ranked = orderStageCandidates(['food', 'food.restaurant'], pool, context('date', 70_000, 2));
  assert.equal(ranked[0]?.name, 'Regular Restaurant A');
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Jollibee BGC') < ranked.findIndex((candidate) => candidate.name === 'Regular Restaurant B'));
  assert.ok(ranked.slice(0, 4).some(isQuickService));
  assert.ok(ranked.slice(0, 4).some((candidate) => !isQuickService(candidate)));
});

test('four friends at PHP 2,000 get strong affordable options without QSR monopolizing the top set', () => {
  const ranked = orderStageCandidates(['food', 'food.restaurant'], regularPool(), context('friends_group', 200_000, 4));
  assert.ok(ranked.slice(0, 2).some(isQuickService));
  assert.ok(ranked.slice(0, 4).filter(isQuickService).length >= 2);
  assert.ok(ranked.slice(0, 4).some((candidate) => !isQuickService(candidate)));
});

test('four friends at PHP 4,000 and solo at PHP 1,500 broaden regular restaurant choices', () => {
  for (const rankingContext of [context('friends_group', 400_000, 4), context('solo', 150_000, 1)]) {
    const ranked = orderStageCandidates(['food', 'food.restaurant'], regularPool(), rankingContext);
    assert.ok(ranked.slice(0, 3).every((candidate) => !isQuickService(candidate)));
    assert.ok(ranked.findIndex((candidate) => candidate.name === 'Regular Restaurant A') < ranked.findIndex((candidate) => candidate.name === 'Jollibee BGC'));
  }
});

test('no budget and missing party size derive no pressure and retain safe restaurant-led behavior', () => {
  for (const rankingContext of [context('friends_group', null, 4), context('date', 200_000, null)]) {
    assert.equal(deriveBudgetPerPersonMinor(rankingContext.budgetMinor, rankingContext.partySize), null);
    const ranked = orderStageCandidates(['food', 'food.restaurant'], regularPool(), rankingContext);
    assert.equal(isQuickService(ranked[0]!), false);
    assert.ok(ranked.some((candidate) => candidate.has_price === false));
  }
});

test('no-budget price availability is only a tie-breaker after context and distance', () => {
  const nearerUnknown = place('Near Unknown', { priced: false, distance: 200 });
  const fartherKnown = place('Far Known', { distance: 300 });
  const tiedUnknown = place('Tied Unknown', { priced: false, distance: 400 });
  const tiedKnown = place('Tied Known', { distance: 400 });
  const ranked = orderStageCandidates(['food.restaurant'], [fartherKnown, tiedUnknown, tiedKnown, nearerUnknown], context('generic', null, 2));
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Near Unknown') < ranked.findIndex((candidate) => candidate.name === 'Far Known'));
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Tied Known') < ranked.findIndex((candidate) => candidate.name === 'Tied Unknown'));
});

test('explicit fast-food and ramen intent outrank generic context and affordability heuristics', () => {
  const fastFood = orderStageCandidates(['food', 'food.restaurant'], regularPool(), context('date', 400_000, 4, { explicitQuickService: true }));
  assert.ok(fastFood.slice(0, 3).every(isQuickService));
  const ramenIntent = enrichWiseIntent(intent(), 'ramen date in Makati, budget 2000');
  assert.equal(ramenIntent.foodFocus, 'ramen');
  const ramen = place('Ramen House', { category: 'food.restaurant.ramen', categoryName: 'Ramen Restaurant', priced: false });
  const ramenRanked = orderStageCandidates(['food', 'food.restaurant'], [...regularPool(), ramen], context('date', 200_000, 2, { foodFocus: ramenIntent.foodFocus }));
  assert.equal(ramenRanked[0]?.name, 'Ramen House');
});

test('proposal and Customize choose the same first food candidate from one ordering', async () => {
  const candidates = regularPool();
  const rankingContext = context('date', 200_000, 2);
  const customize = visibleStageCandidates(['food', 'food.restaurant'], candidates, 8, rankingContext);
  assert.equal(chooseFoodProposalCandidate(candidates, rankingContext)?.place_id, customize[0]?.place_id);
  const proposal = await buildWiseProposal({ intent: intent(), start: { latitude: 14.55, longitude: 121.05, label: 'Makati' }, fetcher: async () => candidates });
  assert.equal(proposal.state.stops[0]?.place.place_id, customize[0]?.place_id);
});

test('Try another reuses intent ranking and exclusion before moving beyond strong date restaurants', async () => {
  const candidates = regularPool();
  const first = await buildWiseProposal({ intent: intent(), start: { latitude: 14.55, longitude: 121.05, label: 'Makati' }, fetcher: async () => candidates });
  const second = await buildWiseProposal({ intent: first.intent, start: first.state.start, fetcher: async () => candidates, excludedCombinations: first.historyKey.split('|') });
  assert.equal(isQuickService(first.state.stops[0]!.place), false);
  assert.equal(isQuickService(second.state.stops[0]!.place), false);
  assert.notEqual(second.historyKey, first.historyKey);
});

test('date context does not fabricate a two-person party when normalized intent omitted party size', () => {
  const missingParty = intent({ partySize: null });
  const enriched = enrichWiseIntent(missingParty, 'I have a date tonight in Makati, budget 2000');
  assert.equal(enriched.outingContext, 'date');
  assert.equal(enriched.partySize, null);
  assert.equal(deriveBudgetPerPersonMinor(enriched.budgetMinor, enriched.partySize), null);
});

test('unknown price remains unknown and is never interpreted as a budget fit', () => {
  const unknown = place('Unknown Restaurant', { priced: false });
  const ranked = diversifyFoodCandidates([place('Jollibee', { category: 'food.fast_food', categoryName: 'Fast Food' }), unknown], context('date', 200_000, 2));
  const result = ranked.find((candidate) => candidate.place_id === unknown.place_id)!;
  assert.equal(result.has_price, false);
  assert.equal(result.estimated_group_min_minor, null);
  assert.equal(result.estimated_group_max_minor, null);
  assert.equal(result.budget_status, 'unknown');
});
