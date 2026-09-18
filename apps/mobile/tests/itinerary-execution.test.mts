import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createExecution, executionProgress, executionStopId, transitionExecution, type ItineraryExecution } from '../src/services/itinerary-execution.ts';
import { createItineraryExecutionStore, decodeLiveItinerary, encodeLiveItinerary, LIVE_ITINERARY_KEY } from '../src/services/itinerary-execution-storage.ts';
import { finalizeItinerary, selectStop, selectedPlaceExclusionKey } from '../src/services/itinerary.ts';
import { sequentialStopDistances } from '../src/services/planning-distance.ts';
import { startOverConfirmation } from '../src/services/planning-session.ts';

// Synthetic development fixtures, not factual business records.
const plan = () => ({
  finalized: true, start: { latitude: 14.5, longitude: 121, label: 'Test origin' }, budgetMinor: 100000, partySize: 1,
  stages: ['A', 'B', 'C'].map((id) => ({ id: `test-stage-${id}`, title: `Test ${id}`, categoryCodes: ['test.category'], required: true, source: 'wise' })),
  stops: ['A', 'B', 'C'].map((id, i) => ({ stageId: `test-stage-${id}`, place: {
    place_id: `test-place-${id}`, name: `Test place ${id}`, category_name: 'Test category', latitude: 14.51 + i * 0.01, longitude: 121,
    has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null,
  } })),
}) as any;
const initial = () => createExecution('test-itinerary-X', plan());
const start = (execution = initial()) => transitionExecution(execution, { type: 'start', itineraryId: execution.itineraryId }, '2026-09-10T01:00:00.000Z');
const advance = (execution: ItineraryExecution, type: 'complete' | 'skip' = 'complete') => transitionExecution(execution, { type, itineraryId: execution.itineraryId, stopId: executionProgress(execution).current!.id }, '2026-09-10T02:00:00.000Z');
const statuses = (execution: ItineraryExecution) => execution.stops.map((stop) => stop.status);
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function memoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return { getItem: async (key: string) => { assert.equal(key, LIVE_ITINERARY_KEY); return value; }, setItem: async (key: string, next: string) => { assert.equal(key, LIVE_ITINERARY_KEY); value = next; }, value: () => value };
}

test('initialization: finalized A/B/C starts planned, all upcoming, no current', () => {
  const execution = initial();
  assert.equal(execution.status, 'planned');
  assert.deepEqual(statuses(execution), ['upcoming', 'upcoming', 'upcoming']);
  assert.equal(executionProgress(execution).current, null);
  assert.equal(execution.startedAt, undefined);
  assert.throws(() => createExecution('empty', { ...plan(), stops: [] }));
  assert.throws(() => createExecution('draft', { ...plan(), finalized: false }));
});

test('start: exactly A is current and zero stops are completed', () => {
  const execution = start();
  assert.equal(execution.status, 'in_progress');
  assert.deepEqual(statuses(execution), ['current', 'upcoming', 'upcoming']);
  assert.equal(executionProgress(execution).completed, 0);
  assert.equal(execution.startedAt, '2026-09-10T01:00:00.000Z');
  assert.equal(start(execution), execution);
});

test('complete A, skip B, complete C advances sequentially with truthful summary and timestamps', () => {
  const a = advance(start());
  assert.deepEqual(statuses(a), ['completed', 'current', 'upcoming']);
  assert.equal(executionProgress(a).completed, 1);
  assert.equal(a.stops[0].completedAt, '2026-09-10T02:00:00.000Z');
  const b = advance(a, 'skip');
  assert.deepEqual(statuses(b), ['completed', 'skipped', 'current']);
  assert.equal(executionProgress(b).completed, 1);
  assert.equal(executionProgress(b).skipped, 1);
  assert.equal(b.stops[1].skippedAt, '2026-09-10T02:00:00.000Z');
  const c = advance(b);
  assert.equal(c.status, 'completed');
  assert.deepEqual(statuses(c), ['completed', 'skipped', 'completed']);
  assert.deepEqual(executionProgress(c), { total: 3, completed: 2, skipped: 1, remaining: 0, current: null, next: null });
  assert.equal(c.completedAt, '2026-09-10T02:00:00.000Z');
});

test('all completed, final stop skipped, all skipped, and single-stop outings finish', () => {
  for (const choices of [['complete', 'complete', 'complete'], ['complete', 'complete', 'skip'], ['skip', 'skip', 'skip']] as const) {
    const execution = choices.reduce((state, choice) => advance(state, choice), start());
    assert.equal(execution.status, 'completed');
    assert.equal(executionProgress(execution).completed, choices.filter((choice) => choice === 'complete').length);
    assert.equal(executionProgress(execution).skipped, choices.filter((choice) => choice === 'skip').length);
    assert.equal(executionProgress(execution).remaining, 0);
    assert.equal(executionProgress(execution).current, null);
  }
  for (const type of ['complete', 'skip'] as const) {
    const single = createExecution('single', { ...plan(), stops: plan().stops.slice(0, 1) });
    assert.equal(advance(start(single), type).status, 'completed');
  }
});

