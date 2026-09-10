import assert from 'node:assert/strict';
import test from 'node:test';

import { activityFocusFor } from '../src/services/ask-wise-normalization.ts';
import { customizeNavigation } from '../src/services/customize-ui.ts';
import { activityCategoryCodes, addUserStage, buildStages, finalizeItinerary, mapStops, MAX_ITINERARY_STOPS, removeUserStage, selectStop, selectedTotals, stageOrigin, stageOriginKey } from '../src/services/itinerary.ts';
import { orderStageCandidates, visibleStageCandidates } from '../src/services/food-candidate-diversity.ts';
import { guidedSelectionTransition } from '../src/services/guided-selection.ts';
import { stageProgressOffset } from '../src/services/stage-progress.ts';

const place = (id: string, category = 'activity.recreation', options: { priced?: boolean; min?: number | null; max?: number | null; latitude?: number } = {}) => ({
  place_id: id,
  name: id,
  latitude: options.latitude ?? 14.55,
  longitude: 121.05,
  category_code: category,
  category_name: category,
  has_price: options.priced ?? true,
  estimated_group_min_minor: options.min ?? ((options.priced ?? true) ? 10000 : null),
  estimated_group_max_minor: options.max ?? ((options.priced ?? true) ? 10000 : null),
} as any);

const sixStageState = () => {
  let state: any = { start: { latitude: 14.55, longitude: 121.05, label: 'BGC' }, budgetMinor: 300000, partySize: 4, stages: buildStages(['food_talk', 'activity_fun']), stops: [] };
  for (const category of ['dessert', 'cafe', 'attraction', 'outdoor'] as const) state = addUserStage(state, category);
  return state;
};

test('generic friends and date shortlists reserve their first cards for supported consumer leisure destinations', () => {
  const fixture = [
    place('Cinema', 'entertainment.cinema'), place('Recreation Center', 'activity.recreation'), place('Tourist Attraction', 'attraction'),
    place('Museum', 'attraction.museum'), place('Major Park', 'outdoor.park'), place('Arcade', 'entertainment'),
    place('Gallery', 'attraction.culture'), place('Bowling', 'activity.recreation'), place('Minor Monument', 'attraction.culture'),
    place('Barangay Hall', 'attraction.culture'), place('Government Office', 'attraction'),
  ];
  for (const outingContext of ['friends_group', 'date'] as const) {
    const ranked = orderStageCandidates(activityCategoryCodes(), fixture, { outingContext });
    for (const strong of ['Cinema', 'Recreation Center', 'Tourist Attraction', 'Museum', 'Major Park', 'Arcade', 'Gallery', 'Bowling']) {
      assert.ok(ranked.findIndex((candidate) => candidate.name === strong) < ranked.findIndex((candidate) => candidate.name === 'Minor Monument'));
    }
    assert.ok(ranked.findIndex((candidate) => candidate.name === 'Minor Monument') < ranked.findIndex((candidate) => candidate.name === 'Barangay Hall'));
  }
  const shortlist = visibleStageCandidates(activityCategoryCodes(), fixture).map((candidate) => candidate.name);
  assert.equal(shortlist.length, 8);
  assert.equal(shortlist.includes('Minor Monument'), false);
  assert.equal(shortlist.includes('Barangay Hall'), false);
  assert.equal(shortlist.includes('Government Office'), false);
});

test('explicit monument and park intent remain stronger than generic suitability deferral', () => {
  const fixture = [place('Minor Monument', 'attraction.culture'), place('Tourist Landmark', 'attraction'), place('Major Park', 'outdoor.park'), place('Cinema', 'entertainment.cinema')];
  assert.equal(activityFocusFor('Show me a monument nearby'), 'landmark');
  const landmarkRanked = orderStageCandidates(['attraction', 'attraction.culture'], fixture, { activityFocus: 'landmark' });
  assert.ok(landmarkRanked.findIndex((candidate) => candidate.name === 'Minor Monument') < landmarkRanked.findIndex((candidate) => candidate.name === 'Cinema'));
  assert.equal(orderStageCandidates(activityCategoryCodes(), fixture, { activityFocus: 'outdoor' })[0]?.name, 'Major Park');
});

