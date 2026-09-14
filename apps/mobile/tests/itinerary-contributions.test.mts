import assert from 'node:assert/strict';
import test from 'node:test';
import { contributionCopy, contributionTarget, contributionTargets, submitContribution } from '../src/services/itinerary-contributions.ts';
import { createExecution, executionStopId, markExecutionContributed, transitionExecution } from '../src/services/itinerary-execution.ts';
import { createItineraryExecutionStore, decodeLiveItinerary, encodeLiveItinerary } from '../src/services/itinerary-execution-storage.ts';
import { parsePesoToMinor, validateVisitReport } from '../src/services/community-utils.ts';

// Synthetic development fixtures only.
const plan = (): any => ({
  finalized: true, start: { latitude: 0, longitude: 0, label: 'Test origin' }, budgetMinor: 100000, partySize: 2,
  stages: ['A', 'B', 'C'].map((id) => ({ id, title: `Test ${id}`, categoryCodes: ['test.category'], required: true, source: 'wise' })),
  stops: ['A', 'B', 'C'].map((id) => ({ stageId: id, place: { place_id: `test-${id}`, name: `TEST DATA ${id}`, latitude: 0, longitude: 0, has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null } })),
});
const context = { itineraryId: 'X', stopId: executionStopId(plan().stops[0]), placeId: 'test-A' };
const input = { placeId: 'test-A', rating: 4, totalSpendMinor: null, partySize: null, visitType: null, visitDate: '2026-09-01', shortNote: 'Synthetic test comment' };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function fixture(choices = ['complete', 'skip', 'complete']) {
  let saved: string | null = null; let failSave = false;
  const storage = { getItem: async () => saved, setItem: async (_key: string, value: string) => { if (failSave) throw new Error('Test disk failure'); saved = value; } };
  const store = createItineraryExecutionStore(storage); await store.hydrate(); store.finalize('X', plan());
  store.dispatch({ type: 'start', itineraryId: 'X' });
  choices.forEach((type, index) => store.dispatch({ type: type as 'complete' | 'skip', itineraryId: 'X', stopId: executionStopId(plan().stops[index]) }));
  await tick();
  return { store, storage, fail: (value: boolean) => { failSave = value; } };
}

test('only completed stops in a completed execution are contribution targets', async () => {
  const { store } = await fixture();
  assert.deepEqual(contributionTargets(store.getSnapshot().active).map((stop) => stop.place.place_id), ['test-A', 'test-C']);
  const execution = createExecution('X', plan());
  assert.deepEqual(contributionTargets({ itinerary: plan(), execution }), []);
  const started = transitionExecution(execution, { type: 'start', itineraryId: 'X' });
  const active = transitionExecution(started, { type: 'complete', itineraryId: 'X', stopId: context.stopId });
  assert.deepEqual(contributionTargets({ itinerary: plan(), execution: active }), []);
  assert.equal(markExecutionContributed(active, 'X', context.stopId), active);
  assert.deepEqual(contributionTargets((await fixture(['skip', 'skip', 'skip'])).store.getSnapshot().active), []);
});

test('successful service submission precedes shared state; restart preserves shared and unshared stops', async () => {
  const { store, storage } = await fixture();
  let resolve!: () => void;
  const submission = submitContribution(input, context, { getActive: () => store.getSnapshot().active, markContributed: store.markContributed,
    submitReport: async (report) => { assert.deepEqual(report, input); await new Promise<void>((done) => { resolve = done; }); },
  });
  assert.equal(contributionTarget(store.getSnapshot().active, context)?.shared, false);
  resolve(); await submission;
  const restarted = createItineraryExecutionStore(storage); await restarted.hydrate();
  assert.deepEqual(contributionTargets(restarted.getSnapshot().active).map((stop) => stop.shared), [true, false]);
  assert.equal(restarted.getSnapshot().active?.execution.status, 'completed');
  assert.deepEqual(restarted.getSnapshot().active?.execution.stops.map((stop) => stop.status), ['completed', 'skipped', 'completed']);
});

test('failed network, auth or duplicate-date writes never mark shared and allow retry', async () => {
  const { store } = await fixture();
  for (const message of ['Test offline', 'Sign in to submit a visit report.', 'You already have an active report for this place on that date.']) {
    await assert.rejects(submitContribution(input, context, { getActive: () => store.getSnapshot().active, markContributed: store.markContributed, submitReport: async () => { throw new Error(message); } }), { message });
    assert.equal(contributionTarget(store.getSnapshot().active, context)?.shared, false);
  }
  await submitContribution(input, context, { getActive: () => store.getSnapshot().active, markContributed: store.markContributed, submitReport: async () => {} });
  assert.equal(contributionTarget(store.getSnapshot().active, context)?.shared, true);
});

