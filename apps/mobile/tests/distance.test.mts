import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDistance, geodesicDistanceMeters } from '../src/services/distance.ts';
import { addUserStage, buildStages, removeStop, selectStop, type ItineraryState } from '../src/services/itinerary.ts';
import { sequentialStopDistances, stageDistanceLabel, stageDistanceOrigin } from '../src/services/planning-distance.ts';

const place = (id: string, latitude: number, longitude: number) => ({
  place_id: id,
  name: id,
  latitude,
  longitude,
  category_name: 'Test place',
  category_code: 'test',
  has_price: false,
  estimated_group_min_minor: null,
  estimated_group_max_minor: null,
} as any);

const baseState = (): ItineraryState => ({
  start: { latitude: 0, longitude: 0, label: 'Planning origin' },
  budgetMinor: 100_000,
  partySize: 1,
  stages: buildStages(['food_talk', 'activity_fun', 'cafe']),
  stops: [],
});

test('geodesic distance is deterministic for identical and known nearby coordinates', () => {
  assert.equal(geodesicDistanceMeters(14.5547, 121.0244, 14.5547, 121.0244), 0);
  const nearby = geodesicDistanceMeters(14.5547, 121.0244, 14.5647, 121.0244);
  assert.ok(nearby !== null && Math.abs(nearby - 1_112) < 10);
});

test('geodesic distance rejects missing, non-finite, and out-of-bounds coordinates', () => {
  assert.equal(geodesicDistanceMeters(91, 0, 0, 0), null);
  assert.equal(geodesicDistanceMeters(0, 181, 0, 0), null);
  assert.equal(geodesicDistanceMeters(undefined, 0, 0, 0), null);
  assert.equal(geodesicDistanceMeters(0, null, 0, 0), null);
  assert.equal(geodesicDistanceMeters(Number.NaN, 0, 0, 0), null);
  assert.equal(geodesicDistanceMeters(0, Number.POSITIVE_INFINITY, 0, 0), null);
});

test('distance formatter applies stable meter and kilometer boundaries', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [40, '< 50 m'], [120, '120 m'], [999, '999 m'], [1_000, '1.0 km'],
    [1_240, '1.2 km'], [9_800, '9.8 km'], [10_000, '10 km'], [12_500, '13 km'],
  ];
  for (const [meters, expected] of cases) assert.equal(formatDistance(meters), expected);
  assert.equal(formatDistance(Number.NaN), null);
  assert.equal(formatDistance(Number.POSITIVE_INFINITY), null);
  assert.equal(formatDistance(-1), null);
});

test('stage candidate metadata follows planning origin then immediately preceding selections', () => {
  const initial = baseState();
  const a = place('A', 0, 0.01); const b = place('B', 0, 0.02); const c = place('C', 0, 0.03);
  const state = selectStop(selectStop(selectStop(initial, initial.stages[0]!.id, a), initial.stages[1]!.id, b), initial.stages[2]!.id, c);

  assert.deepEqual(stageDistanceOrigin(state, 0), { coordinates: initial.start, relation: 'planning-origin' });
  assert.deepEqual(stageDistanceOrigin(state, 1), { coordinates: { latitude: a.latitude, longitude: a.longitude }, relation: 'previous-stop' });
  assert.deepEqual(stageDistanceOrigin(state, 2), { coordinates: { latitude: b.latitude, longitude: b.longitude }, relation: 'previous-stop' });
  const distances = sequentialStopDistances(state);
  assert.equal(distances[0]?.distanceMeters, geodesicDistanceMeters(0, 0, a.latitude, a.longitude));
  assert.equal(distances[1]?.distanceMeters, geodesicDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude));
  assert.equal(distances[2]?.distanceMeters, geodesicDistanceMeters(b.latitude, b.longitude, c.latitude, c.longitude));
  assert.notEqual(distances[1]?.distanceMeters, geodesicDistanceMeters(0, 0, b.latitude, b.longitude));
  assert.notEqual(distances[2]?.distanceMeters, geodesicDistanceMeters(0, 0, c.latitude, c.longitude));
});

test('replacing an earlier stop recomputes both adjacent distance segments', () => {
  const initial = baseState(); const a = place('A', 0, 0.01); const b = place('B', 0, 0.02); const b2 = place('B2', 0.01, 0.02); const c = place('C', 0, 0.03);
  const state = selectStop(selectStop(selectStop(initial, initial.stages[0]!.id, a), initial.stages[1]!.id, b), initial.stages[2]!.id, c);
  const replaced = selectStop(state, initial.stages[1]!.id, b2);
  const distances = sequentialStopDistances(replaced);
  assert.equal(distances[0]?.distanceMeters, geodesicDistanceMeters(0, 0, a.latitude, a.longitude));
  assert.equal(distances[1]?.distanceMeters, geodesicDistanceMeters(a.latitude, a.longitude, b2.latitude, b2.longitude));
  assert.equal(distances[2]?.distanceMeters, geodesicDistanceMeters(b2.latitude, b2.longitude, c.latitude, c.longitude));
  assert.notEqual(distances[2]?.distanceMeters, geodesicDistanceMeters(b.latitude, b.longitude, c.latitude, c.longitude));
});

test('removing a stop rebuilds adjacency from the remaining selections', () => {
  const initial = baseState(); const a = place('A', 0, 0.01); const b = place('B', 0.01, 0.02); const c = place('C', 0, 0.03);
  const state = selectStop(selectStop(selectStop(initial, initial.stages[0]!.id, a), initial.stages[1]!.id, b), initial.stages[2]!.id, c);
  const distances = sequentialStopDistances(removeStop(state, initial.stages[1]!.id));
  assert.equal(distances.length, 2);
  assert.equal(distances[1]?.distanceMeters, geodesicDistanceMeters(a.latitude, a.longitude, c.latitude, c.longitude));
});

test('Customize and View More share one active-stage origin and label', () => {
  const initial = baseState(); const a = place('A', 0, 0.01); const candidate = place('X', 0, 0.02);
  const state = selectStop(initial, initial.stages[0]!.id, a);
  const sharedOrigin = stageDistanceOrigin(state, 1);
  const customizeLabel = stageDistanceLabel(sharedOrigin, candidate);
  const viewMoreLabel = stageDistanceLabel(sharedOrigin, candidate);
  assert.equal(customizeLabel, viewMoreLabel);
  assert.match(customizeLabel!, /from previous stop$/);
});

test('an added stop uses the final selected stop as its candidate origin', () => {
  const initial = baseState(); const a = place('A', 0, 0.01); const b = place('B', 0, 0.02); const c = place('C', 0, 0.03);
  const selected = selectStop(selectStop(selectStop(initial, initial.stages[0]!.id, a), initial.stages[1]!.id, b), initial.stages[2]!.id, c);
  const extended = addUserStage(selected, 'cinema');
  assert.deepEqual(stageDistanceOrigin(extended, 3), { coordinates: { latitude: c.latitude, longitude: c.longitude }, relation: 'previous-stop' });
});

test('missing destination coordinates hide stage distance metadata', () => {
  assert.equal(stageDistanceLabel(stageDistanceOrigin(baseState(), 0), { latitude: Number.NaN, longitude: 0 }), null);
});