test('six stages have sequential progress, Back/Next transitions, and a final review transition', () => {
  const state = sixStageState();
  assert.equal(state.stages.length, 6);
  for (let index = 0; index < state.stages.length; index += 1) {
    assert.ok(stageProgressOffset(index, state.stages.length, 320) >= 0);
    assert.deepEqual(guidedSelectionTransition(index, state.stages.length, false), index === 5 ? { kind: 'review' } : { kind: 'stage', stageIndex: index + 1 });
    assert.equal(customizeNavigation(state, index).backDisabled, index === 0);
    if (index >= 3) assert.equal(customizeNavigation(state, index, { loading: true }).canContinue, false);
  }
});

test('a six-stop replacement refreshes downstream origin identity even when coordinates are unchanged', () => {
  let state = sixStageState();
  for (const [index, name] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) state = selectStop(state, state.stages[index].id, place(name, 'activity.recreation', { latitude: 14.55 }));
  assert.deepEqual(state.stages.slice(1).map((_, index) => stageOrigin(state, index + 1).label), ['A', 'B', 'C', 'D', 'E']);
  const downstreamKey = stageOriginKey(state, 3);
  state = selectStop(state, state.stages[2].id, place('C2', 'activity.recreation', { latitude: 14.55 }));
  assert.equal(stageOrigin(state, 3).label, 'C2');
  assert.notEqual(stageOriginKey(state, 3), downstreamKey);
});

test('removing a middle user-added stop retains all later stops and rebuilds the six-stop origin chain', () => {
  let state = sixStageState();
  for (const [index, name] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) state = selectStop(state, state.stages[index].id, place(name));
  const middle = state.stages[3];
  state = removeUserStage(state, middle.id);
  assert.deepEqual(mapStops(state).map((stop) => stop.place.name), ['A', 'B', 'C', 'E', 'F']);
  assert.deepEqual(state.stages.slice(1).map((_, index) => stageOrigin(state, index + 1).label), ['A', 'B', 'C', 'E']);
  assert.equal(state.stops.some((stop) => stop.stageId === middle.id), false);
});

test('early, middle, and final user-added removals clamp the sequence without leaving deleted selections', () => {
  for (const removedIndex of [2, 3, 5]) {
    let state = sixStageState();
    for (const [index, name] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) state = selectStop(state, state.stages[index].id, place(name));
    const removed = state.stages[removedIndex]!;
    state = removeUserStage(state, removed.id);
    assert.equal(state.stages.length, 5);
    assert.equal(state.stops.some((stop) => stop.stageId === removed.id), false);
    assert.equal(mapStops(state).some((stop) => stop.place.name === ['A', 'B', 'C', 'D', 'E', 'F'][removedIndex]), false);
  }
});

test('a View more selection for stage five uses stage four as origin and changes only stage five', () => {
  let state = sixStageState();
  for (const [index, name] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) state = selectStop(state, state.stages[index].id, place(name));
  const stageFive = state.stages[4];
  assert.equal(stageOrigin(state, 4).label, 'D');
  state = selectStop(state, stageFive.id, place('E2'));
  assert.deepEqual(mapStops(state).map((stop) => stop.place.name), ['A', 'B', 'C', 'D', 'E2', 'F']);
});

test('six is the hard maximum and finalization retains every selected stop', () => {
  let state = sixStageState();
  for (const [index, name] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) state = selectStop(state, state.stages[index].id, place(name));
  assert.equal(addUserStage(state, 'outdoor').stages.length, MAX_ITINERARY_STOPS);
  const finalized = finalizeItinerary(state);
  assert.equal(finalized.finalized, true);
  assert.deepEqual(mapStops(finalized).map((stop) => stop.number), [1, 2, 3, 4, 5, 6]);
});

test('six-stop mixed pricing keeps unknown distinct from grounded free and totals only reliable prices', () => {
  let state = sixStageState();
  const selected = [
    place('Known 1', 'food.restaurant', { min: 10000, max: 15000 }), place('Unknown', 'activity.recreation', { priced: false }),
    place('Free', 'food.dessert', { min: 0, max: 0 }), place('Known 2', 'food.cafe', { min: 25000, max: 30000 }),
    place('Known 3', 'attraction', { min: 5000, max: 5000 }), place('Known 4', 'outdoor.park', { min: 0, max: 0 }),
  ];
  selected.forEach((candidate, index) => { state = selectStop(state, state.stages[index].id, candidate); });
  assert.deepEqual(selectedTotals(state.stops), { minAmountMinor: 40000, maxAmountMinor: 50000, uncertain: true, knownStopCount: 5, unknownStopCount: 1 });
});