test('stale, double, future, and terminal actions cannot advance the wrong stop', () => {
  const planned = initial(); const running = start(planned);
  const action = { type: 'complete' as const, itineraryId: running.itineraryId, stopId: running.stops[0].id };
  assert.equal(transitionExecution(planned, action), planned);
  const once = transitionExecution(running, action);
  assert.equal(transitionExecution(once, action), once);
  assert.equal(transitionExecution(running, { ...action, stopId: running.stops[2].id }), running);
  assert.equal(transitionExecution(running, { ...action, itineraryId: 'another-outing' }), running);
  const finished = advance(advance(once));
  assert.equal(start(finished), finished);
  assert.equal(transitionExecution(finished, action), finished);
});

test('persistence: full snapshot restores identically in progress and after completion', async () => {
  const storage = memoryStorage(); const store = createItineraryExecutionStore(storage);
  await store.hydrate(); store.finalize('X', plan());
  store.dispatch({ type: 'start', itineraryId: 'X' });
  store.dispatch({ type: 'complete', itineraryId: 'X', stopId: executionStopId(plan().stops[0]) });
  await tick();
  const reopened = createItineraryExecutionStore(storage); await reopened.hydrate();
  assert.deepEqual(reopened.getSnapshot().active, store.getSnapshot().active);
  assert.deepEqual(statuses(reopened.getSnapshot().active!.execution), ['completed', 'current', 'upcoming']);
  reopened.dispatch({ type: 'skip', itineraryId: 'X', stopId: executionStopId(plan().stops[1]) });
  reopened.dispatch({ type: 'complete', itineraryId: 'X', stopId: executionStopId(plan().stops[2]) });
  await tick();
  const completedReload = createItineraryExecutionStore(storage); await completedReload.hydrate();
  assert.equal(completedReload.getSnapshot().active!.execution.status, 'completed');
  assert.deepEqual(completedReload.getSnapshot().active, reopened.getSnapshot().active);
});

test('optional itinerary currency decodes while legacy snapshots remain valid', () => {
  const legacy = { itinerary: plan(), execution: initial() };
  assert.equal(decodeLiveItinerary(encodeLiveItinerary(legacy)).invalid, false);
  const withCurrency = { ...plan(), currencyCode: 'PHP' } as any;
  const decoded = decodeLiveItinerary(encodeLiveItinerary({ itinerary: withCurrency, execution: createExecution('currency', withCurrency) }));
  assert.equal(decoded.invalid, false);
  assert.equal(decoded.active?.itinerary.currencyCode, 'PHP');
  const invalid = JSON.parse(encodeLiveItinerary({ itinerary: { ...withCurrency, currencyCode: 'peso' }, execution: createExecution('invalid-currency', withCurrency) }));
  assert.equal(decodeLiveItinerary(JSON.stringify(invalid)).invalid, true);
});

test('invalid storage never manufactures completed stops or crashes', async () => {
  const good = { itinerary: plan(), execution: start() };
  const corruptions: unknown[] = [null, {}, { version: 2, active: good }, { version: 1, active: { ...good, itinerary: {} } }];
  for (const mutate of [
    (active: any) => { active.execution.stops[1].status = 'current'; },
    (active: any) => { active.execution.stops[0].status = 'upcoming'; },
    (active: any) => { active.execution.stops[2].status = 'completed'; },
    (active: any) => { active.execution.stops[0].id = 'wrong-place'; },
    (active: any) => { active.execution.status = 'completed'; },
    (active: any) => { active.execution.status = ['completed']; active.execution.stops.forEach((stop: any) => { stop.status = 'completed'; }); },
    (active: any) => { active.execution.stops[0].status = ['current']; },
    (active: any) => { active.execution.startedAt = 'not-a-date'; },
    (active: any) => { active.execution.stops[0].completedAt = '2026-09-10T00:00:00Z'; },
    (active: any) => { active.itinerary.stops[0].place.name = {}; },
    (active: any) => { active.itinerary.start.latitude = 999; },
    (active: any) => { active.itinerary.stops[0].place.longitude = 999; },
    (active: any) => { active.itinerary.stops[0].place.estimated_group_min_minor = {}; },
    (active: any) => { active.itinerary.stops[1].place.place_id = active.itinerary.stops[0].place.place_id; },
  ]) {
    const active = JSON.parse(JSON.stringify(good)); mutate(active); corruptions.push({ version: 1, active });
  }
  for (const raw of ['{broken', ...corruptions.map((value) => JSON.stringify(value))]) {
    assert.deepEqual(decodeLiveItinerary(raw), { active: null, invalid: true });
    const store = createItineraryExecutionStore(memoryStorage(raw)); await store.hydrate();
    assert.equal(store.getSnapshot().active, null); assert.equal(store.getSnapshot().ready, true);
  }
  assert.deepEqual(decodeLiveItinerary(null), { active: null, invalid: false });
});

