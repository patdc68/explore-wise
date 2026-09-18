import assert from 'node:assert/strict';
import test from 'node:test';

import { finalizeItinerary } from '../src/services/itinerary.ts';
import { createItineraryExecutionStore } from '../src/services/itinerary-execution-storage.ts';
import { guidedCandidateAllowed, guidedCategoryScopeAllows, guidedStageIsLocked, validateGuidedCandidate, validateGuidedItinerary } from '../src/services/guided-plan-constraints.ts';

const placeId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const intent = (overrides: any = {}) => ({
  planningIntentVersion: 1, occasion: 'date',
  location: { source: 'selected_area', label: 'Area', coordinates: { latitude: 14.55, longitude: 121.05 }, context: { locality: null, city: null, region: null, countryCode: 'PH' }, geography: { kind: 'radius', radiusMeters: 5_000 } },
  party: { size: 2, children: null }, budget: { amountMinor: 100_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
  schedule: { kind: 'duration', durationMinutes: 150, outingDate: null, startTime: null, timeZone: null }, moods: { state: 'no_preference' }, food: { state: 'no_preference' }, activities: { state: 'no_preference' }, mobility: { state: 'no_preference' }, anchors: [], constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } }, ...overrides,
});
const place = (id = placeId, overrides: any = {}) => ({ place_id: id, name: 'Place', category_code: 'food.restaurant', category_name: 'Restaurant', latitude: 14.55, longitude: 121.05, has_price: true, estimated_group_min_minor: 20_000, estimated_group_max_minor: 30_000, currency_code: 'PHP', ...overrides });
const state = (stops: any[] = [], budgetMinor = 100_000) => ({ start: { latitude: 14.55, longitude: 121.05, label: 'Area' }, budgetMinor, partySize: 2, currencyCode: 'PHP', stages: [{ id: 'food-1', title: 'Food', categoryCodes: ['food.restaurant'], required: true, source: 'wise' }], stops });
const routeState = (stops: any[], stageCount = stops.length, budgetMinor = 100_000) => ({
  start: { latitude: 14.55, longitude: 121.05, label: 'Area' }, budgetMinor, partySize: 2, currencyCode: 'PHP',
  stages: Array.from({ length: stageCount }, (_, index) => ({ id: `stage-${index + 1}`, title: `Stage ${index + 1}`, categoryCodes: ['food.restaurant'], required: true, source: 'wise' })),
  stops,
});
const routeStop = (stageIndex: number, candidate: any) => ({ stageId: `stage-${stageIndex}`, place: candidate });
const atLongitude = (id: string, longitude: number) => place(id, { longitude });
const originLongitude = 121.05;
const east = atLongitude('east', originLongitude + 0.036);
const west = atLongitude('west', originLongitude - 0.036);
const nearEast = atLongitude('near-east', originLongitude + 0.040);
const center = place('center');

test('Guided Customize keeps original and sequential places inside the hard radius', () => {
  const value = intent();
  assert.equal(guidedCandidateAllowed({ intent: value, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] }, origin: { latitude: 14.55, longitude: 121.05 } }, place()), true);
  assert.equal(guidedCandidateAllowed({ intent: value, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] }, origin: { latitude: 14.60, longitude: 121.05 } }, place()), false);
  assert.equal(guidedCandidateAllowed({ intent: { ...value, location: { ...value.location, coordinates: { latitude: 14.55, longitude: 121.05 } } }, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } }, place(placeId, { latitude: 14.70, longitude: 121.05 })), false);
});

test('Guided Customize preserves exclusions, category scope, and exact identity rules', () => {
  const value = intent({ constraints: { excludedPlaceIds: [otherId], excludedCategoryCodes: ['food.dessert'], categoryScope: { kind: 'only', categoryCodes: ['food.restaurant'] } } });
  const context = { intent: value, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } };
  assert.equal(guidedCandidateAllowed(context, place()), true);
  assert.equal(guidedCandidateAllowed(context, place(otherId)), false);
  assert.equal(guidedCandidateAllowed(context, place(placeId, { category_code: 'food.dessert' })), false);
  assert.equal(guidedCandidateAllowed({ intent: value, state: state() }, place(placeId, { category_code: null })), false);
  assert.equal(guidedCandidateAllowed(context, place(placeId, { category_code: 'activity.recreation' })), false);
  assert.equal(guidedCategoryScopeAllows(value, ['food.restaurant']), true);
  assert.equal(guidedCategoryScopeAllows(value, ['food.dessert']), false);
  assert.equal(guidedCategoryScopeAllows(intent({ constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'only', categoryCodes: ['food.restaurant'] } } }), ['food']), false);
});

