import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

import { createExecution, executionProgress, transitionExecution } from '../src/services/itinerary-execution.ts';
import * as executionService from '../src/services/itinerary-execution.ts';
import { createItineraryExecutionStore, LIVE_ITINERARY_KEY } from '../src/services/itinerary-execution-storage.ts';
import * as itinerary from '../src/services/itinerary.ts';
import * as distance from '../src/services/planning-distance.ts';
import * as money from '../src/services/money.ts';
import * as planningSession from '../src/services/planning-session.ts';
import * as contributions from '../src/services/itinerary-contributions.ts';

const require = createRequire(import.meta.url);
function load(path: string, dependencies: Record<string, unknown>) {
  const exports: any = {};
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('.svg')) return name;
    throw new Error(`Unexpected UI dependency: ${name}`);
  });
  return exports;
}
const native = { StyleSheet: { create: (styles: any) => styles }, Platform: { select: (options: any) => options.default }, View: 'View', Pressable: 'Pressable', Text: 'Text', ScrollView: 'ScrollView', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator' };
const tokens = load('constants/theme.ts', { 'react-native': native, '@/global.css': {} });
function harness(mode: 'light' | 'dark') {
  const base = {
    'react-native': native, '@/constants/theme': tokens,
    react: { useState: (initial: any) => [initial, () => {}] },
    '@/hooks/use-theme': { useTheme: () => tokens.Colors[mode], useDesignTheme: () => tokens.ColorTokens[mode], useThemeElevation: () => tokens.ThemeElevation[mode] },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
  };
  const text = load('components/themed-text.tsx', base);
  const clay = load('components/ui/clay.tsx', { ...base, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@/components/themed-text': text });
  const shared = { ...base, '@/components/themed-text': text, '@/components/ui/clay': clay };
  const progress = load('components/itinerary/itinerary-progress.tsx', { ...shared, '@/services/itinerary-execution': { executionProgress } });
  const card = load('components/itinerary/itinerary-ui.tsx', {
    ...shared, '@/components/itinerary/itinerary-progress': progress,
    '@/components/discovery/place-visual': load('components/discovery/place-visual.tsx', { ...shared, 'expo-image': { Image: 'Image' }, '@/services/place-visual': load('services/place-visual.ts', {}) }),
    '@/components/discovery/price-summary': load('components/discovery/price-summary.tsx', shared),
    '@/services/itinerary': itinerary, '@/services/money': money, '@/services/stage-progress': {},
  });
  return { progress, card, shared };
}
function expand(element: any): any {
  if (!element || typeof element !== 'object') return element;
  if (Array.isArray(element)) return element.map(expand);
  if (typeof element.type === 'function') return expand(element.type(element.props));
  return { ...element, props: { ...element.props, children: expand(element.props?.children) } };
}
function all(element: any, match: (node: any) => boolean): any[] {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((child) => all(child, match));
  return [...(match(element) ? [element] : []), ...all(element.props?.children, match)];
}
const label = (tree: any, name: string) => all(tree, (node) => node.props.accessibilityLabel === name)[0];
const textContent = (tree: any) => all(tree, (node) => node.type === 'Text').map((node) => [node.props.children].flat(Infinity).join('')).join('|');
const style = (value: any) => Object.assign({}, ...[typeof value === 'function' ? value({ pressed: false }) : value].flat(Infinity).filter(Boolean));
const place: any = { place_id: 'test-place', name: 'Test stop', category_name: 'Test category' };
const plan: any = { finalized: true, stops: [{ stageId: 'test-stage', place }] };

// Synthetic places only. Render the production Plan screen, cards and buttons with
// native host views stubbed, and drive its real durable execution store.
const fullPlan = (): any => ({
  finalized: true, start: { latitude: 0, longitude: 0, label: 'Test origin' }, budgetMinor: 100000, partySize: 2,
  stages: ['A', 'B', 'C', 'D'].map((id) => ({ id, title: `Test stage ${id}`, categoryCodes: ['test.category'], required: true, source: 'wise' })),
  stops: ['A', 'B', 'C', 'D'].map((id, i) => ({ stageId: id, place: {
    place_id: id, name: `TEST DATA ${id}`, category_name: 'Test category', latitude: i * 0.01, longitude: 0,
    has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null,
  } })),
});
type Store = ReturnType<typeof createItineraryExecutionStore>;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function storedPlan(itineraryState = fullPlan()) {
  let saved: string | null = null;
  const storage = {
    getItem: async (key: string) => { assert.equal(key, LIVE_ITINERARY_KEY); return saved; },
    setItem: async (key: string, value: string) => { assert.equal(key, LIVE_ITINERARY_KEY); saved = value; },
  };
  const store = createItineraryExecutionStore(storage);
  await store.hydrate();
  assert.ok(store.finalize('test-outing', itineraryState));
  await tick();
  return { store, restore: async () => {
    await tick();
    const restored = createItineraryExecutionStore(storage);
    await restored.hydrate();
    return restored;
  } };
}
function planHarness(mode: 'light' | 'dark', store: Store) {
  const { shared, progress, card } = harness(mode);
  const urls: string[] = []; const alerts: any[] = []; const routes: any[] = [];
  let effects: { run: () => void; deps: any[] }[] = [];
  let presentationKey: string | undefined;
  const router = { useRouter: () => ({ push: (route: any) => routes.push(route) }) };
  const react = {
    useState: (initial: any) => [initial, () => {}], useEffect: (run: () => void, deps: any[]) => { effects.push({ run, deps }); },
    useMemo: (factory: () => any) => factory(), useCallback: (callback: any) => callback,
    useRef: (initial: any) => ({ current: initial }),
  };
  const screen = load('app/(tabs)/plan.tsx', {
    ...shared, react,
    'react-native': { ...native, Linking: { openURL: (url: string) => urls.push(url) }, Alert: { alert: (...args: any[]) => alerts.push(args) } },
    '@/hooks/use-floating-tab-inset': { useFloatingTabInset: () => 120 },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => ({}) }, 'expo-location': {}, 'expo-crypto': {},
    '@/components/ask-wise-card': {}, '@/components/discovery/location-search-sheet': {},
    '@/components/discovery/price-summary': {}, '@/components/discovery/state-card': { StateCard: 'StateCard' },
    '@/components/itinerary/itinerary-progress': progress, '@/components/itinerary/itinerary-ui': card,
    '@/components/itinerary/itinerary-contributions': load('components/itinerary/itinerary-contributions.tsx', { ...shared, 'expo-router': router, '@/services/itinerary-contributions': contributions }),
    '@/components/itinerary/itinerary-map': { ItineraryMap: 'ItineraryMap' },
    '@/components/itinerary/start-over-action': load('components/itinerary/start-over-action.tsx', { ...shared, '@/services/planning-session': planningSession }),
    '@/components/wise-proposal-card': {},
    '@/providers/itinerary-execution-provider': { useItineraryExecution: () => ({ ...store.getSnapshot(), store }) },
    '@/providers/current-location-provider': { useCurrentLocation: () => ({ selection: null }) },
    '@/providers/planning-handoff-provider': { usePlanningHandoff: () => ({ pendingWiseRequest: null }) },
    '@/providers/planning-alternatives-provider': { usePlanningAlternatives: () => ({}) },
    '@/services/itinerary-execution': executionService, '@/services/itinerary': itinerary,
    '@/services/planning-distance': distance, '@/services/planning-session': planningSession,
    '@/services/ask-wise': {}, '@/services/customize-ui': {}, '@/services/food-candidate-diversity': {},
    '@/services/plan-location': {}, '@/services/places': {}, '@/services/guided-selection': {},
    '@/services/wise-budget-diagnostics': {}, '@/services/wise-food-diagnostics': {}, '@/services/wise-proposal': {},
  });
  return {
    render: () => { effects = []; const root = screen.default(); presentationKey = root.props.resetScrollKey; return expand(root); },
    runScrollReset: (tree: any) => {
      const calls: any[] = [];
      const scroll = all(tree, (node) => node.type === 'ScrollView')[0];
      scroll.props.ref.current = { scrollTo: (position: any) => calls.push(position) };
      effects.find((effect) => effect.deps.length === 1 && effect.deps[0] === presentationKey)?.run();
      return calls;
    },
    presentationKey: () => presentationKey, urls, alerts, routes,
  };
}
const footer = (tree: any) => all(tree, (node) => node.props.testID === 'itinerary-bottom-action')[0];
const executionButtons = (tree: any) => all(tree, (node) => node.type === 'Pressable' && /^(Navigate to |Mark .* complete$|Skip TEST DATA)/.test(node.props.accessibilityLabel ?? ''));
const executionLabels = (tree: any) => executionButtons(tree).map((node) => node.props.accessibilityLabel);
const testId = (tree: any, id: string) => all(tree, (node) => node.props.testID === id)[0];

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: Planned follows summary → map → ordered timeline without mutating the outing`, async () => {
    const { store, restore } = await storedPlan();
    const before = structuredClone(store.getSnapshot().active);
    const app = planHarness(mode, store); const tree = app.render();
    const content = textContent(tree);
    assert.ok(content.indexOf('Ready when you are') < content.indexOf('Starting from Test origin'));
    assert.ok(content.indexOf('Planned budget') < content.indexOf('Stops on the map'));
    assert.ok(content.indexOf('Stops on the map') < content.indexOf('Your stops'));
    assert.ok(content.indexOf('Your stops') < content.indexOf('TEST DATA A'));
    assert.match(content, /No selected stops have reliable pricing yet\. Budget is partially known\./);
    assert.match(content, /Not available yet/);
    assert.doesNotMatch(content, /Within budget|saved|2h 45m|walking|arrival|Open now|Verified Stop|rating|review|local tip|optimized|per.person/i);
    const rows = all(testId(tree, 'itinerary-ordered-stops'), (node) => node.props.testID === 'itinerary-stop-upcoming');
    assert.deepEqual(rows.map((row) => all(row, (n) => n.props.accessibilityRole === 'header')[0].props.accessibilityLabel),
      ['A', 'B', 'C', 'D'].map((id, i) => `Stop ${i + 1}, TEST DATA ${id}, upcoming`));
    for (const [i, row] of rows.entries()) {
      assert.match(textContent(row), /Price not available yet/);
      assert.ok(textContent(row).includes(distance.sequentialStopDistances(fullPlan())[i].label!));
      assert.equal(all(row, (n) => n.type === 'Pressable').length, 0, 'finalized stops have no editing or execution actions');
      assert.doesNotMatch(textContent(row), /Stop \d/, 'the visible sequence marker replaces duplicated Stop N text');
      const artwork = all(row, (n) => n.props.accessibilityRole === 'image')[0];
      assert.match(artwork.props.accessibilityLabel, /artwork/);
      assert.equal(style(artwork.props.style).width, 64);
      assert.equal(style(artwork.props.style).height, 64);
      assert.equal(style(row.props.style).height, undefined);
    }
    const map = all(tree, (node) => node.type === 'ItineraryMap')[0];
    assert.deepEqual(map.props.selected, before!.itinerary.stops.map((stop) => stop.place));
    assert.deepEqual(map.props.start, before!.itinerary.start);
    assert.deepEqual(map.props.candidates, []);
    assert.equal(map.props.highlightedId, null);
    assert.deepEqual(store.getSnapshot().active, before);
    assert.deepEqual((await restore()).getSnapshot().active, before);
    assert.equal(before!.execution.status, 'planned');
    assert.ok(before!.execution.stops.every((stop) => stop.status === 'upcoming'));
    assert.ok(label(tree, 'Start over'));
    label(tree, 'Start over').props.onPress();
    assert.equal(app.alerts[0][2][0].style, 'cancel');
    assert.deepEqual(store.getSnapshot().active, before, 'reset still requires confirmation');
  });

  test(`${mode}: partial pricing retains ranges, provenance and group scope in wrap-safe cards`, async () => {
    const state = fullPlan();
    const longName = 'TEST DATA very long place name for a narrow phone and larger system text';
    Object.assign(state.stops[0].place, { name: longName, has_price: true, pricing_status: 'estimated', pricing_basis: 'brand_reference', estimated_group_min_minor: 40000, estimated_group_max_minor: 80000 });
    const { store } = await storedPlan(state); const tree = planHarness(mode, store).render();
    const summary = testId(tree, 'itinerary-planned-summary');
    assert.match(textContent(summary), /₱400–₱800/);
    assert.match(textContent(summary), /For all 2 people/);
    assert.match(textContent(summary), /3 stops have price unavailable\. Budget is partially known\./);
    const row = all(tree, (node) => node.props.testID === 'itinerary-stop-upcoming')[0];
    assert.match(textContent(row), /Group estimate\|₱400–₱800\|Brand reference/);
    assert.doesNotMatch(textContent(row), /per person|Free admission/);
    for (const copy of [longName, '₱400–₱800']) {
      const node = all(row, (n) => n.type === 'Text' && n.props.children === copy)[0];
      assert.equal(node.props.numberOfLines, undefined);
      assert.notEqual(node.props.allowFontScaling, false);
    }
    const card = all(row, (n) => style(n.props.style).borderRadius === tokens.Radius.row)[0];
    assert.equal(style(card.props.style).elevation ?? 0, 0, 'timeline cards stay quieter than Start');
    assert.equal(style(card.props.style).backgroundColor, tokens.ColorTokens[mode].background.surface);
    for (const width of [360, 390, 412, 430]) {
      const scroll = all(tree, (n) => n.type === 'ScrollView')[0];
      const rail = [row.props.children].flat()[0];
      const available = width - 2 * style(scroll.props.contentContainerStyle).paddingHorizontal
        - style(rail.props.style).width - style(row.props.style).gap - 2 * (style(card.props.style).padding + 1);
      assert.ok(available >= 260, `${width}px keeps a full-width price region`);
      assert.ok(available - 64 - tokens.Spacing.sm >= 190, `${width}px leaves readable title space beside the thumbnail`);
    }
  });
}

test('Planned has identical content, geometry and action availability across themes', async () => {
  const { store } = await storedPlan();
  const light = planHarness('light', store).render(); const dark = planHarness('dark', store).render();
  assert.equal(textContent(light), textContent(dark));
  const semantics = (tree: any) => all(tree, (n) => n.props.accessibilityLabel).map((n) => [n.props.accessibilityRole, n.props.accessibilityLabel]);
  assert.deepEqual(semantics(light), semantics(dark));
  const geometry = (tree: any) => all(tree, () => true).map((n) => {
    const resolved = style(n.props.style);
    return ['width', 'height', 'minHeight', 'padding', 'paddingBottom', 'gap', 'borderRadius', 'flexDirection', 'flexWrap', 'flexBasis'].map((key) => resolved[key]);
  });
  assert.deepEqual(geometry(light), geometry(dark));
  const mapSource = readFileSync(new URL('../src/components/itinerary/itinerary-map.tsx', import.meta.url), 'utf8');
  assert.match(mapSource, /mapClip: \{[^\n]*height: 220/);
});

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: starting a scrolled preview and advancing reveal the new current stop`, async () => {
    const { store } = await storedPlan(); const app = planHarness(mode, store);
    let tree = app.render(); const plannedKey = app.presentationKey();
    label(tree, 'Start itinerary').props.onPress();
    tree = app.render(); const currentKey = app.presentationKey();
    assert.notEqual(currentKey, plannedKey);
    assert.deepEqual(app.runScrollReset(tree), [{ y: 0, animated: false }]);
    label(tree, 'Mark TEST DATA A complete').props.onPress();
    tree = app.render();
    assert.notEqual(app.presentationKey(), currentKey);
    assert.deepEqual(app.runScrollReset(tree), [{ y: 0, animated: false }]);
    assert.ok(label(testId(tree, 'itinerary-current-stop'), 'Stop 2, TEST DATA B, current stop'));
  });

  test(`${mode}: current stop leads the screen, advancing regroups original sequence and preserves distances`, async () => {
    const { store } = await storedPlan(); const app = planHarness(mode, store);
    let tree = app.render();
    assert.ok(testId(tree, 'itinerary-planned-header'));
    const preview = testId(tree, 'itinerary-ordered-stops');
    assert.equal(all(preview, (node) => node.props.testID === 'itinerary-stop-upcoming').length, 4);
    assert.doesNotMatch(textContent(preview), /Current stop|Completed|Skipped/);
    label(tree, 'Start itinerary').props.onPress();
    tree = app.render();
    assert.match(textContent(tree), /You're on your way/);
    let current = testId(tree, 'itinerary-current-stop');
    assert.ok(label(current, 'Stop 1, TEST DATA A, current stop'));
    assert.equal(style(current.props.style).backgroundColor, tokens.ColorTokens[mode].background.surfaceRaised);
    assert.deepEqual(executionLabels(current), executionLabels(tree));
    assert.deepEqual(executionLabels(testId(tree, 'itinerary-upcoming')), []);
    assert.equal(testId(tree, 'itinerary-earlier'), undefined);
    assert.equal(style(testId(tree, 'itinerary-progress-fill').props.style).width, '0%');
    label(tree, 'Mark TEST DATA A complete').props.onPress();
    tree = app.render();
    assert.ok(label(testId(tree, 'itinerary-current-stop'), 'Stop 2, TEST DATA B, current stop'));
    assert.ok(label(testId(tree, 'itinerary-earlier'), 'Stop 1, TEST DATA A, completed'));
    assert.equal(style(testId(tree, 'itinerary-progress-fill').props.style).width, '25%');
    label(tree, 'Skip TEST DATA B').props.onPress();
    tree = app.render(); current = testId(tree, 'itinerary-current-stop');
    assert.ok(label(current, 'Stop 3, TEST DATA C, current stop'));
    assert.match(textContent(tree), /1 of 4 stops completed · 1 skipped/);
    assert.equal(label(tree, 'Itinerary progress').props.accessibilityValue.now, 1);
    assert.equal(style(testId(tree, 'itinerary-progress-fill').props.style).width, '25%', 'skipping never fills completed progress');
    const earlier = testId(tree, 'itinerary-earlier');
    const completed = testId(earlier, 'itinerary-stop-completed');
    const skipped = testId(earlier, 'itinerary-stop-skipped');
    assert.ok(label(completed, 'Stop 1, TEST DATA A, completed'));
    assert.ok(label(skipped, 'Stop 2, TEST DATA B, skipped'));
    assert.notEqual(all(completed, (n) => n.type === 'Icon')[0].props.name, all(skipped, (n) => n.type === 'Icon')[0].props.name);
    assert.deepEqual(executionLabels(earlier), []);
    for (const row of [completed, skipped, ...all(testId(tree, 'itinerary-upcoming'), (n) => n.props.testID === 'itinerary-stop-upcoming')]) {
      assert.equal(style(row.props.style).backgroundColor, undefined, 'secondary stops are flat rows');
      assert.equal(style(row.props.style).height, undefined, 'content determines row height');
    }
    const content = textContent(tree);
    assert.ok(content.indexOf('TEST DATA C') < content.indexOf('Up next'));
    assert.ok(content.indexOf('TEST DATA D') < content.indexOf('Earlier stops'));
    assert.ok(content.indexOf('Earlier stops') < content.indexOf('Plan details'));
    assert.ok(content.indexOf('Plan details') < content.indexOf('Stops on the map'));
    assert.ok(textContent(current).includes(distance.sequentialStopDistances(fullPlan())[2].label!));
  });

  test(`${mode}: active controls tolerate scaled copy, use theme hierarchy and keep practical touch targets`, () => {
    const { card } = harness(mode);
    const longName = 'TEST DATA A very long place name for translated mobile layouts';
    const tree = expand(card.ItineraryStopCard({ place: { ...place, name: longName }, number: 12, status: 'current', onNavigate() {}, onComplete() {}, onSkip() {} }));
    const controls = ['Navigate to ' + longName, 'Mark ' + longName + ' complete', 'Skip ' + longName].map((name) => label(tree, name));
    for (const control of controls) {
      assert.equal(control.props.accessibilityRole, 'button');
      assert.ok(style(control.props.style).minHeight >= 48);
      assert.equal(style(control.props.style).height, undefined);
      assert.equal(all(control, (node) => node.type === 'Text')[0].props.numberOfLines, 0);
    }
    assert.equal(style(controls[1].props.style).backgroundColor, tokens.ColorTokens[mode].accent.primary);
    assert.equal(style(controls[2].props.style).backgroundColor, 'transparent');
    const name = all(tree, (node) => node.type === 'Text' && node.props.children === longName)[0];
    assert.equal(name.props.numberOfLines, undefined);
    assert.equal(style(name.props.style).fontSize, tokens.Typography.sectionTitle.fontSize);
    assert.match(textContent(tree), /Price not available yet/);
    assert.doesNotMatch(textContent(tree), /Free admission/);
  });

  test(`${mode}: all-skipped completion stays truthful and never offers contributions`, async () => {
    const { store } = await storedPlan(); const app = planHarness(mode, store);
    label(app.render(), 'Start itinerary').props.onPress();
    for (const id of ['A', 'B', 'C', 'D']) label(app.render(), `Skip TEST DATA ${id}`).props.onPress();
    const tree = app.render();
    assert.ok(testId(tree, 'itinerary-completed-header'));
    assert.match(textContent(tree), /Trip complete/);
    assert.match(textContent(tree), /0 stops completed · 4 stops skipped/);
    assert.equal(all(tree, (n) => n.props.testID === 'itinerary-stop-skipped').length, 4);
    assert.equal(testId(tree, 'itinerary-current-stop'), undefined);
    assert.equal(label(tree, 'Itinerary progress'), undefined);
    assert.equal(footer(tree), undefined);
    assert.deepEqual(executionLabels(tree), []);
    assert.doesNotMatch(textContent(tree), /Help the next explorer|verified visit|stops visited/i);
  });
}

test('finalized presentation uses shared theme tokens with no screen-specific color literals', () => {
  for (const path of ['components/itinerary/itinerary-ui.tsx', 'components/itinerary/itinerary-progress.tsx', 'components/itinerary/itinerary-contributions.tsx']) {
    const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(/i);
    assert.doesNotMatch(source, /theme\s*===\s*['"]dark/);
    assert.match(source, /use(?:Design)?Theme\(\)/);
  }
});

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: planned Start CTA is a persistent safe-area sibling with reserved space and scalable label`, async () => {
    const { store } = await storedPlan(); const app = planHarness(mode, store); const tree = app.render();
    const region = footer(tree); const button = label(region, 'Start itinerary');
    assert.ok(button);
    assert.equal(all(tree, (node) => node.props.accessibilityLabel === 'Start itinerary').length, 1);
    assert.deepEqual(executionLabels(tree), []);
    assert.doesNotMatch(textContent(tree), /Help the next explorer/);
    assert.equal(label(tree, 'Navigate to first stop'), undefined);
    const scroll = all(tree, (node) => node.type === 'ScrollView')[0];
    assert.equal(footer(scroll), undefined, 'CTA must stay outside scroll content');
    const parent = all(tree, (node) => [node.props.children].flat().includes(region))[0];
    assert.ok([parent.props.children].flat().includes(scroll), 'footer shares the scroll viewport parent');
    assert.equal(style(parent.props.style).flex, 1);
    assert.equal(style(scroll.props.style).flex, 1);
    assert.equal(style(region.props.style).flexShrink, 0);
    assert.equal(style(region.props.style).position, undefined, 'footer reserves actual height instead of overlaying stops');
    assert.ok(style(scroll.props.contentContainerStyle).paddingBottom >= tokens.Spacing.lg);
    assert.deepEqual(region.props.edges, []);
    assert.equal(style(region.props.style).marginBottom, 120, 'CTA clears floating capsule and device safe area');
    assert.ok(style(region.props.style).paddingBottom >= tokens.Spacing.sm);
    assert.equal(style(region.props.style).backgroundColor, tokens.Colors[mode].elevatedSurface);
    assert.equal(style(button.props.style).backgroundColor, tokens.ColorTokens[mode].accent.primary);
    assert.equal(button.props.accessibilityRole, 'button');
    assert.ok(style(button.props.style).minHeight >= 48);
    assert.equal(style(button.props.style).height, undefined);
    const buttonText = all(button, (node) => node.type === 'Text')[0];
    assert.equal(buttonText.props.numberOfLines, 0, 'scaled labels can wrap instead of clipping');
    for (const width of [360, 390, 412, 430]) {
      const room = width - 2 * style(region.props.style).paddingHorizontal - 2 * style(button.props.style).paddingHorizontal;
      assert.ok(room >= 260, `${width}px leaves room for a scaled Start label`);
    }
    assert.match(textContent(tree), /4 stops · Ready when you are/);
    assert.match(textContent(scroll), /TEST DATA D/);
    assert.equal(all(tree, (node) => node.type === 'ItineraryMap').length, 1);
    button.props.onPress();
    assert.equal(store.getSnapshot().active!.execution.status, 'in_progress');
    assert.equal(store.getSnapshot().active!.execution.stops[0].status, 'current');
    assert.equal(footer(app.render()), undefined);
    assert.equal(label(app.render(), 'Start itinerary'), undefined);
  });

  test(`${mode}: only current stop can navigate/complete/skip, and terminal content retains map and distances`, async () => {
    const { store } = await storedPlan(); const app = planHarness(mode, store);
    label(app.render(), 'Start itinerary').props.onPress();
    for (const [id, action] of [['A', 'complete'], ['B', 'skip'], ['C', 'complete'], ['D', 'complete']]) {
      const tree = app.render();
      assert.doesNotMatch(textContent(tree), /Help the next explorer/);
      assert.equal(footer(tree), undefined);
      assert.deepEqual(executionLabels(tree), [`Navigate to TEST DATA ${id}`, `Mark TEST DATA ${id} complete`, `Skip TEST DATA ${id}`]);
      label(tree, `Navigate to TEST DATA ${id}`).props.onPress();
      const selected = store.getSnapshot().active!.itinerary.stops.find((stop) => stop.place.place_id === id)!;
      assert.equal(app.urls.at(-1), itinerary.navigationUrl(selected.place));
      const actionLabel = action === 'complete' ? `Mark TEST DATA ${id} complete` : `Skip TEST DATA ${id}`;
      label(tree, actionLabel).props.onPress();
    }
    const tree = app.render();
    assert.equal(store.getSnapshot().active!.execution.status, 'completed');
    assert.equal(footer(tree), undefined); assert.equal(label(tree, 'Start itinerary'), undefined);
    assert.deepEqual(executionLabels(tree), []);
    assert.match(textContent(tree), /3 stops completed · 1 stop skipped/);
    assert.match(textContent(tree), /0 of 3 experiences shared/);
    assert.equal(label(tree, 'Share your experience at TEST DATA B'), undefined);
    for (const id of ['A', 'C', 'D']) {
      label(tree, `Share your experience at TEST DATA ${id}`).props.onPress();
      assert.deepEqual(app.routes.at(-1), { pathname: '/place/[id]/report', params: { id, source: 'completed-itinerary', itineraryId: 'test-outing', stopId: JSON.stringify([id, id]) } });
    }
    assert.deepEqual(app.alerts, [], 'completing/skipping never interrupts with a form');
    await store.markContributed('test-outing', JSON.stringify(['A', 'A']));
    const sharedTree = app.render();
    assert.match(textContent(sharedTree), /1 of 3 experiences shared/);
    assert.ok(label(sharedTree, 'Thanks — experience at TEST DATA A shared'));
    assert.equal(label(sharedTree, 'Share your experience at TEST DATA A'), undefined);
    assert.match(textContent(sharedTree), /3 stops completed · 1 stop skipped/);
    const map = all(tree, (node) => node.type === 'ItineraryMap')[0];
    assert.deepEqual(map.props.selected, fullPlan().stops.map((stop: any) => stop.place));
    assert.deepEqual(map.props.start, fullPlan().start);
    for (const item of distance.sequentialStopDistances(fullPlan())) assert.ok(textContent(tree).includes(item.label!));
  });

  test(`${mode}: restored B-current and completed outings never regain the planned footer`, async () => {
    const { store, restore } = await storedPlan(); const app = planHarness(mode, store);
    label(app.render(), 'Start itinerary').props.onPress();
    label(app.render(), 'Mark TEST DATA A complete').props.onPress();
    const restored = await restore(); const restoredApp = planHarness(mode, restored);
    let tree = restoredApp.render();
    assert.equal(footer(tree), undefined); assert.equal(label(tree, 'Start itinerary'), undefined);
    assert.deepEqual(executionLabels(tree), ['Navigate to TEST DATA B', 'Mark TEST DATA B complete', 'Skip TEST DATA B']);
    // Reset still asks for confirmation without clearing progress on press.
    label(tree, 'Start over').props.onPress();
    assert.equal(restoredApp.alerts.length, 1);
    assert.equal(restored.getSnapshot().active!.execution.status, 'in_progress');
    assert.equal(restoredApp.alerts[0][2][0].style, 'cancel');
    for (const id of ['B', 'C', 'D']) label(restoredApp.render(), `Mark TEST DATA ${id} complete`).props.onPress();
    const terminal = await restore(); tree = planHarness(mode, terminal).render();
    assert.equal(terminal.getSnapshot().active!.execution.status, 'completed');
    assert.equal(footer(tree), undefined); assert.equal(label(tree, 'Start itinerary'), undefined);
    assert.deepEqual(executionLabels(tree), []);
    assert.match(textContent(tree), /4 stops completed · 0 stops skipped/);
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: progress UI has compact planned status and truthful active/terminal summaries`, () => {
    const { progress } = harness(mode);
    let execution = createExecution('test-outing', plan);
    let tree = expand(progress.ItineraryProgress({ execution }));
    assert.equal(tree.type, 'View');
    assert.match(textContent(tree), /Your plan/);
    assert.match(textContent(tree), /1 stop · Ready when you are/);
    assert.equal(label(tree, 'Start itinerary'), undefined);
    execution = transitionExecution(execution, { type: 'start', itineraryId: execution.itineraryId });
    assert.equal(execution.status, 'in_progress');
    tree = expand(progress.ItineraryProgress({ execution }));
    assert.equal(label(tree, 'Start itinerary'), undefined);
    assert.match(textContent(tree), /You're on your way/);
    assert.match(textContent(tree), /0 of 1 stops completed/);
    assert.deepEqual(label(tree, 'Itinerary progress').props.accessibilityValue, { min: 0, max: 1, now: 0, text: '0 of 1 stops completed' });
    execution = transitionExecution(execution, { type: 'skip', itineraryId: execution.itineraryId, stopId: execution.stops[0].id });
    tree = expand(progress.ItineraryProgress({ execution }));
    assert.match(textContent(tree), /Trip complete/);
    assert.match(textContent(tree), /0 stops completed · 1 stop skipped/);
    assert.equal(label(tree, 'Start itinerary'), undefined);
  });

  test(`${mode}: all stop states are labeled; only current exposes execution controls`, () => {
    const { card } = harness(mode);
    const calls: string[] = []; const icons = new Set<string>();
    for (const [status, stateLabel] of [['upcoming', 'upcoming'], ['current', 'current stop'], ['completed', 'completed'], ['skipped', 'skipped']]) {
      const tree = expand(card.ItineraryStopCard({ place, number: 1, status, onComplete: () => calls.push('complete'), onSkip: () => calls.push('skip'), onNavigate: () => calls.push('navigate') }));
      assert.ok(label(tree, `Stop 1, Test stop, ${stateLabel}`));
      const icon = all(tree, (node) => node.type === 'Icon')[0]; icons.add(icon.props.name);
      assert.ok(icon.props.color);
      const complete = label(tree, 'Mark Test stop complete'); const skip = label(tree, 'Skip Test stop');
      if (status === 'current') {
        complete.props.onPress(); skip.props.onPress();
        label(tree, 'Navigate to Test stop').props.onPress();
        assert.notEqual(style(complete.props.style).backgroundColor, style(skip.props.style).backgroundColor);
      } else { assert.equal(complete, undefined); assert.equal(skip, undefined); assert.equal(label(tree, 'Navigate to Test stop'), undefined); }
    }
    assert.equal(icons.size, 4);
    assert.deepEqual(calls, ['complete', 'skip', 'navigate']);
  });
}