test('new itinerary identity is isolated even when the same stops are finalized again', async () => {
  const storage = memoryStorage(); const store = createItineraryExecutionStore(storage); await store.hydrate();
  store.finalize('X', plan()); store.dispatch({ type: 'start', itineraryId: 'X' });
  store.dispatch({ type: 'complete', itineraryId: 'X', stopId: executionStopId(plan().stops[0]) });
  assert.equal(store.finalize('Y', plan()), null, 'Replacement requires the explicit reset path');
  assert.equal(await store.clear('wrong-id'), false);
  assert.equal(await store.clear('X'), true);
  const next = store.finalize('Y', plan())!;
  assert.equal(next.execution.status, 'planned');
  assert.deepEqual(statuses(next.execution), ['upcoming', 'upcoming', 'upcoming']);
  store.dispatch({ type: 'start', itineraryId: 'X' });
  assert.equal(store.getSnapshot().active, next);
  await tick(); const reopened = createItineraryExecutionStore(storage); await reopened.hydrate();
  assert.deepEqual(reopened.getSnapshot().active, next);
});

test('finalized snapshot detaches planner references, preserves duplicate prevention and sequential distance', async () => {
  const original = plan(); const before = sequentialStopDistances(original);
  const exclusions = selectedPlaceExclusionKey(original, original.stages[0].id);
  const store = createItineraryExecutionStore(memoryStorage()); await store.hydrate();
  const active = store.finalize('X', original)!;
  original.stops[0].place.name = 'Mutated test draft'; original.stops[0].place.latitude = 0;
  assert.equal(active.itinerary.stops[0].place.name, 'Test place A');
  assert.equal(finalizeItinerary(active.itinerary), active.itinerary);
  assert.equal(selectStop(active.itinerary, active.itinerary.stages[0].id, original.stops[1].place), active.itinerary);
  store.dispatch({ type: 'start', itineraryId: 'X' });
  for (const [index, type] of ['complete', 'skip', 'complete'].entries()) {
    store.dispatch({ type: type as 'complete' | 'skip', itineraryId: 'X', stopId: active.execution.stops[index].id });
    assert.deepEqual(sequentialStopDistances(store.getSnapshot().active!.itinerary), before);
    assert.equal(selectedPlaceExclusionKey(store.getSnapshot().active!.itinerary, active.itinerary.stages[0].id), exclusions);
  }
  const duplicate = plan(); duplicate.stops[1].place.place_id = duplicate.stops[0].place.place_id;
  assert.throws(() => createExecution('duplicate', duplicate));
  assert.equal(executionStopId({ ...active.itinerary.stops[0], place: { ...active.itinerary.stops[0].place, name: 'New display name' } }), active.execution.stops[0].id);
});

test('ordered writes and confirmed clear remain durable during rapid actions', async () => {
  const base = memoryStorage(); const releases: (() => void)[] = [];
  const store = createItineraryExecutionStore({ ...base, setItem: async (key, value) => { await new Promise<void>((resolve) => releases.push(resolve)); await base.setItem(key, value); } });
  await store.hydrate(); store.finalize('X', plan()); store.dispatch({ type: 'start', itineraryId: 'X' });
  store.dispatch({ type: 'complete', itineraryId: 'X', stopId: executionStopId(plan().stops[0]) });
  await tick(); assert.equal(releases.length, 1);
  releases.shift()!(); await tick(); releases.shift()!(); await tick(); releases.shift()!(); await tick();
  assert.deepEqual(statuses(decodeLiveItinerary(base.value()).active!.execution), ['completed', 'current', 'upcoming']);
  const clear = store.clear('X'); await tick();
  store.dispatch({ type: 'skip', itineraryId: 'X', stopId: executionStopId(plan().stops[1]) });
  assert.equal(store.getSnapshot().active!.execution.stops[1].status, 'current');
  releases.shift()!(); assert.equal(await clear, true);
  assert.equal(decodeLiveItinerary(base.value()).active, null);
});

