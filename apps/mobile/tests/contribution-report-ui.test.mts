import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import * as community from '../src/services/community-utils.ts';
import * as contributions from '../src/services/itinerary-contributions.ts';
import { createItineraryExecutionStore } from '../src/services/itinerary-execution-storage.ts';
import { executionStopId } from '../src/services/itinerary-execution.ts';

const require = createRequire(import.meta.url);
function load(path: string, dependencies: Record<string, unknown>) {
  const exports: any = {};
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected report dependency: ${name}`);
  });
  return exports;
}
function all(element: any, match: (node: any) => boolean): any[] {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((child) => all(child, match));
  if (typeof element.type === 'function') return all(element.type(element.props), match);
  return [...(match(element) ? [element] : []), ...all(element.props?.children, match)];
}
const label = (tree: any, value: string) => all(tree, (node) => node.props.accessibilityLabel === value)[0];
const button = (tree: any, value: string) => all(tree, (node) => node.props.label === value)[0];
const text = (tree: any) => all(tree, (node) => node.type === 'Text').map((node) => [node.props.children].flat(Infinity).join('')).join('|');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function harness(mode: 'light' | 'dark', categoryCode = 'attraction.gallery', signedIn = true) {
  // Synthetic fixture; no production writes.
  const itinerary: any = { finalized: true, start: { latitude: 0, longitude: 0, label: 'Test origin' }, budgetMinor: 10000, partySize: 2,
    stages: [{ id: 'test-stage', title: 'Test stage', categoryCodes: [categoryCode], required: true, source: 'wise' }],
    stops: [{ stageId: 'test-stage', place: { place_id: 'test-place', name: 'TEST DATA Gallery', category_code: categoryCode, latitude: 0, longitude: 0, has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null } }],
  };
  let saved: string | null = null;
  const store = createItineraryExecutionStore({ getItem: async () => saved, setItem: async (_key, value) => { saved = value; } });
  await store.hydrate(); store.finalize('test-trip', itinerary);
  const stopId = executionStopId(itinerary.stops[0]);
  store.dispatch({ type: 'start', itineraryId: 'test-trip' }); store.dispatch({ type: 'complete', itineraryId: 'test-trip', stopId }); await tick();
  const native = { StyleSheet: { create: (value: any) => value }, Platform: { OS: 'android', select: (options: any) => options.default }, View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView' };
  const tokens = load('constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const state: any[] = []; let cursor = 0; let user: any = signedIn ? { id: 'test-user' } : null;
  const routes: any[] = []; const reports: any[] = []; let fail = false;
  const screen = load('app/place/[id]/report.tsx', {
    'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    react: {
      useState: (initial: any) => { const key = cursor++; if (!(key in state)) state[key] = initial; return [state[key], (value: any) => { state[key] = value; }]; },
      useRef: (initial: any) => { const key = cursor++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
      useMemo: (fn: () => any) => fn(),
    },
    'expo-router': { useLocalSearchParams: () => ({ id: 'test-place', source: 'completed-itinerary', itineraryId: 'test-trip', stopId }), useRouter: () => ({
      push: (route: any) => routes.push(['push', route]), dismissTo: (route: any) => routes.push(['dismissTo', route]),
      back: () => routes.push(['back']), canGoBack: () => true,
    }) },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/ui/clay': { ClayInput: 'Input', ClaySurface: 'ClaySurface', PrimaryButton: 'PrimaryButton', SecondaryButton: 'SecondaryButton' },
    '@/constants/theme': tokens, '@/hooks/use-theme': { useTheme: () => tokens.Colors[mode] },
    '@/providers/auth-provider': { useAuth: () => ({ user, initializing: false }) },
    '@/providers/itinerary-execution-provider': { useItineraryExecution: () => ({ ...store.getSnapshot(), store }) },
    '@/services/itinerary-contributions': contributions,
    '@/services/community': { ...community, submitVisitReport: async (input: any) => { reports.push(input); if (fail) throw new Error('Test network failure'); } },
  });
  return { render: () => { cursor = 0; return screen.default(); }, store, reports, routes, tokens,
    authenticate: () => { user = { id: 'test-user' }; }, fail: (value: boolean) => { fail = value; } };
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: accessible stars, concise category copy, rating validation and successful return to Plan`, async () => {
    const app = await harness(mode); let tree = app.render();
    assert.equal(tree.props.style[1].backgroundColor, app.tokens.Colors[mode].background);
    assert.match(text(tree), /How much was admission/); assert.doesNotMatch(text(tree), /dine in|Good food|Verified visit/);
    assert.equal(all(tree, (node) => node.props.accessibilityRole === 'radio').length, 5);
    button(tree, 'Submit report').props.onPress(); await tick();
    tree = app.render(); assert.match(text(tree), /Add a rating, spending details, or both/); assert.equal(app.reports.length, 0);
    assert.equal(all(tree, (node) => node.props.accessibilityRole === 'alert')[0].props.accessibilityLiveRegion, 'assertive');
    label(tree, '4 stars out of 5').props.onPress(); tree = app.render();
    assert.equal(label(tree, '4 stars out of 5').props.accessibilityState.selected, true);
    assert.match(text(tree), /4 out of 5 stars selected/);
    label(tree, 'Anything else? Optional experience comment').props.onChangeText('Synthetic comment');
    button(app.render(), 'Retry submission').props.onPress(); await tick();
    assert.equal(app.reports.length, 1);
    assert.deepEqual({ rating: app.reports[0].rating, amount: app.reports[0].totalSpendMinor, people: app.reports[0].partySize, note: app.reports[0].shortNote }, { rating: 4, amount: null, people: null, note: 'Synthetic comment' });
    assert.deepEqual(app.routes, [['dismissTo', '/(tabs)/plan']]);
    assert.equal(contributions.contributionTargets(app.store.getSnapshot().active)[0].shared, true);
  });

  test(`${mode}: failed submission retains inputs and retries; explicit zero is reported free`, async () => {
    const app = await harness(mode, 'food.cafe'); app.fail(true);
    let tree = app.render();
    const priceLabel = 'How much did you spend? Total for your group in pesos';
    assert.equal(label(tree, priceLabel).props.keyboardType, 'decimal-pad');
    label(tree, priceLabel).props.onChangeText('0');
    label(tree, 'Anything else? Optional experience comment').props.onChangeText('Synthetic test note');
    tree = app.render(); assert.equal(label(tree, 'Number of people covered by this amount').props.value, '2');
    button(tree, 'Submit report').props.onPress(); button(tree, 'Submit report').props.onPress(); await tick();
    assert.equal(app.reports.length, 1, 'rapid double taps produce one attempt');
    assert.deepEqual(app.routes, []);
    assert.equal(contributions.contributionTargets(app.store.getSnapshot().active)[0].shared, false);
    tree = app.render(); assert.match(text(tree), /Test network failure/);
    assert.equal(label(tree, priceLabel).props.value, '0');
    assert.equal(label(tree, 'Anything else? Optional experience comment').props.value, 'Synthetic test note');
    app.fail(false); button(tree, 'Retry submission').props.onPress(); await tick();
    assert.equal(app.reports[1].totalSpendMinor, 0); assert.equal(app.reports[1].partySize, 2);
    assert.deepEqual(app.routes, [['dismissTo', '/(tabs)/plan']]);
  });

  test(`${mode}: anonymous form uses existing sign-in screen and preserves contribution intent and input`, async () => {
    const app = await harness(mode, 'entertainment.cinema', false); let tree = app.render();
    assert.equal(button(tree, 'Submit report').props.disabled, true);
    assert.match(text(tree), /Sign in to contribute/); assert.match(text(tree), /How was the experience/);
    label(tree, '5 stars out of 5').props.onPress();
    button(tree, 'Sign In').props.onPress(); assert.deepEqual(app.routes, [['push', '/auth/sign-in']]);
    assert.equal(app.reports.length, 0);
    app.authenticate(); tree = app.render();
    assert.equal(label(tree, '5 stars out of 5').props.accessibilityState.selected, true);
    assert.equal(button(tree, 'Submit report').props.disabled, false);
    button(tree, 'Submit report').props.onPress(); await tick();
    assert.equal(app.reports[0].placeId, 'test-place');
    assert.deepEqual(app.routes.at(-1), ['dismissTo', '/(tabs)/plan']);
  });
}
