import assert from 'node:assert/strict';
import test from 'node:test';

import { addUserStage, buildStages, filterCandidatesForStage, removeUserStage, selectStop, selectedPlaceExclusionKey, type ItineraryState } from '../src/services/itinerary.ts';
import { buildWiseProposal } from '../src/services/wise-proposal.ts';

const place = (id: string, name = id, chain = '') => ({
  place_id: id, name, chain_name: chain || null, latitude: 14.55, longitude: 121.05,
  category_name: 'Place', category_code: 'entertainment', has_price: true,
  estimated_group_min_minor: 10000, estimated_group_max_minor: 10000, budget_status: 'fits',
} as any);

const stateWithStages = (count: number): ItineraryState => ({
  start: { latitude: 14.55, longitude: 121.05, label: 'Start' }, budgetMinor: 300000, partySize: 2,
  stages: buildStages(Array.from({ length: count }, () => 'activity_fun')),
  stops: [],
});

const ids = (candidates: readonly { place_id: string }[]) => candidates.map((candidate) => candidate.place_id);

test('candidate pools exclude exact place IDs selected by other stages before ranking', () => {
  let state = stateWithStages(3);
  state = selectStop(state, state.stages[0]!.id, place('A'));
  state = selectStop(state, state.stages[1]!.id, place('B'));
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[2]!.id, [place('A'), place('B'), place('C'), place('D')])), ['C', 'D']);
});

test('editing a stage retains its own selection while excluding every other selected ID', () => {
  let state = stateWithStages(3);
  state = selectStop(state, state.stages[0]!.id, place('A'));
  state = selectStop(state, state.stages[1]!.id, place('B'));
  state = selectStop(state, state.stages[2]!.id, place('C'));
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[2]!.id, [place('A'), place('B'), place('C'), place('D')])), ['C', 'D']);
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[2]!.id, [place('A'), place('B'), place('D')])), ['C', 'D']);
});

test('replacement and removal derive exclusions from current state rather than a permanent blacklist', () => {
  let state = stateWithStages(3);
  state = selectStop(state, state.stages[0]!.id, place('A'));
  state = selectStop(state, state.stages[1]!.id, place('B'));
  state = selectStop(state, state.stages[1]!.id, place('C'));
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[2]!.id, [place('A'), place('B'), place('C'), place('D')])), ['B', 'D']);

  let removable = stateWithStages(2);
  removable = addUserStage(removable, 'entertainment');
  removable = selectStop(removable, removable.stages[0]!.id, place('A'));
  removable = selectStop(removable, removable.stages[1]!.id, place('B'));
  const removableStage = removable.stages[2]!;
  removable = selectStop(removable, removableStage.id, place('C'));
  removable = removeUserStage(removable, removableStage.id);
  removable = addUserStage(removable, 'entertainment');
  const newStage = removable.stages.at(-1)!;
  assert.deepEqual(ids(filterCandidatesForStage(removable, newStage.id, [place('A'), place('B'), place('C'), place('D')])), ['C', 'D']);
});

test('View more and user-added stages use the same complete eligible pool', () => {
  let state = stateWithStages(2);
  state = selectStop(state, state.stages[0]!.id, place('A'));
  state = selectStop(state, state.stages[1]!.id, place('B'));
  state = addUserStage(state, 'entertainment');
  const addedStage = state.stages.at(-1)!;
  const viewMoreSource = [place('A'), place('B'), place('C'), place('D')];
  assert.deepEqual(ids(filterCandidatesForStage(state, addedStage.id, viewMoreSource)), ['C', 'D']);
});

test('six-stop pools exclude all five exact selected IDs', () => {
  let state = stateWithStages(6);
  for (const [index, id] of ['A', 'B', 'C', 'D', 'E'].entries()) state = selectStop(state, state.stages[index]!.id, place(id));
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[5]!.id, ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => place(id)))), ['F', 'G']);
});

test('exact IDs, not chain names or display names, define duplicate prevention', () => {
  let state = stateWithStages(2);
  state = selectStop(state, state.stages[0]!.id, place('1', 'Jollibee Branch A', 'Jollibee'));
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[1]!.id, [place('1', 'Jollibee Branch A', 'Jollibee'), place('2', 'Jollibee Branch B', 'Jollibee')])), ['2']);

  state = selectStop(state, state.stages[0]!.id, place('200', 'The Theater'));
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[1]!.id, [place('100', 'The Theater'), place('200', 'The Theater')])), ['100']);
});

test('selection itself rejects a duplicate from a stale candidate session and invalidates downstream pools', () => {
  let state = stateWithStages(3);
  state = selectStop(state, state.stages[0]!.id, place('A'));
  state = selectStop(state, state.stages[1]!.id, place('B'));
  const before = selectedPlaceExclusionKey(state, state.stages[2]!.id);
  state = selectStop(state, state.stages[1]!.id, place('C'));
  const after = selectedPlaceExclusionKey(state, state.stages[2]!.id);
  assert.notEqual(after, before);
  assert.deepEqual(ids(filterCandidatesForStage(state, state.stages[2]!.id, [place('B'), place('C'), place('D')])), ['B', 'D']);
  const rejected = selectStop(state, state.stages[2]!.id, place('C'));
  assert.equal(rejected, state);
});

test('proposal and Try another generation never select the same exact place twice', async () => {
  const intent: any = { location: null, partySize: 2, budgetMinor: 100000, currencyCode: 'PHP', timeContext: 'tonight', preferences: [], exclusions: [], stages: ['activity_fun', 'activity_fun'], inferredStages: [], activityFocus: null, explicitQuickService: false };
  const fetcher = async () => [place('A'), place('B')];
  const first = await buildWiseProposal({ intent, start: { latitude: 14.5, longitude: 121, label: 'Start' }, fetcher });
  const second = await buildWiseProposal({ intent, start: first.state.start, fetcher, excludedCombinations: first.historyKey.split('|') });
  for (const proposal of [first, second]) assert.equal(new Set(proposal.state.stops.map((stop) => stop.place.place_id)).size, proposal.state.stops.length);
});