test('Guided Customize keeps strict and flexible cumulative budgets truthful', () => {
  const strict = intent();
  const existing = place(otherId, { estimated_group_min_minor: 70_000, estimated_group_max_minor: 80_000 });
  assert.equal(guidedCandidateAllowed({ intent: strict, state: state([{ stageId: 'food-1', place: existing }]), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } }, place()), true);
  const flexible = intent({ budget: { ...strict.budget, strictness: 'flexible' } });
  const crossing = place(placeId, { estimated_group_min_minor: 35_000, estimated_group_max_minor: 200_000 });
  assert.equal(guidedCandidateAllowed({ intent: flexible, state: state([{ stageId: 'other', place: existing }]), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } }, crossing), false, 'flexible mode may cross a range only when the cumulative minimum stays within the cap');
  const unknown = place(placeId, { has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null, currency_code: null });
  assert.equal(guidedCandidateAllowed({ intent: strict, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } }, unknown), true);
  assert.equal(guidedCandidateAllowed({ intent: { ...strict, budget: { ...strict.budget, unknownPricePolicy: 'exclude' } }, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } }, unknown), false);
  const mismatch = place(placeId, { currency_code: 'JPY' });
  assert.equal(guidedCandidateAllowed({ intent: strict, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] } }, mismatch), true, 'currency mismatch is unknown, never free');
});

test('must-visit stages remain locked during Guided Customize', () => {
  const value = intent({ anchors: [{ placeId, intent: 'must_visit', order: { kind: 'any' } }] });
  const selected = state([{ stageId: 'food-1', place: place() }]);
  assert.equal(guidedStageIsLocked(value, 'food-1', selected), true);
  assert.equal(guidedStageIsLocked(value, 'food-1', state()), false);
  assert.equal(guidedStageIsLocked(value, 'food-1', state(), [{ placeId, intent: 'must_visit', outcome: 'included', stageId: 'food-1' }]), true);
});

test('Guided replacement checks both adjacent sequential legs', () => {
  const value = intent();
  const candidate = east;

  const firstValid = routeState([routeStop(1, center), routeStop(2, nearEast)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: firstValid, stage: firstValid.stages[0], origin: firstValid.start }, candidate).valid, true);
  const firstInvalidForward = routeState([routeStop(1, center), routeStop(2, west)]);
  assert.deepEqual(validateGuidedCandidate({ intent: value, state: firstInvalidForward, stage: firstInvalidForward.stages[0], origin: firstInvalidForward.start }, candidate), {
    valid: false, code: 'following_leg', message: 'This stop would put the next stop too far away.',
  });

  const middleValid = routeState([routeStop(1, center), routeStop(2, center), routeStop(3, nearEast)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: middleValid, stage: middleValid.stages[1], origin: middleValid.start }, candidate).valid, true);
  const middleInvalidPrevious = routeState([routeStop(1, east), routeStop(2, center), routeStop(3, center)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: middleInvalidPrevious, stage: middleInvalidPrevious.stages[1], origin: middleInvalidPrevious.start }, west).valid, false);
  const middleInvalidNext = routeState([routeStop(1, center), routeStop(2, center), routeStop(3, west)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: middleInvalidNext, stage: middleInvalidNext.stages[1], origin: middleInvalidNext.start }, candidate).valid, false);
  const middleBothInvalid = routeState([routeStop(1, east), routeStop(2, center), routeStop(3, east)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: middleBothInvalid, stage: middleBothInvalid.stages[1], origin: middleBothInvalid.start }, west).valid, false);

  const lastValid = routeState([routeStop(1, center), routeStop(2, center)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: lastValid, stage: lastValid.stages[1], origin: lastValid.start }, candidate).valid, true);
  const lastInvalid = routeState([routeStop(1, west), routeStop(2, center)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: lastInvalid, stage: lastInvalid.stages[1], origin: lastInvalid.start }, candidate).valid, false);

  const singleValid = routeState([routeStop(1, center)]);
  assert.equal(validateGuidedCandidate({ intent: value, state: singleValid, stage: singleValid.stages[0], origin: singleValid.start }, candidate).valid, true);
  const singleInvalid = routeState([routeStop(1, center)]);
  const outsideOriginal = atLongitude('outside', originLongitude + 0.070);
  assert.equal(validateGuidedCandidate({ intent: value, state: singleInvalid, stage: singleInvalid.stages[0], origin: singleInvalid.start }, outsideOriginal).valid, false);
});

