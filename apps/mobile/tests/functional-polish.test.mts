import assert from 'node:assert/strict';
import test from 'node:test';

import { outingContextFor } from '../src/services/ask-wise-normalization.ts';
import { customizeNavigation } from '../src/services/customize-ui.ts';
import { orderStageCandidates } from '../src/services/food-candidate-diversity.ts';
import { addUserStage, buildStages, finalizeItinerary, mapStops, removeUserStage, selectStop, stageIndexAfterRemoval, stageOrigin } from '../src/services/itinerary.ts';
import { stageProgressOffset } from '../src/services/stage-progress.ts';

const place = (id: string, category = 'food.restaurant', priced = true) => ({ place_id: id, name: id, latitude: Number(id.charCodeAt(0)), longitude: 121, category_code: category, category_name: category, has_price: priced, estimated_group_min_minor: priced ? 10000 : null, estimated_group_max_minor: priced ? 15000 : null } as any);
const base = () => ({ start: { latitude: 1, longitude: 2, label: 'Start' }, budgetMinor: 100000, partySize: 4, stages: buildStages(['food_talk', 'activity_fun']), stops: [] } as any);

test('current required stage cannot progress while loading or before its resolved selection is valid', () => {
  const state = base();
  assert.equal(customizeNavigation(state, 0, { loading: true, currentSelectionValid: false }).canContinue, false);
  const selected = selectStop(state, state.stages[0].id, place('A'));
  assert.equal(customizeNavigation(selected, 0, { loading: false, currentSelectionValid: false }).canContinue, false);
  assert.equal(customizeNavigation(selected, 0, { loading: false, currentSelectionValid: true }).canContinue, true);
});

test('progress helpers support compact and scrollable 2, 3, 4, and 6 stop plans', () => {
  for (const count of [2, 3, 4, 6]) {
    const offset = stageProgressOffset(count - 1, count, 320);
    assert.ok(offset >= 0);
    if (count >= 4) assert.ok(offset > 0);
  }
});

test('date and group context are deterministic venue-type adjustments while explicit intent remains dominant', () => {
  assert.equal(outingContextFor('I have a date tonight'), 'date');
  assert.equal(outingContextFor('Four friends in BGC tonight'), 'friends_group');
  assert.equal(outingContextFor('Me and my kids'), 'family');
  assert.equal(outingContextFor('Just me'), 'solo');
  const food = [place('Jollibee', 'food.fast_food'), place('Restaurant', 'food.restaurant'), place('Cafe', 'food.cafe')];
  assert.equal(orderStageCandidates(['food'], food, { outingContext: 'date' })[0]?.place_id, 'Restaurant');
  assert.equal(orderStageCandidates(['food'], food, { explicitQuickService: true, outingContext: 'date' })[0]?.place_id, 'Jollibee');
  const activity = [place('City Hall', 'attraction'), place('Cinema', 'entertainment.cinema'), place('Museum', 'attraction.museum'), place('Bowling', 'activity.recreation')];
  const ranked = orderStageCandidates(['attraction', 'entertainment', 'activity.recreation'], activity, { outingContext: 'friends_group' });
  assert.ok(ranked.findIndex((item) => item.place_id === 'Cinema') < ranked.findIndex((item) => item.place_id === 'City Hall'));
  assert.equal(orderStageCandidates(['entertainment.cinema'], activity, { activityFocus: 'cinema', outingContext: 'date' })[0]?.place_id, 'Cinema');
});

test('origin chains and index clamping survive replacement and middle-stage removal', () => {
  let state = base();
  state = addUserStage(addUserStage(state, 'dessert'), 'outdoor');
  for (const [index, id] of ['A', 'B', 'C', 'D'].entries()) state = selectStop(state, state.stages[index].id, place(id));
  assert.equal(stageOrigin(state, 1).label, 'A'); assert.equal(stageOrigin(state, 2).label, 'B'); assert.equal(stageOrigin(state, 3).label, 'C');
  state = selectStop(state, state.stages[1].id, place('E'));
  assert.equal(stageOrigin(state, 2).label, 'E');
  const removed = removeUserStage(state, state.stages[2].id);
  assert.deepEqual(removed.stops.map((stop: any) => stop.place.place_id), ['A', 'E', 'D']);
  assert.equal(stageOrigin(removed, 2).label, 'E');
  assert.equal(stageIndexAfterRemoval(3, 1, 3), 2);
  assert.equal(stageIndexAfterRemoval(2, 2, 3), 2);
  assert.equal(stageIndexAfterRemoval(3, 3, 3), 2);
});

test('add/remove/replace preserve unknown pricing rather than converting it to free', () => {
  let state = base();
  state = selectStop(state, state.stages[0].id, place('A', 'food.restaurant', false));
  state = addUserStage(state, 'dessert');
  state = selectStop(state, state.stages[2].id, place('C', 'food.dessert', true));
  assert.equal(state.stops.filter((stop: any) => !stop.place.has_price).length, 1);
  state = removeUserStage(state, state.stages[2].id);
  assert.equal(state.stops[0].place.estimated_group_min_minor, null);
});

test('a six-stop itinerary retains sequence and finalizes without a two-stop assumption', () => {
  let state = base();
  for (const category of ['dessert', 'cafe', 'entertainment', 'outdoor'] as const) state = addUserStage(state, category);
  state.stages.forEach((stage: any, index: number) => { state = selectStop(state, stage.id, place(String.fromCharCode(65 + index))); });
  assert.deepEqual(mapStops(state).map((stop) => stop.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(finalizeItinerary(state).stops.length, 6);
});

test('an alternative selected for stage four of five replaces only that stage', () => {
  let state = base();
  for (const category of ['dessert', 'cafe', 'outdoor'] as const) state = addUserStage(state, category);
  state.stages.forEach((stage: any, index: number) => { state = selectStop(state, stage.id, place(`Stop ${index + 1}`)); });
  const stageFour = state.stages[3];
  state = selectStop(state, stageFour.id, place('Stage four alternative'));
  assert.equal(state.stops[3].stageId, stageFour.id);
  assert.deepEqual(state.stops.filter((stop: any) => stop.stageId !== stageFour.id).map((stop: any) => stop.place.place_id), ['Stop 1', 'Stop 2', 'Stop 3', 'Stop 5']);
});
