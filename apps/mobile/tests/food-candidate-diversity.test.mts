import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIVITY_CATEGORY_CODES, CUSTOMIZE_CANDIDATE_LIMIT, STAGE_CANDIDATE_POOL_LIMIT, activityFamily, chooseFoodProposalCandidate, diversifyActivityCandidates, diversifyFoodCandidates, isQuickService, orderStageCandidates, outingSuitabilityScore, shortlistWithSelectedCandidate, visibleStageCandidates } from '../src/services/food-candidate-diversity.ts';
import { activityCategoryCodes } from '../src/services/itinerary.ts';

const place = (name: string, options: { priced?: boolean; category?: string; categoryName?: string; distance?: number; id?: string } = {}) => ({
  place_id: options.id ?? name, name, latitude: 14.55, longitude: 121.05, category_name: options.categoryName ?? 'Restaurant', category_code: options.category ?? 'food.restaurant', distance_meters: options.distance ?? 300,
  has_price: options.priced ?? true, pricing_basis: options.priced === false ? null : 'brand_reference', estimated_group_min_minor: options.priced === false ? null : 50000, estimated_group_max_minor: options.priced === false ? null : 50000, budget_status: options.priced === false ? 'unknown' : 'fits',
} as any);

const genericFoodFixture = () => [
  place('Jollibee BGC'), place('KFC BGC'), place('Mang Inasal BGC'), place('Jollibee High Street', { id: 'jollibee-duplicate' }),
  place('Restaurant A', { priced: false, distance: 250 }), place('Restaurant B'), place('Local Restaurant C', { priced: false }), place('Restaurant D'),
];

test('generic no-budget food is restaurant-led, not QSR-led, with duplicate QSR branches deferred', () => {
  const ranked = diversifyFoodCandidates(genericFoodFixture());
  assert.ok(ranked.slice(0, 5).filter((candidate) => !isQuickService(candidate)).length >= 3);
  assert.ok(ranked.slice(0, 5).filter(isQuickService).length <= 2);
  assert.ok(ranked.findIndex((candidate) => candidate.place_id === 'jollibee-duplicate') > ranked.findIndex((candidate) => candidate.name === 'Mang Inasal BGC'));
  assert.equal(ranked.find((candidate) => candidate.name === 'Restaurant A')?.has_price, false);
});

test('budget-ranked input remains mixed and unknown prices are not fabricated into budget fits', () => {
  const ranked = diversifyFoodCandidates(genericFoodFixture());
  assert.ok(ranked.slice(0, 5).some((candidate) => candidate.has_price === false));
  assert.ok(ranked.slice(0, 5).some((candidate) => !isQuickService(candidate)));
  assert.equal(ranked.find((candidate) => candidate.name === 'Restaurant A')?.budget_status, 'unknown');
});

test('explicit fast-food intent may prioritize QSR without classifying every chain as fast food', () => {
  const ranked = diversifyFoodCandidates(genericFoodFixture(), { explicitQuickService: true });
  assert.equal(ranked[0]?.name, 'Jollibee BGC');
  assert.ok(ranked.slice(0, 3).every(isQuickService));
  assert.equal(isQuickService(place('Sit-down Chain', { categoryName: 'Restaurant' })), false);
  assert.equal(isQuickService(place('Quick Burger', { categoryName: 'Quick Service Restaurant' })), true);
});

test('proposal, Customize, and Try another use the same deterministic food ordering', () => {
  const raw = genericFoodFixture();
  const proposal = chooseFoodProposalCandidate(raw);
  const customize = visibleStageCandidates(['food', 'food.restaurant'], raw, 8);
  const tryAnother = orderStageCandidates(['food', 'food.restaurant'], raw.filter((candidate) => candidate.place_id !== proposal?.place_id));
  assert.equal(proposal?.place_id, customize[0]?.place_id);
  assert.equal(customize[0]?.name, 'Restaurant A');
  assert.equal(tryAnother[0]?.name, 'Restaurant B');
});

test('restaurant and dinner intent keep meal venues ahead of cafes, bakeries, and desserts', () => {
  const fixture = [
    place('Cafe A', { category: 'food.cafe', categoryName: 'Cafe' }),
    place('Bakery A', { category: 'food.bakery', categoryName: 'Bakery' }),
    place('Dessert A', { category: 'food.dessert', categoryName: 'Dessert' }),
    place('Restaurant A', { category: 'food.restaurant', categoryName: 'Restaurant' }),
    place('Restaurant B', { category: 'food.restaurant', categoryName: 'Restaurant' }),
  ];
  const ranked = orderStageCandidates(['food', 'food.restaurant', 'food.cafe', 'food.bakery', 'food.dessert'], fixture, { foodFocus: 'restaurant' });
  assert.deepEqual(ranked.slice(0, 2).map((candidate) => candidate.name), ['Restaurant A', 'Restaurant B']);
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Restaurant B') < ranked.findIndex((candidate) => candidate.name === 'Cafe A'));
});

test('coffee and dessert intent override generic restaurant preference without changing QSR policy', () => {
  const fixture = [
    place('Restaurant A', { category: 'food.restaurant', categoryName: 'Restaurant' }),
    place('Cafe A', { category: 'food.cafe', categoryName: 'Cafe' }),
    place('Bakery A', { category: 'food.bakery', categoryName: 'Bakery' }),
    place('Dessert A', { category: 'food.dessert', categoryName: 'Dessert' }),
  ];
  assert.equal(orderStageCandidates(['food.cafe'], fixture)[0]?.name, 'Cafe A');
  assert.equal(orderStageCandidates(['food.dessert'], fixture)[0]?.name, 'Dessert A');
  assert.equal(orderStageCandidates(['food', 'food.restaurant'], genericFoodFixture())[0]?.name, 'Restaurant A');
});