test('Guided replacement rejects an outside-original candidate even when both adjacent legs would fit', () => {
  const value = intent();
  const current = routeState([routeStop(1, center), routeStop(2, nearEast)]);
  const outsideOriginal = atLongitude('outside', originLongitude + 0.070);
  const result = validateGuidedCandidate({ intent: value, state: current, stage: current.stages[0], origin: current.start, nextStop: atLongitude('outside-next', originLongitude + 0.071) }, outsideOriginal);
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'original_geography');
});

test('Guided replacement refuses geography without an authoritative sequential bound', () => {
  const value = intent({ location: { ...intent().location, geography: { kind: 'locality', localityId: 'metro-manila' } } });
  const result = validateGuidedCandidate({ intent: value, state: state(), stage: { id: 'food-1', categoryCodes: ['food.restaurant'] }, origin: state().start }, place());
  assert.deepEqual(result, { valid: false, code: 'invalid_route', message: 'Guided sequential geography cannot be verified for this plan.' });
});

test('Guided finalization validates the complete route and legacy finalization remains unchanged', async () => {
  const value = intent();
  const validRoute = routeState([routeStop(1, center), routeStop(2, nearEast)]);
  const finalized = finalizeItinerary(validRoute, { intent: value });
  assert.ok(finalized);
  assert.equal(finalized.finalized, true);

  const invalidFirst = routeState([routeStop(1, atLongitude('outside-first', originLongitude + 0.070)), routeStop(2, nearEast)]);
  assert.equal(finalizeItinerary(invalidFirst, { intent: value }), null);
  const invalidMiddle = routeState([routeStop(1, center), routeStop(2, east), routeStop(3, west)]);
  assert.equal(finalizeItinerary(invalidMiddle, { intent: value }), null);
  const invalidFinal = routeState([routeStop(1, west), routeStop(2, east)]);
  assert.equal(finalizeItinerary(invalidFinal, { intent: value }), null);
  assert.equal(invalidMiddle.finalized, undefined);

  const legacy = finalizeItinerary(state());
  assert.equal(legacy.finalized, true);

  let saved: string | null = null;
  const store = createItineraryExecutionStore({ getItem: async () => saved, setItem: async (_key, value) => { saved = value; } });
  await store.hydrate();
  const blocked = finalizeItinerary(invalidMiddle, { intent: value });
  assert.equal(blocked, null);
  assert.equal(blocked ? store.finalize('blocked', blocked) : null, null);
  assert.equal(saved, null);
});

test('Guided finalization preserves hard exclusions, category scope, and unknown-price policy', () => {
  const excludedId = '33333333-3333-4333-8333-333333333333';
  const value = intent({ constraints: { excludedPlaceIds: [excludedId], excludedCategoryCodes: ['food.dessert'], categoryScope: { kind: 'only', categoryCodes: ['food.restaurant'] } }, budget: { ...intent().budget, unknownPricePolicy: 'exclude' } });
  const invalid = routeState([routeStop(1, place(excludedId))]);
  assert.equal(validateGuidedItinerary(invalid, { intent: value }).valid, false);
  const unknown = routeState([routeStop(1, place('unknown', { has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null, currency_code: null }))]);
  assert.equal(validateGuidedItinerary(unknown, { intent: value }).valid, false);
});

test('Guided finalization preserves must-visit anchors and their assigned stages', () => {
  const anchorValue = intent({ anchors: [{ placeId, intent: 'must_visit', order: { kind: 'any' } }] });
  const inclusion = [{ placeId, intent: 'must_visit', outcome: 'included', stageId: 'stage-1' }] as const;
  const valid = routeState([routeStop(1, place())]);
  assert.ok(finalizeItinerary(valid, { intent: anchorValue, anchorInclusions: inclusion }));

  const missing = routeState([routeStop(1, center)]);
  assert.equal(finalizeItinerary(missing, { intent: anchorValue, anchorInclusions: inclusion }), null);

  const wrongStage = routeState([routeStop(1, center), routeStop(2, place())]);
  assert.equal(finalizeItinerary(wrongStage, { intent: anchorValue, anchorInclusions: [{ ...inclusion[0], stageId: 'stage-1' }] }), null, 'an anchor cannot be silently moved to a different stage');
});
