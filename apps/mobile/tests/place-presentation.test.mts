import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import * as contracts from '../../../packages/place-presentation/src/contracts.ts';
import { mergePresentationScrollMetrics, readPresentationLayoutHeight, readPresentationScrollMetrics } from '../src/hooks/use-place-presentation-viewport.ts';
import { visiblePresentationIds } from '../src/services/place-presentation-visibility.ts';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

function loadService() {
  const code = ts.transpileModule(readFileSync(new URL('../src/services/place-presentation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (name === '@/lib/supabase') return { getSupabaseClient: () => ({}) };
    if (name === '@/services/google-place-identity') return { ensureGooglePlaceIdentities: async () => [] };
    if (name === '../../../../packages/place-presentation/src/contracts.ts') return contracts;
    throw new Error(`Unexpected presentation dependency: ${name}`);
  });
  return exports;
}

function loadPresentationHook(calls: string[][]) {
  const code = ts.transpileModule(readFileSync(new URL('../src/hooks/use-place-presentations.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  const states: any[] = [];
  const refs: any[] = [];
  const effectDeps: any[] = [];
  const cleanups: any[] = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  const pending: Array<() => void | (() => void)> = [];
  const react = {
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useRef: (initial: unknown) => { const index = refCursor++; if (!refs[index]) refs[index] = { current: initial }; return refs[index]; },
    useState: (initial: unknown) => { const index = stateCursor++; if (!(index in states)) states[index] = initial; return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? (next as (current: unknown) => unknown)(states[index]) : next; }]; },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = effectCursor++;
      const previous = effectDeps[index] as readonly unknown[] | undefined;
      const changed = !previous || !deps || deps.length !== previous.length || deps.some((value, position) => !Object.is(value, previous[position]));
      if (changed) { effectDeps[index] = deps; pending.push(() => { cleanups[index]?.(); const cleanup = effect(); cleanups[index] = cleanup; return cleanup; }); }
    },
  };
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (name === 'react') return react;
    if (name === '@/services/place-presentation') return {
      fetchPlacePresentations: async (candidates: readonly { place_id: string }[]) => { if (candidates.length) calls.push(candidates.map((candidate) => candidate.place_id)); return []; },
      presentationByPlaceId: (presentations: readonly { ewPlaceId: string }[]) => new Map(presentations.map((presentation) => [presentation.ewPlaceId.toLowerCase(), presentation])),
    };
    if (name === '../../../../packages/place-presentation/src/contracts.ts') return contracts;
    throw new Error(`Unexpected presentation hook dependency: ${name}`);
  });
  return {
    async render(candidates: readonly { place_id: string }[]) {
      stateCursor = 0;
      refCursor = 0;
      effectCursor = 0;
      pending.splice(0).forEach((effect) => { effect(); });
      const value = exports.usePlacePresentations(candidates, 'thumbnail');
      pending.splice(0).forEach((effect) => { effect(); });
      await Promise.resolve();
      return value;
    },
  };
}

