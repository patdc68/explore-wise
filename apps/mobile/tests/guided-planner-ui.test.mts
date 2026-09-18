import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import * as planner from '../src/services/guided-planner.ts';
import * as questions from '../../../packages/planning/src/questions.ts';
import { validatePlanningIntent } from '../../../packages/planning/src/intent.ts';

const require = createRequire(import.meta.url);
function load(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: any = {};
  new Function('exports', 'require', '__DEV__', code)(exports, (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected planner dependency: ${name}`);
  }, true);
  return exports;
}
const native = {
  StyleSheet: { create: (v: any) => v }, Platform: { OS: 'android', select: (v: any) => v.default },
  View: 'View', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: { dismiss: () => {} }, AccessibilityInfo: { isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) },
  Animated: { Value: class { setValue() {} }, View: 'AnimatedView', timing: () => ({ start() {}, stop() {} }) },
};
const tokens = load('constants/theme.ts', { 'react-native': native, '@/global.css': {} });
const uuid = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';

// Run the production components/callbacks; native hosts, networking and device APIs are stubs.
// Hook state is isolated by component position/key, including nested custom inputs and search.
type GenerationMode = 'success' | 'pending' | 'clarification' | 'no_plan' | 'retryable_error' | 'non_retryable_error' | 'transport';

function harness(mode: 'light' | 'dark' = 'light', generationMode: GenerationMode = 'success') {
  let path = ''; let cursor = 0;
  const state = new Map<string, any[]>();
  const react = {
    useState(initial: any) {
      const values = state.get(path) ?? []; state.set(path, values); const i = cursor++;
      if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
      return [values[i], (next: any) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }];
    },
    useRef(initial: any) { return react.useState({ current: initial })[0]; },
    useEffect(effect: () => unknown) { effect(); },
  };
  const calls = { catalog: [] as any[], geocoder: [] as string[], exits: 0, routes: [] as string[], alerts: [] as any[], dispatch: [] as any[], generation: [] as any[], guidedProposal: null as any };
  let prevent: any; let removeCallback: any;
  let searchFailure = false; let pending: Promise<any[]> | null = null; let releaseGeneration: (() => void) | null = null;
  const theme = { useDesignTheme: () => tokens.ColorTokens[mode] };
  const clay = Object.fromEntries(['ClayCard', 'ClayInput', 'ChoiceChip', 'IconButton', 'LoadingCard', 'PrimaryButton', 'SecondaryButton', 'TertiaryButton'].map((name) => [name, name]));
  const guidedService = {
    buildGeneratePlanRequest: (draft: any, draftRevision: number) => { const parsed = planner.validatePlannerPreview(draft); return parsed.success ? { success: true, data: { requestVersion: 1, intent: parsed.data, draftRevision } } : parsed; },
    guidedPlanGeneration: {
      generate: (request: any) => {
        calls.generation.push(request);
        const proposal = {
          intent: request.intent,
          state: { start: { ...request.intent.location.coordinates, label: request.intent.location.label }, budgetMinor: request.intent.budget.amountMinor, partySize: request.intent.party.size, currencyCode: request.intent.budget.currencyCode, stages: [], stops: [] },
          missingStageIds: [], historyKey: 'guided-test',
          budgetSummary: { currencyCode: request.intent.budget.currencyCode, basis: request.intent.budget.basis, strictness: request.intent.budget.strictness, budgetMinor: request.intent.budget.amountMinor, normalizedTotalMinor: request.intent.budget.amountMinor, partySize: request.intent.party.size, knownMinMinor: 0, knownMaxMinor: 0, knownStopCount: 0, unknownStopCount: 0, currencyMismatchStopCount: 0, affordability: 'not_applicable' },
          anchorInclusions: [], appliedPreferences: [], unappliedPreferences: [], warnings: [],
        };
        const result = generationMode === 'clarification'
          ? { kind: 'response', response: { responseVersion: 1, requestId: 'guided-clarification', outcome: 'clarification_needed', anchorReviews: [], issues: [{ code: 'strict_budget_impossible', message: 'internal detail' }] } }
          : generationMode === 'no_plan'
            ? { kind: 'response', response: { responseVersion: 1, requestId: 'guided-no-plan', outcome: 'no_plan', anchorReviews: [], issues: [{ code: 'no_candidates', message: 'internal detail' }] } }
            : generationMode === 'retryable_error' || generationMode === 'non_retryable_error'
              ? { kind: 'response', response: { responseVersion: 1, requestId: 'guided-error', outcome: 'error', error: { code: 'database_error', message: 'internal detail', retryable: generationMode === 'retryable_error' } } }
              : generationMode === 'transport'
                ? { kind: 'transport_error', error: { kind: 'network', retryable: true } }
                : { kind: 'response', response: { responseVersion: 1, requestId: 'guided-success', outcome: 'proposal', anchorReviews: [], proposal } };
        if (generationMode === 'pending') return new Promise((resolve) => { releaseGeneration = () => resolve(result); });
        return Promise.resolve(result);
      },
    },
    adaptGuidedPlanProposal: (response: any, request: any) => ({ ...response.proposal, source: 'guided', outcome: response.outcome, request, anchorReviews: response.anchorReviews }),
  };
  const shared = { react, 'react-native': { ...native, BackHandler: { addEventListener: () => ({ remove() {} }) }, Alert: { alert: (...args: any[]) => calls.alerts.push(args) } }, '@/components/themed-text': { ThemedText: 'Text' }, '@/components/ui/clay': clay, '@/constants/theme': tokens, '@/hooks/use-theme': theme, '@/services/guided-planner': planner, '@/services/guided-plan-generation': guidedService, '@/providers/planning-handoff-provider': { usePlanningHandoff: () => ({ submitGuidedPlanProposal: (proposal: any) => { calls.guidedProposal = proposal; } }) } };
  const search = load('components/guided-planner/planner-search.tsx', { ...shared,
    'expo-location': { requestForegroundPermissionsAsync: async () => ({ status: 'granted' }), geocodeAsync: async (query: string) => { calls.geocoder.push(query); return [{ latitude: 1, longitude: 2 }]; } },
    '@/services/places': { searchCatalogPlaces: async (input: any) => { calls.catalog.push(input); if (pending) return pending; if (searchFailure) throw Error('offline'); return [{ place_id: input.query === 'SECOND PLACE' ? uuid2 : uuid, name: input.query === 'SECOND PLACE' ? 'SECOND CATALOG PLACE' : 'TEST CATALOG PLACE WITH A LONG NAME', city: 'Test city', region: 'Test region' }]; } },
  });
  const screen = load('components/guided-planner/guided-planner-screen.tsx', { ...shared,
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back: () => { if (prevent) removeCallback({ data: { action: 'back' } }); else calls.exits++; }, replace: (route: string) => { calls.routes.push(route); calls.exits++; } }), useNavigation: () => ({ dispatch: (action: any) => calls.dispatch.push(action) }) },
    'expo-router/react-navigation': { usePreventRemove: (value: boolean, cb: any) => { prevent = value; removeCallback = cb; } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/providers/current-location-provider': { useCurrentLocation: () => ({ status: 'ready', selection: { label: 'TEST EXPLORE LOCATION', source: 'current-location', coordinates: { latitude: 0, longitude: 0 } }, requestCurrentLocation: async () => ({ label: 'TEST GPS', source: 'current-location', coordinates: { latitude: 1, longitude: 1 } }) }) },
    '../../../../../packages/planning/src/questions': questions,
    '../../../../../packages/planning/src/draft': { anchorReviewState: () => null, recordAnchorReview: (draft: any) => draft, finalizePlannerDraft: (draft: any) => ({ success: true, data: planner.validatePlannerPreview(draft).data }) },
    '../../../../../packages/planning/src/contracts': {},
    '../../../../../packages/planning/src/intent': { validatePlanningIntent },
    './planner-search': search,
  });
  function expand(node: any, position = 'root'): any {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((child, i) => expand(child, `${position}/${child?.key ?? i}`));
    if (typeof node.type === 'function') {
      const previousPath = path; const previousCursor = cursor;
      path = `${position}/${node.type.name}`; cursor = 0;
      const child = node.type(node.props); const expanded = expand(child, `${path}/render`);
      path = previousPath; cursor = previousCursor; return expanded;
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, `${position}/${String(node.key ?? node.type)}`) } };
  }
  const render = () => expand({ type: screen.default, props: {} });
  return { render, calls, failSearch: () => { searchFailure = true; }, pendingSearch: (promise: Promise<any[]>) => { pending = promise; }, releaseGeneration: () => { releaseGeneration?.(); releaseGeneration = null; }, mutateDraft: (key: any, value: any) => { const values = state.get('root/GuidedPlannerScreen')!; const current = values[0] as planner.PlannerSession; values[0] = planner.setPlannerAnswer(current, key, value); },
    session: () => state.get('root/GuidedPlannerScreen')![0] as planner.PlannerSession,
    press(label: string) { const control = find(render(), (n) => n.props.accessibilityLabel === label || n.props.label === label); assert.ok(control, `Missing control: ${label}`); assert.ok(!control.props.disabled, `Disabled control: ${label}`); return control.props.onPress(); },
    input(label: string, value: string) { const control = find(render(), (n) => n.props.accessibilityLabel === label); assert.ok(control, `Missing input: ${label}`); control.props.onChangeText(value); },
  };
}
function find(node: any, match: (node: any) => boolean): any {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, match); if (result) return result; } return undefined; }
  return match(node) ? node : find(node.props?.children, match);
}
function toLocation(app: ReturnType<typeof harness>, occasion: string) { app.press(occasion); app.press('TEST EXPLORE LOCATION'); app.press('Continue'); }
function toReview(app: ReturnType<typeof harness>, occasion: string, children = false) {
  toLocation(app, occasion);
  if (occasion !== 'Just me') { if (occasion !== 'Date') app.press('4'); app.press('Continue'); }
  if (occasion === 'Family') { app.press(children ? 'Yes, children are coming' : 'No children'); app.press('Continue'); if (children) { app.press('3–5'); app.press('Continue'); } }
  app.press('₱3,000'); app.press('Continue'); app.press('Half day');
  app.press('No preference'); app.press('Continue'); app.press('No preference for food'); app.press('Surprise me for things to do'); app.press('Continue'); app.press('Skip');
  app.press('Keep it close');
}
for (const mode of ['light', 'dark'] as const) for (const [occasion, children] of [['Date', false], ['Friends', false], ['Family', true], ['Family', false], ['Just me', false]] as const) {
  test(`${mode}: ${occasion}${occasion === 'Family' ? children ? ' with children' : ' without children' : ''} UI hands off a validated guided proposal`, async () => {
    const app = harness(mode); toReview(app, occasion, children);
    assert.equal(app.session().screen, 'review');
    assert.equal(planner.validatePlannerPreview(app.session().draft).success, true);
    await app.press('Let Wise plan it');
    assert.equal(app.session().screen, 'review');
    assert.equal(app.calls.generation.length, 1);
    assert.equal(app.calls.generation[0].requestVersion, 1);
    assert.equal(app.calls.generation[0].draftRevision, app.session().draft.revision);
    assert.ok(app.calls.guidedProposal);
    assert.equal(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Your plan brief is ready'), undefined);
    assert.deepEqual(app.calls.catalog, [], 'no real recommendation backend');
    assert.deepEqual(app.calls.geocoder, []);
    assert.deepEqual(app.calls.routes, ['/plan']); assert.equal(app.calls.exits, 1);
  });
}
test('planner uses grouped phase presentation and direct single-choice advances', () => {
  const app = harness();
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Basics'));
  assert.equal(find(app.render(), (n) => typeof n.props.children === 'string' && n.props.children.startsWith('Step ')), undefined);
  app.press('Date');
  assert.equal(app.session().screen, 'location', 'occasion advances without Continue');
  app.press('TEST EXPLORE LOCATION'); app.press('Continue'); app.press('Continue');
  assert.equal(app.session().screen, 'budget');
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Budget & time'));
  app.press('₱1,000'); app.press('Continue'); app.press('Half day');
  assert.equal(app.session().screen, 'moods', 'duration advances without Continue');
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Preferences'));
  app.press('No preference'); app.press('Continue');
  app.press('No preference for food'); app.press('No preference for things to do'); app.press('Continue');
  assert.equal(app.session().screen, 'anchors');
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Final touches'));
  app.press('Skip'); app.press('Keep it close');
  assert.equal(app.session().screen, 'review', 'mobility advances without Review tap');
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Review your outing'));
});

test('a stale Guided generation response is ignored and cannot navigate or hand off a proposal', async () => {
  const app = harness('light', 'pending'); toReview(app, 'Date');
  const generation = app.press('Let Wise plan it');
  assert.equal(app.session().screen, 'generating');
  app.mutateDraft('budget', { amountMinor: 300100, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' });
  app.render();
  app.releaseGeneration(); await generation;
  assert.equal(app.calls.guidedProposal, null);
  assert.deepEqual(app.calls.routes, []);
  assert.equal(app.session().screen, 'review');
  assert.equal(app.session().draft.answers.budget?.amountMinor, 300100);
});
test('duplicate Guided submissions invoke once and cancellation returns to Review safely', async () => {
  const app = harness('light', 'pending'); toReview(app, 'Date');
  const submit = find(app.render(), (n) => n.props.label === 'Let Wise plan it');
  assert.ok(submit);
  submit.props.onPress(); submit.props.onPress();
  assert.equal(app.calls.generation.length, 1);
  assert.equal(app.session().screen, 'generating');
  app.press('Cancel generation');
  assert.equal(app.session().screen, 'review');
  app.releaseGeneration();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.calls.guidedProposal, null);
  assert.deepEqual(app.calls.routes, []);
});

for (const mode of ['clarification', 'no_plan', 'retryable_error', 'non_retryable_error', 'transport'] as const) {
  test(`Guided ${mode} stays in Review with safe recovery`, async () => {
    const app = harness('light', mode); toReview(app, 'Date');
    await app.press('Let Wise plan it');
    assert.equal(app.session().screen, 'review');
    assert.deepEqual(app.calls.routes, []);
    assert.equal(app.calls.guidedProposal, null);
    assert.ok(find(app.render(), (n) => n.type === 'Text' && typeof n.props.children === 'string' && n.props.children.length > 0));
    if (mode === 'clarification') assert.ok(find(app.render(), (n) => n.props.label === 'Review Budget'));
    if (mode === 'no_plan' || mode === 'retryable_error' || mode === 'transport') assert.ok(find(app.render(), (n) => n.props.label === 'Retry'));
    if (mode === 'non_retryable_error') assert.equal(find(app.render(), (n) => n.props.label === 'Retry'), undefined);
  });
}

test('back from an auto-advanced choice returns to the previous question', () => {
  const app = harness();
  app.press('Date');
  assert.equal(app.session().screen, 'location');
  app.press('Back');
  assert.equal(app.session().screen, 'occasion');
  app.press('Friends');
  assert.equal(app.session().screen, 'location');
});

test('combined preference step keeps food and things to do in separate draft fields', () => {
  const app = harness();
  toLocation(app, 'Just me');
  app.press('₱3,000'); app.press('Continue'); app.press('Half day'); app.press('No preference'); app.press('Continue');
  assert.equal(app.session().screen, 'food');
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Food'));
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Things to do'));
  app.press('Cafe'); app.press('Art / Museum');
  assert.deepEqual(app.session().draft.answers.food, { state: 'selected', values: ['cafe'] });
  assert.deepEqual(app.session().draft.answers.activities, { state: 'selected', values: ['art_museum'] });
  app.press('Continue');
  assert.equal(app.session().screen, 'anchors');
});

test('budget hides unknown-price policy and defaults to eligible-with-disclosure', () => {
  const app = harness();
  toLocation(app, 'Just me');
  assert.equal(find(app.render(), (n) => typeof n.props.children === 'string' && n.props.children.includes('unknown')), undefined);
  app.press('₱3,000');
  assert.equal(app.session().draft.answers.budget?.unknownPricePolicy, 'allow_with_disclosure');
  app.press('Continue'); app.press('Half day'); app.press('No preference'); app.press('Continue');
  app.press('No preference for food'); app.press('No preference for things to do'); app.press('Continue'); app.press('Skip'); app.press('Keep it close');
  assert.ok(find(app.render(), (n) => n.type === 'Text' && typeof n.props.children === 'string' && n.props.children.startsWith('Your TEST EXPLORE LOCATION')));
  for (const label of ['Edit Budget', 'Edit Time', 'Edit Vibe', 'Edit Food', 'Edit Activities', 'Edit Must-visit places', 'Edit Travel']) assert.ok(find(app.render(), (n) => n.props.accessibilityLabel === label), label);
  assert.ok(find(app.render(), (n) => typeof n.props.children === 'string' && n.props.children.includes('Some places may have unverified prices.')));
});
test('required time has no skip action', () => {
  const app = harness();
  toLocation(app, 'Just me');
  app.press('₱3,000'); app.press('Continue');
  assert.equal(app.session().screen, 'schedule');
  assert.equal(find(app.render(), (n) => n.props.label === 'Skip'), undefined);
  assert.equal(find(app.render(), (n) => n.props.children === 'Skip time'), undefined);
  app.press('Evening');
  assert.equal(app.session().draft.answers.schedule?.kind, 'window');
});

test('UI back and editing preserve budget, preferences and cleanup family metadata', () => {
  const app = harness(); toReview(app, 'Family', true);
  app.press('Edit Budget'); app.press('Per person'); app.input('Budget amount (PHP)', '1234.56'); app.press('Save answer');
  assert.equal(app.session().draft.answers.budget?.amountMinor, 123456);
  app.press('Edit Occasion'); app.press('Just me');
  assert.deepEqual(app.session().draft.answers.party, { size: 1, children: null });
  app.press('Edit Food'); app.press('Cafe'); app.press('Back');
  assert.equal(app.session().screen, 'review');
  assert.deepEqual(app.session().draft.answers.food, { state: 'selected', values: ['cafe'] });
  assert.equal(app.session().draft.answers.budget?.basis, 'per_person');
  app.press('Back'); assert.equal(app.session().screen, 'mobility');
});
test('incomplete answer is disabled; meaningful route exit confirms discard', () => {
  const app = harness();
  assert.equal(find(app.render(), (n) => n.props.label === 'Continue'), undefined, 'occasion auto-advances without a mandatory Continue action');
  app.press('Date'); app.press('Close planner');
  assert.equal(app.calls.alerts[0][0], 'Leave this plan?');
  assert.equal(app.calls.exits, 0);
  assert.equal(app.calls.alerts[0][2][0].text, 'Keep planning');
  app.calls.alerts[0][2][1].onPress(); assert.deepEqual(app.calls.dispatch, ['back']);
});
test('custom budget rejects invalid and fractional-cent input before moving on', () => {
  const app = harness(); toLocation(app, 'Just me');
  for (const value of ['', 'abc', '1.234', '-1']) {
    app.input('Budget amount (PHP)', value);
    assert.equal(find(app.render(), (n) => n.props.label === 'Continue').props.disabled, true);
  }
  app.input('Budget amount (PHP)', '0'); app.press('Continue');
  assert.equal(app.session().draft.answers.budget?.amountMinor, 0);
});
test('invalid review edit blocks generation and keeps a visible correction path', async () => {
  const app = harness(); toReview(app, 'Date');
  app.press('Edit Budget'); app.input('Budget amount (PHP)', '1.234'); app.press('Back');
  assert.equal(app.session().screen, 'review');
  assert.equal(find(app.render(), (n) => n.props.label === 'Let Wise plan it').props.disabled, true);
  assert.ok(find(app.render(), (n) => n.type === 'Text' && n.props.children === 'Needs attention'));
  app.press('Edit Budget'); app.press('₱1,000'); app.press('Save answer'); await app.press('Let Wise plan it');
  assert.equal(app.session().screen, 'review');
  assert.equal(app.calls.generation.length, 1);
});
test('changing Solo to Family from review visits missing party and children answers', () => {
  const app = harness(); toReview(app, 'Just me');
  app.press('Edit Occasion'); app.press('Family');
  assert.equal(app.session().screen, 'party');
  app.press('4'); app.press('Save answer');
  assert.equal(app.session().screen, 'children');
  app.press('No children'); app.press('Save answer');
  assert.equal(app.session().screen, 'review');
  assert.equal(app.session().draft.answers.budget?.amountMinor, 300000);
});
test('overnight schedule exposes date/time inputs and validates before saving', async () => {
  const app = harness(); toReview(app, 'Date'); app.press('Edit Time');
  app.press('Evening');
  assert.equal(app.session().draft.answers.schedule?.kind, 'window');
  app.input('Outing date YYYY-MM-DD', '2026-02-30');
  assert.equal(find(app.render(), (n) => n.props.label === 'Save answer').props.disabled, true);
  app.input('Outing date YYYY-MM-DD', '2026-09-18'); app.press('Same day');
  assert.equal(find(app.render(), (n) => n.props.label === 'Save answer').props.disabled, true);
  app.press('Next day'); app.press('Save answer'); await app.press('Let Wise plan it');
  assert.equal(app.session().preview?.schedule.outingDate, '2026-09-18');
});
test('catalog search uses whole catalog; add/remove are real UI handlers and retain UUID identity', async () => {
  const app = harness(); toReview(app, 'Date'); app.press('Edit Must-visit places');
  app.input('Search ExploreWise catalog', 'TEST PLACE'); await app.press('Search a place');
  assert.deepEqual(app.calls.catalog, [{ query: 'TEST PLACE', resultLimit: 20 }]);
  app.press('Select TEST CATALOG PLACE WITH A LONG NAME, Test city, Test region');
  assert.equal(app.session().draft.answers.anchors?.[0].placeId, uuid);
  assert.ok(find(app.render(), (n) => n.props.accessibilityLabel === 'Selected TEST CATALOG PLACE WITH A LONG NAME'));
  app.press('Change TEST CATALOG PLACE WITH A LONG NAME'); app.input('Search ExploreWise catalog', 'SECOND PLACE'); await app.press('Search a place');
  app.press('Select SECOND CATALOG PLACE, Test city, Test region');
  assert.equal(app.session().draft.answers.anchors?.[0].placeId, uuid2);
  app.press('Save answer'); await app.press('Let Wise plan it');
  assert.equal(app.session().preview?.anchors[0].placeId, uuid2);
  assert.deepEqual(app.session().draft.anchorReviews, []);
  app.press('Edit Must-visit places');
  app.press('Remove SECOND CATALOG PLACE');
  assert.deepEqual(app.session().draft.answers.anchors, []);
});
test('catalog failure has retry and stale results never replace a changed query', async () => {
  const app = harness(); toReview(app, 'Date'); app.press('Edit Must-visit places');
  app.failSearch(); app.input('Search ExploreWise catalog', 'TEST'); await app.press('Search a place');
  assert.ok(find(app.render(), (n) => n.props.label === 'Try search again'));
  let resolve!: (rows: any[]) => void;
  app.pendingSearch(new Promise((r) => { resolve = r; }));
  const pending = app.press('Try search again');
  app.input('Search ExploreWise catalog', 'NEW QUERY');
  resolve([{ place_id: uuid, name: 'STALE', city: 'Test' }]); await pending;
  assert.equal(find(app.render(), (n) => n.props.accessibilityLabel?.startsWith('Select STALE')), undefined);
});
test('area search uses existing device geocoding and explicit coordinate selection', async () => {
  const app = harness(); app.press('Date');
  app.input('Search city or area', 'TEST CITY'); await app.press('Search area');
  await new Promise((resolve) => setImmediate(resolve));
  app.press('Select TEST CITY, 5 km around this area');
  assert.deepEqual(app.calls.geocoder, ['TEST CITY']);
  assert.deepEqual(app.session().draft.answers.location?.coordinates, { latitude: 1, longitude: 2 });
  assert.equal(app.session().draft.answers.location?.source, 'selected_area');
});
test('native shell has safe areas, keyboard avoidance, wrapping content and semantic surfaces', () => {
  for (const mode of ['light', 'dark'] as const) {
    const tree = harness(mode).render();
    assert.deepEqual(tree.props.edges, ['top', 'bottom']);
    assert.equal(tree.props.style[1].backgroundColor, tokens.ColorTokens[mode].background.canvas);
    assert.equal(find(tree, (n) => n.type === 'KeyboardAvoidingView').props.behavior, 'height');
    assert.equal(find(tree, (n) => n.type === 'ScrollView').props.keyboardShouldPersistTaps, 'handled');
    const choice = find(tree, (n) => n.props.accessibilityLabel === 'Date');
    assert.ok(choice.props.style[0].minHeight >= 48);
    assert.deepEqual(choice.props.accessibilityState, { selected: false });
    assert.ok(find(tree, (n) => n.props.accessibilityRole === 'progressbar'));
  }
});