test('exact stage/place and execution identities reject stale, skipped, forged and duplicate contributions', async () => {
  const { store } = await fixture(); let writes = 0;
  const dependencies = { getActive: () => store.getSnapshot().active, markContributed: store.markContributed, submitReport: async () => { writes++; } };
  for (const invalid of [{ ...context, itineraryId: 'Y' }, { ...context, placeId: 'test-C' }, { ...context, stopId: 'TEST DATA A' }, { ...context, placeId: 'test-B', stopId: executionStopId(plan().stops[1]) }]) {
    await assert.rejects(submitContribution(input, invalid, dependencies), /no longer available/);
  }
  await assert.rejects(submitContribution({ ...input, placeId: 'test-C' }, context, dependencies), /no longer available/);
  assert.equal(writes, 0);
  await submitContribution(input, context, dependencies);
  await assert.rejects(submitContribution(input, context, dependencies), /no longer available/);
  assert.equal(writes, 1);
  assert.equal(await store.markContributed('X', executionStopId(plan().stops[1])), false);
});

test('new execution and late completion of an old request cannot inherit contribution state', async () => {
  const { store } = await fixture(); let resolve!: () => void;
  const pending = submitContribution(input, context, { getActive: () => store.getSnapshot().active, markContributed: store.markContributed, submitReport: async () => new Promise<void>((done) => { resolve = done; }) });
  await store.clear('X'); store.finalize('Y', plan()); store.dispatch({ type: 'start', itineraryId: 'Y' });
  plan().stops.forEach((stop: any) => store.dispatch({ type: 'complete', itineraryId: 'Y', stopId: executionStopId(stop) }));
  resolve(); await pending;
  assert.deepEqual(contributionTargets(store.getSnapshot().active).map((stop) => stop.shared), [false, false, false]);
});

test('old v1 snapshots and malformed optional metadata preserve the outing with safe defaults', async () => {
  const { store } = await fixture(); const active = store.getSnapshot().active!;
  for (const metadata of [undefined, 'bad', null, {}, [context.stopId, context.stopId, 5, 'unknown', executionStopId(plan().stops[1])]]) {
    const raw = encodeLiveItinerary({ ...active, execution: { ...active.execution, contributedStopKeys: metadata as any } });
    const decoded = decodeLiveItinerary(raw);
    assert.equal(decoded.invalid, false);
    assert.equal(decoded.active?.execution.status, 'completed');
    assert.deepEqual(decoded.active?.execution.contributedStopKeys, Array.isArray(metadata) ? [context.stopId] : []);
  }
});

test('local save failure exposes retry without resubmitting the successful community report', async () => {
  const { store, storage, fail } = await fixture(); let writes = 0; fail(true);
  await submitContribution(input, context, { getActive: () => store.getSnapshot().active, markContributed: store.markContributed, submitReport: async () => { writes++; } });
  assert.equal(contributionTarget(store.getSnapshot().active, context)?.shared, true);
  assert.match(store.getSnapshot().error!, /Retry/);
  fail(false); await store.retry();
  const restarted = createItineraryExecutionStore(storage); await restarted.hydrate();
  assert.equal(contributionTarget(restarted.getSnapshot().active, context)?.shared, true); assert.equal(writes, 1);
});

test('blank price is absent, explicit zero is free, and existing rating/comment validation remains authoritative', () => {
  assert.equal(parsePesoToMinor('  '), null); assert.equal(parsePesoToMinor('0.00'), 0);
  assert.equal(validateVisitReport(input), null);
  assert.equal(validateVisitReport({ ...input, totalSpendMinor: 0, partySize: 2 }), null);
  assert.match(validateVisitReport({ ...input, rating: null })!, /Add a rating/);
  assert.equal(validateVisitReport({ ...input, rating: null, totalSpendMinor: 0, partySize: 1 }), null);
  assert.match(validateVisitReport({ ...input, rating: 0 })!, /rating/);
  assert.match(validateVisitReport({ ...input, shortNote: 'x'.repeat(501) })!, /500/);
});

test('category-aware wording stays small, deterministic and neutral for unknown categories', () => {
  for (const code of ['food.restaurant', 'food.cafe', 'food.dessert']) assert.equal(contributionCopy(code).spend, 'How much did you spend?');
  for (const code of ['attraction', 'attraction.museum', 'attraction.culture', 'attraction.gallery']) assert.equal(contributionCopy(code).spend, 'How much was admission?');
  for (const code of ['activity.recreation', 'entertainment.cinema']) assert.equal(contributionCopy(code).heading, 'How was the experience?');
  assert.equal(contributionCopy(null).heading, 'How was your visit?');
});