function loadPolicy(platform: string) {
  const code = ts.transpileModule(readFileSync(new URL('../src/services/place-presentation-policy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (name === 'react-native') return { Platform: { OS: platform } };
    throw new Error(`Unexpected policy dependency: ${name}`);
  });
  return exports;
}

const googlePresentation = (ewPlaceId: string) => ({
  responseVersion: 1,
  presentations: [{
    presentationVersion: 1,
    ewPlaceId,
    source: 'google_places',
    fallbackCategory: 'food.restaurant',
    image: {
      uri: 'https://lh3.googleusercontent.com/photo',
      provider: 'google_maps',
      authorAttributions: [{ displayName: 'TEST author' }],
      googleMapsUri: 'https://maps.google.com/photo',
    },
  }],
});

test('matched visible places use the injected presentation transport and preserve order', async () => {
  const service = loadService();
  const calls: any[] = [];
  const instance = new service.PlacePresentationService({
    invoke: async (name: string, options: any) => { calls.push({ name, options }); return { data: googlePresentation(firstId), error: null }; },
    ensureIdentities: async () => [],
  });
  const candidates = [
    { place_id: firstId, category_code: 'food.restaurant', google_match_status: 'matched' },
    { place_id: secondId, category_code: 'food.cafe', google_match_status: 'unmatched' },
  ];
  const result = await instance.fetch(candidates, 'thumbnail');
  assert.equal(result.length, 2);
  assert.equal(result[0].source, 'google_places');
  assert.equal(result[1].source, 'category_fallback');
  assert.equal(calls[0].name, 'get-place-presentation');
  assert.deepEqual(calls[0].options.body.ewPlaceIds, [firstId]);
  assert.equal(candidates[0].place_id, firstId);
});

test('not_checked identities resolve before presentation, while terminal unmatched stays fallback', async () => {
  const service = loadService();
  let identityCalls = 0;
  let presentationCalls = 0;
  const instance = new service.PlacePresentationService({
    invoke: async () => { presentationCalls += 1; return { data: googlePresentation(firstId), error: null }; },
    ensureIdentities: async (ids: readonly string[]) => { identityCalls += 1; assert.deepEqual(ids, [firstId]); return [{ place_id: firstId, google_place_id: 'ChIJ-test', google_match_status: 'matched' }]; },
  });
  const result = await instance.fetch([{ place_id: firstId, category_code: 'food.restaurant', google_match_status: 'not_checked' }, { place_id: secondId, category_code: 'food.cafe', google_match_status: 'unmatched' }], 'card');
  assert.equal(identityCalls, 1);
  assert.equal(presentationCalls, 1);
  assert.equal(result[0].source, 'google_places');
  assert.equal(result[1].source, 'category_fallback');
});

test('policy suppression, malformed responses, and offline signals use local artwork', async () => {
  const service = loadService();
  const instance = new service.PlacePresentationService({
    invoke: async () => ({ data: { responseVersion: 1, presentations: [{ unexpected: true }] }, error: null }),
    ensureIdentities: async () => [],
  });
  const candidate = { place_id: firstId, category_code: 'food.restaurant', google_match_status: 'matched' };
  assert.equal((await instance.fetch([candidate], 'thumbnail', { allowGoogle: false }))[0].fallbackReason, 'policy_blocked');
  assert.equal((await instance.fetch([candidate], 'thumbnail'))[0].fallbackReason, 'unavailable');
  const controller = new AbortController(); controller.abort();
  assert.equal((await instance.fetch([candidate], 'thumbnail', { signal: controller.signal }))[0].fallbackReason, 'offline');
});

test('presentation requests are capped at three visible places and duplicate calls are deduplicated in flight', async () => {
  const service = loadService();
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const instance = new service.PlacePresentationService({
    invoke: async (_name: string, options: any) => { calls += 1; await pending; return { data: { responseVersion: 1, presentations: options.body.ewPlaceIds.map((id: string) => ({ presentationVersion: 1, ewPlaceId: id, source: 'category_fallback', fallbackCategory: 'food', fallbackReason: 'no_photo' })) }, error: null }; },
    ensureIdentities: async () => [],
  });
  const candidates = [firstId, secondId, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'].map((place_id) => ({ place_id, category_code: 'food', google_match_status: 'matched' }));
  const one = instance.fetch(candidates, 'thumbnail');
  const two = instance.fetch(candidates, 'thumbnail');
  release();
  await Promise.all([one, two]);
  assert.equal(calls, 1);
});

test('an empty measured/viewable set never invokes the presentation transport', async () => {
  const service = loadService();
  let calls = 0;
  const instance = new service.PlacePresentationService({
    invoke: async () => { calls += 1; return { data: googlePresentation(firstId), error: null }; },
    ensureIdentities: async () => [],
  });
  assert.deepEqual(await instance.fetch([], 'thumbnail'), []);
  assert.equal(calls, 0);
});

test('the mobile presentation hook makes no request before visibility evidence, then requests only supplied visible cards', async () => {
  const calls: string[][] = [];
  const hook = loadPresentationHook(calls);
  await hook.render([]);
  assert.deepEqual(calls, []);
  await hook.render([
    { place_id: firstId },
    { place_id: secondId },
  ]);
  assert.deepEqual(calls, [[firstId, secondId]]);
});

test('the map-provider policy suppresses Google photos on iOS Proposal but permits Customize', () => {
  const ios = loadPolicy('ios');
  const android = loadPolicy('android');
  assert.equal(ios.googlePresentationAllowed('proposal'), false);
  assert.equal(ios.googlePresentationAllowed('customize'), true);
  assert.equal(ios.googlePresentationAllowed('alternatives'), true);
  assert.equal(android.googlePresentationAllowed('proposal'), true);
  assert.equal(android.googlePresentationAllowed('alternatives'), true);
});

test('viewport evidence, not rendered order, controls bounded presentation eligibility', () => {
  const ids = [firstId, secondId, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
  const layouts = {
    [firstId]: { y: 0, height: 100 },
    [secondId]: { y: 120, height: 100 },
    [ids[2]]: { y: 240, height: 100 },
    [ids[3]]: { y: 360, height: 100 },
  };
  assert.deepEqual(visiblePresentationIds(ids, null, layouts), []);
  assert.deepEqual(visiblePresentationIds(ids, { scrollY: 0, viewportHeight: 220 }, {}), []);
  assert.deepEqual(visiblePresentationIds(ids, { scrollY: 0, viewportHeight: 220 }, layouts), [firstId, secondId]);
  assert.deepEqual(visiblePresentationIds(ids, { scrollY: 221, viewportHeight: 220 }, layouts), [ids[2], ids[3]]);
  assert.deepEqual(visiblePresentationIds(ids, { scrollY: 0, viewportHeight: 500 }, layouts, 3), ids.slice(0, 3));
  assert.deepEqual(visiblePresentationIds(ids, { scrollY: 0, viewportHeight: 500 }, { [firstId]: { y: 0, height: 0 }, [secondId]: { y: Number.NaN, height: 100 } }), []);
});

test('Proposal viewport tracking snapshots native metrics before deferred state updates', async () => {
  const ids = [firstId, secondId, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
  const layouts = {
    [firstId]: { y: 0, height: 100 },
    [secondId]: { y: 120, height: 100 },
    [ids[2]]: { y: 240, height: 100 },
    [ids[3]]: { y: 360, height: 100 },
    [ids[4]]: { y: 480, height: 100 },
  };
  let state = { scrollY: null as number | null, viewportHeight: 0 };

  // This mirrors Shell's production path: read native values in the handler,
  // then pass only primitive snapshots into the deferred state update.
  const applyScrollEvent = (event: any) => {
    const { offsetY, viewportHeight } = readPresentationScrollMetrics(event);
    state = mergePresentationScrollMetrics(state, offsetY, viewportHeight);
  };
  const presentationCalls: string[][] = [];
  const presentationHook = loadPresentationHook(presentationCalls);
  const emitPresentationCandidates = async () => {
    const visibleIds = visiblePresentationIds(ids, state, layouts);
    await presentationHook.render(visibleIds.map((place_id) => ({ place_id })));
    return visibleIds;
  };

  applyScrollEvent({ nativeEvent: { contentOffset: { y: 400 }, layoutMeasurement: { height: 220 } } });
  assert.deepEqual(state, { scrollY: 400, viewportHeight: 220 });
  assert.deepEqual(await emitPresentationCandidates(), [ids[3], ids[4]]);
  assert.deepEqual(presentationCalls, [[ids[3], ids[4]]]);

  const event: any = { nativeEvent: { contentOffset: { y: 400 }, layoutMeasurement: { height: 220 } } };
  const { offsetY, viewportHeight } = readPresentationScrollMetrics(event);
  event.nativeEvent = null;
  let deferredState = state;
  const deferredUpdate = () => {
    deferredState = mergePresentationScrollMetrics(deferredState, offsetY, viewportHeight);
  };
  assert.doesNotThrow(deferredUpdate);
  assert.deepEqual(deferredState, { scrollY: 400, viewportHeight: 220 });

  // A malformed event must invalidate visibility rather than reuse the prior
  // height with a fabricated scrollY of zero.
  assert.doesNotThrow(() => applyScrollEvent({ nativeEvent: { contentOffset: null, layoutMeasurement: null } }));
  assert.deepEqual(state, { scrollY: null, viewportHeight: 220 });
  assert.deepEqual(await emitPresentationCandidates(), [], 'invalid viewport evidence emits no presentation IDs');
  assert.deepEqual(presentationCalls, [[ids[3], ids[4]]], 'invalid viewport evidence emits no presentation request');

  assert.deepEqual(readPresentationScrollMetrics({ nativeEvent: null }), { offsetY: null, viewportHeight: null });
  assert.equal(readPresentationLayoutHeight({ nativeEvent: null }), null);

  // A later valid event restores normal intersection-based enrichment.
  applyScrollEvent({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 220 } } });
  assert.deepEqual(state, { scrollY: 0, viewportHeight: 220 });
  assert.deepEqual(await emitPresentationCandidates(), [firstId, secondId]);
  assert.deepEqual(presentationCalls, [[ids[3], ids[4]], [firstId, secondId]]);
});

test('invalid scroll metrics never fabricate visibility, while measured height can be reused safely', () => {
  const ids = [firstId, secondId, '33333333-3333-4333-8333-333333333333'];
  const layouts = {
    [firstId]: { y: 0, height: 100 },
    [secondId]: { y: 400, height: 100 },
    [ids[2]]: { y: 520, height: 100 },
  };
  const invalidScrollEvents = [
    { nativeEvent: { layoutMeasurement: { height: 220 } } },
    { nativeEvent: { contentOffset: null, layoutMeasurement: null } },
    { nativeEvent: { contentOffset: {}, layoutMeasurement: { height: 220 } } },
    { nativeEvent: { contentOffset: { y: null }, layoutMeasurement: { height: 220 } } },
    { nativeEvent: { contentOffset: { y: Number.NaN }, layoutMeasurement: { height: 220 } } },
    { nativeEvent: { contentOffset: { y: Number.POSITIVE_INFINITY }, layoutMeasurement: { height: 220 } } },
  ];

  for (const event of invalidScrollEvents) {
    let state = { scrollY: 400, viewportHeight: 220 };
    assert.doesNotThrow(() => {
      const { offsetY, viewportHeight } = readPresentationScrollMetrics(event);
      state = mergePresentationScrollMetrics(state, offsetY, viewportHeight);
    });
    assert.equal(state.scrollY, null);
    assert.deepEqual(visiblePresentationIds(ids, state, layouts), [], 'invalid scroll evidence cannot enrich cards');
  }

  for (const event of [
    { nativeEvent: { contentOffset: { y: 400 } } },
    { nativeEvent: { contentOffset: { y: 400 }, layoutMeasurement: null } },
  ]) {
    let state = { scrollY: 0, viewportHeight: 220 };
    const { offsetY, viewportHeight } = readPresentationScrollMetrics(event);
    state = mergePresentationScrollMetrics(state, offsetY, viewportHeight);
    assert.deepEqual(state, { scrollY: 400, viewportHeight: 220 });
    assert.deepEqual(visiblePresentationIds(ids, state, layouts), [secondId, ids[2]]);
  }
});

test('Proposal, Customize, and View More wire presentation requests only to measured visibility', () => {
  const proposal = readFileSync(new URL('../src/components/wise-proposal-card.tsx', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const alternatives = readFileSync(new URL('../src/app/plan/alternatives.tsx', import.meta.url), 'utf8');
  const shell = plan.slice(plan.indexOf('function Shell'), plan.indexOf('function Heading'));
  assert.match(proposal, /visiblePresentationIds/);
  assert.doesNotMatch(proposal, /stops\.slice\(0,\s*3\)/);
  assert.match(plan, /visiblePresentationIds/);
  assert.doesNotMatch(plan, /const initial = candidates\.slice\(0,\s*3\)/);
  assert.match(shell, /readPresentationScrollMetrics\(event\)/);
  assert.match(shell, /mergePresentationScrollMetrics\(current, offsetY, viewportHeight\)/);
  assert.doesNotMatch(shell, /event\.nativeEvent/);
  assert.match(alternatives, /const presentationCandidates = presentationWindow/);
  assert.match(alternatives, /googlePresentationAllowed\('alternatives'\)/);
  assert.doesNotMatch(alternatives, /allowGoogle:\s*true/);
  assert.match(alternatives, /setPresentationWindow\(next\)/);
  assert.doesNotMatch(alternatives, /setPresentationWindow\(\(current\).*nativeEvent/);
});

test('mobile presentation orchestration has no server key, photo persistence, or prefetch path', () => {
  const source = readFileSync(new URL('../src/services/place-presentation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|GOOGLE_PLACES_API_KEY|AsyncStorage|prefetch/i);
});