test('failed save is visible and retry persists progress; failed reset retains active itinerary', async () => {
  const base = memoryStorage(); let fails = true;
  const store = createItineraryExecutionStore({ ...base, setItem: async (key, value) => { if (fails) throw new Error('Test disk failure'); await base.setItem(key, value); } });
  await store.hydrate(); store.finalize('X', plan()); store.dispatch({ type: 'start', itineraryId: 'X' }); await tick();
  assert.match(store.getSnapshot().error!, /could not be saved/);
  assert.equal(await store.clear('X'), false); assert.equal(store.getSnapshot().active!.execution.status, 'in_progress');
  fails = false; await store.retry();
  assert.equal(store.getSnapshot().error, null);
  assert.equal(decodeLiveItinerary(base.value()).active!.execution.status, 'in_progress');
});

test('failed load cannot overwrite a saved outing; retry reloads it', async () => {
  const base = memoryStorage(encodeLiveItinerary({ itinerary: plan(), execution: advance(start()) })); let fails = true;
  const store = createItineraryExecutionStore({ ...base, getItem: async (key) => { if (fails) throw new Error('Test read failure'); return base.getItem(key); } });
  await store.hydrate(); assert.equal(store.getSnapshot().loadFailed, true);
  assert.equal(store.finalize('Y', plan()), null); assert.equal(await store.clear(), false);
  fails = false; await store.retry();
  assert.equal(store.getSnapshot().loadFailed, false);
  assert.deepEqual(statuses(store.getSnapshot().active!.execution), ['completed', 'current', 'upcoming']);
});

test('reset cancel preserves the outing and confirm clears the persisted snapshot', async () => {
  const storage = memoryStorage(); const store = createItineraryExecutionStore(storage); await store.hydrate(); store.finalize('X', plan());
  let confirmed: Promise<boolean> | undefined;
  const buttons = startOverConfirmation(() => { confirmed = store.clear('X'); });
  assert.equal(buttons[0].style, 'cancel'); assert.equal(buttons[0].onPress, undefined);
  assert.ok(store.getSnapshot().active);
  buttons[1].onPress!(); assert.equal(await confirmed, true);
  const reopened = createItineraryExecutionStore(storage); await reopened.hydrate(); assert.equal(reopened.getSnapshot().active, null);
});

test('hydration and repeated load retries share one read so late restoration cannot overwrite progress', async () => {
  let reads = 0; let release: ((value: string) => void) | undefined;
  const storage = memoryStorage(encodeLiveItinerary({ itinerary: plan(), execution: initial() }));
  const store = createItineraryExecutionStore({ ...storage, getItem: async () => {
    reads++;
    if (reads === 1) throw new Error('Test read failure');
    return new Promise<string>((resolve) => { release = resolve; });
  } });
  await Promise.all([store.hydrate(), store.hydrate()]); assert.equal(reads, 1);
  const first = store.retry(); const second = store.retry(); assert.equal(reads, 2);
  release!(storage.value()!); await Promise.all([first, second]);
  store.dispatch({ type: 'start', itineraryId: 'test-itinerary-X' }); await tick();
  assert.equal(store.getSnapshot().active!.execution.status, 'in_progress');
});

test('execution is independent of GPS/permissions and the progress UI uses semantic clay controls', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const service = source('../src/services/itinerary-execution.ts');
  const provider = source('../src/providers/itinerary-execution-provider.tsx');
  const ui = source('../src/components/itinerary/itinerary-progress.tsx');
  const card = source('../src/components/itinerary/itinerary-ui.tsx');
  const screen = source('../src/app/(tabs)/plan.tsx');
  assert.doesNotMatch(service + provider, /expo-location|requestCurrentLocation|watchPosition|geofenc|supabase/i);
  assert.match(ui, /useDesignTheme\(\)/); assert.doesNotMatch(ui, /#[\da-f]{3,8}\b/i);
  for (const label of ['Upcoming', 'Current stop', 'Completed', 'Skipped']) assert.ok(ui.includes(`label: '${label}'`));
  for (const icon of ['ellipse-outline', 'radio-button-on', 'checkmark-circle', 'return-up-forward-outline']) assert.ok(ui.includes(icon));
  assert.match(ui, /PrimaryButton label="Mark complete" accessibilityLabel=\{`Mark \$\{placeName\} complete`\}/);
  assert.match(ui, /TertiaryButton label="Skip stop" accessibilityLabel=\{`Skip \$\{placeName\}`\}/);
  assert.match(ui, /accessibilityLiveRegion="polite"/);
  assert.match(card, /`Stop \$\{number\}, \$\{place.name\},/);
  assert.match(card, /status === 'current' && onComplete && onSkip/);
  assert.match(screen, /startOverConfirmation\(\(\) => \{ void replace\(\)/);
  assert.match(screen, /useState<Screen>\(active \? 'finalized' : 'initial'\)/);
  assert.match(screen, /Linking.openURL\(navigationUrl\(place\)\)/);
});