const activity = (name: string, category: string) => place(name, { category, categoryName: category });

test('generic Things-to-do retrieval keeps every existing activity family, not only parks', () => {
  assert.deepEqual([...activityCategoryCodes()], [...ACTIVITY_CATEGORY_CODES]);
  const fixture = [activity('Recreation A', 'activity.recreation'), activity('Entertainment A', 'entertainment'), activity('Cinema A', 'entertainment.cinema'), activity('Park A', 'outdoor.park'), activity('Attraction A', 'attraction'), activity('Museum A', 'attraction.museum'), activity('Culture A', 'attraction.culture')];
  const ranked = orderStageCandidates(activityCategoryCodes(), fixture);
  assert.deepEqual(new Set(ranked.map(activityFamily)), new Set(['recreation', 'entertainment', 'cinema', 'outdoor', 'attraction', 'culture']));
  assert.notDeepEqual([...activityCategoryCodes()], ['outdoor.park']);
});

test('generic Things-to-do diversifies the first five cards across at least three families', () => {
  const ranked = diversifyActivityCandidates([
    activity('Park A', 'outdoor.park'), activity('Park B', 'outdoor.park'), activity('Park C', 'outdoor.park'),
    activity('Recreation A', 'activity.recreation'), activity('Entertainment A', 'entertainment'), activity('Attraction A', 'attraction'), activity('Cinema A', 'entertainment.cinema'),
  ]);
  assert.ok(new Set(ranked.slice(0, 5).map(activityFamily)).size >= 3);
  assert.ok(ranked.slice(0, 5).filter((candidate) => activityFamily(candidate) === 'outdoor').length <= 2);
});

test('generic outings rank grounded leisure destinations ahead of administrative POIs without removing broad families', () => {
  const fixture = [
    activity('San Nicolas Barangay Hall', 'attraction.culture'), activity('Government Service Building', 'attraction'),
    activity('Museum A', 'attraction.museum'), activity('Cinema A', 'entertainment.cinema'), activity('Entertainment A', 'entertainment'), activity('Park A', 'outdoor.park'), activity('Bowling Alley', 'activity.recreation'),
  ];
  const ranked = orderStageCandidates(activityCategoryCodes(), fixture);
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Museum A') < ranked.findIndex((candidate) => candidate.name === 'San Nicolas Barangay Hall'));
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Bowling Alley') < ranked.findIndex((candidate) => candidate.name === 'Government Service Building'));
  assert.equal(outingSuitabilityScore(activity('Historic City Hall Museum', 'attraction.culture')) > outingSuitabilityScore(activity('City Hall', 'attraction.culture')), true);
  assert.deepEqual(new Set(ranked.map(activityFamily)), new Set(['recreation', 'entertainment', 'cinema', 'outdoor', 'attraction', 'culture']));
});

test('strong leisure metadata outranks ambiguous studios and utility destinations without excluding eligible families', () => {
  const fixture = [
    activity('Ambiguous Studio', 'activity.recreation'), activity('Barangay Hall', 'entertainment'), activity('Government Office', 'attraction'),
    activity('Cinema', 'entertainment.cinema'), activity('Museum', 'attraction.museum'), activity('Jose Rizal Monument', 'attraction.culture'), activity('Park', 'outdoor.park'), activity('Bowling', 'activity.recreation'),
  ];
  const ranked = orderStageCandidates(activityCategoryCodes(), fixture);
  for (const strong of ['Cinema', 'Museum', 'Jose Rizal Monument', 'Park', 'Bowling']) assert.ok(ranked.findIndex((candidate) => candidate.name === strong) < ranked.findIndex((candidate) => candidate.name === 'Barangay Hall'));
  assert.ok(ranked.findIndex((candidate) => candidate.name === 'Cinema') < ranked.findIndex((candidate) => candidate.name === 'Ambiguous Studio'));
  assert.ok(ranked.includes(fixture[0]!));
});

test('explicit activity focus narrows candidate families deterministically', () => {
  const fixture = [activity('Park A', 'outdoor.park'), activity('Cinema A', 'entertainment.cinema'), activity('Museum A', 'attraction.museum'), activity('Bowling A', 'activity.recreation')];
  assert.equal(diversifyActivityCandidates(fixture, { activityFocus: 'outdoor' })[0]?.name, 'Park A');
  assert.equal(diversifyActivityCandidates(fixture, { activityFocus: 'cinema' })[0]?.name, 'Cinema A');
  assert.equal(diversifyActivityCandidates(fixture, { activityFocus: 'museum' })[0]?.name, 'Museum A');
  assert.equal(diversifyActivityCandidates(fixture, { activityFocus: 'recreation' })[0]?.name, 'Bowling A');
});

test('Customize stays at eight places while retaining a selected alternative outside the original shortlist', () => {
  const candidates = Array.from({ length: 20 }, (_, index) => place(`Restaurant ${index + 1}`, { id: `place-${index + 1}` }));
  const shortlist = visibleStageCandidates(['food', 'food.restaurant'], candidates);
  const selectedAlternative = shortlistWithSelectedCandidate(['food', 'food.restaurant'], candidates, 'place-17');
  assert.equal(CUSTOMIZE_CANDIDATE_LIMIT, 8);
  assert.equal(STAGE_CANDIDATE_POOL_LIMIT, 50);
  assert.equal(shortlist.length, 8);
  assert.equal(shortlist.some((candidate) => candidate.place_id === 'place-17'), false);
  assert.equal(selectedAlternative.length, 8);
  assert.equal(selectedAlternative[0]?.place_id, 'place-17');
  assert.equal(new Set(selectedAlternative.map((candidate) => candidate.place_id)).size, 8);
});
