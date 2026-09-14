import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
function load(path: string, dependencies: Record<string, unknown>) {
  const exports: any = {};
  const code = ts.transpileModule(source(path), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected UI dependency: ${name}`);
  });
  return exports;
}

const native = {
  StyleSheet: { create: (styles: any) => styles },
  Platform: { select: (options: any) => options.default },
  View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text',
  TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator',
};
const tokens = load('constants/theme.ts', { 'react-native': native, '@/global.css': {} });
const safeArea = { SafeAreaView: 'SafeAreaView' };
const icon = { __esModule: true, default: 'Icon' };

// Host views are stubs; the production screen, cards, primitives and callbacks execute.
function harness(mode: 'light' | 'dark' = 'light') {
  let cursor = 0;
  const states: any[] = [];
  const react = { useState(initial: any) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: any) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  } };
  const hooks = {
    useTheme: () => tokens.Colors[mode],
    useDesignTheme: () => tokens.ColorTokens[mode],
    useThemeElevation: () => tokens.ThemeElevation[mode],
  };
  const base = { 'react-native': native, '@/constants/theme': tokens, '@/hooks/use-theme': hooks, '@expo/vector-icons/Ionicons': icon };
  const text = load('components/themed-text.tsx', base);
  const clay = load('components/ui/clay.tsx', { ...base, react: { useState: (initial: any) => [initial, () => {}] }, 'react-native-safe-area-context': safeArea, '@/components/themed-text': text });
  const shared = { ...base, '@/components/themed-text': text, '@/components/ui/clay': clay };
  const ask = load('components/ask-wise-card.tsx', shared);
  const price = load('components/discovery/price-summary.tsx', shared);
  const formattedDistances: number[] = [];
  const place = load('components/discovery/place-card.tsx', { ...shared, './place-visual': { PlaceVisual: 'PlaceVisual' }, './price-summary': price, '@/services/places': { formatDistance: (meters: number) => { formattedDistances.push(meters); return `${meters} m`; } } });
  const calls = { submitted: [] as string[], routes: [] as any[], toggled: [] as string[], queued: [] as (() => void)[], alerts: [] as any[], location: 0, refresh: 0, categories: 0 };
  const location: any = { status: 'ready', selection: { label: 'Test discovery area', source: 'current-location', coordinates: { latitude: 0, longitude: 0 } }, requestCurrentLocation: async () => { calls.location++; } };
  const nearby: any = { places: [], isLoading: false, error: null, refresh: () => { calls.refresh++; } };
  const categories: any = { categories: [1, 2, 3, 4, 5, 6].map((id) => ({ code: `test.${id}`, name: `Test category ${id}`, categoryCodes: [`test.${id}`, `test.${id}.child`] })), isLoading: false, error: null, refresh: () => { calls.categories++; } };
  const auth: any = { user: { id: 'test-user' }, queueAfterAuthentication: (action: () => void) => { calls.queued.push(action); } };
  const favoriteIds = new Set<string>();
  let query: any;
  const screen = load('app/(tabs)/index.tsx', {
    ...shared, react, 'react-native': { ...native, Alert: { alert: (...args: any[]) => { calls.alerts.push(args); } } },
    '@/hooks/use-floating-tab-inset': { useFloatingTabInset: () => 120 },
    'react-native-safe-area-context': safeArea,
    'expo-router': { useRouter: () => ({ push: (route: any) => calls.routes.push(route), navigate: (route: any) => calls.routes.push(route) }) },
    '@/components/ask-wise-card': ask,
    '@/components/discovery/filter-chip': { FilterChip: clay.FilterChip },
    '@/components/discovery/location-search-sheet': { LocationSearchSheet: 'LocationSearchSheet' },
    '@/components/discovery/place-card': place,
    '@/providers/current-location-provider': { useCurrentLocation: () => location },
    '@/hooks/use-discovery-categories': { useDiscoveryCategories: () => categories },
    '@/hooks/use-nearby-places': { useNearbyPlaces: (input: any) => { query = input; return nearby; } },
    '@/hooks/use-favorites': { useFavorites: () => ({ favoriteIds, toggleFavorite: async (id: string) => { calls.toggled.push(id); } }) },
    '@/providers/auth-provider': { useAuth: () => auth },
    '@/providers/planning-handoff-provider': { usePlanningHandoff: () => ({ submitFromExplore: (prompt: string) => calls.submitted.push(prompt) }) },
  });
  return { calls, location, nearby, categories, auth, favoriteIds, clay, ask, place, price, formattedDistances,
    query: () => query,
    render: () => { cursor = 0; return expand(screen.default()); },
    renderAsk: (props: any) => expand(ask.AskWiseCard(props)),
    renderPlace: (props: any) => expand(place.PlaceCard(props)),
  };
}

function expand(element: any): any {
  if (!element || typeof element !== 'object') return element;
  if (Array.isArray(element)) return element.map(expand);
  if (typeof element.type === 'function') return expand(element.type(element.props));
  return { ...element, props: { ...element.props, children: expand(element.props?.children) } };
}
function all(element: any, match: (element: any) => boolean): any[] {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((child) => all(child, match));
  return [...(match(element) ? [element] : []), ...all(element.props?.children, match)];
}
const byLabel = (tree: any, label: string) => all(tree, (node) => node.props.accessibilityLabel === label)[0];
const byText = (tree: any, text: string) => all(tree, (node) => node.type === 'Text' && node.props.children === text)[0];
const style = (value: any): any => Object.assign({}, ...[typeof value === 'function' ? value({ pressed: false }) : value].flat(Infinity).filter(Boolean));
const fixture = (id: string, hasPrice = true) => ({ place_id: id, name: `TEST DATA ${id}`, category_name: 'Test category', city: 'Test city', latitude: 0, longitude: 0, distance_meters: 123, has_price: hasPrice, estimated_group_min_minor: 10000, estimated_group_max_minor: 20000, price_source_label: 'Test fixture only', budget_status: hasPrice ? 'fits' : 'unknown' });

test('typed Ask Wise input submits the exact value through the existing Explore handoff', () => {
  const app = harness();
  let tree = app.render();
  byLabel(tree, 'Ask Wise').props.onPress();
  assert.deepEqual(app.calls.submitted, []);
  const prompt = '  TEST REQUEST: food for two with a 1000 budget  ';
  byLabel(tree, 'Ask Wise your plan').props.onChangeText(prompt);
  tree = app.render();
  byLabel(tree, 'Ask Wise').props.onPress();
  assert.deepEqual(app.calls.submitted, [prompt]);
  assert.deepEqual(app.calls.routes, ['/plan']);
});

test('all four quick prompts fill the editable input and only the CTA submits', () => {
  const app = harness();
  for (const label of ['Date night', 'Budget eats', 'Coffee + fun', 'Family day']) {
    byLabel(app.render(), `Try ${label}`).props.onPress();
    const tree = app.render();
    assert.ok(byLabel(tree, 'Ask Wise your plan').props.value.length > 20);
    assert.equal(byLabel(tree, `Try ${label}`).props.accessibilityState.selected, true);
    assert.deepEqual(app.calls.submitted, []);
    assert.deepEqual(app.calls.routes, []);
  }
  const prompt = byLabel(app.render(), 'Ask Wise your plan').props.value;
  byLabel(app.render(), 'Ask Wise').props.onPress();
  assert.deepEqual(app.calls.submitted, [prompt]);
});

test('Ask Wise preserves the supplied submit handler and exposes loading without changing its label', () => {
  const app = harness();
  const onSubmit = () => {};
  const tree = app.renderAsk({ prompt: 'Test request', onChangePrompt: () => {}, onSubmit, isLoading: true });
  const button = byLabel(tree, 'Ask Wise');
  assert.equal(button.props.onPress, onSubmit);
  assert.deepEqual(button.props.accessibilityState, { disabled: true, busy: true });
  assert.equal(button.props.disabled, true);
  assert.equal(byText(button, 'Ask Wise').props.numberOfLines, 1);
  assert.ok(all(tree, (node) => node.type === 'ActivityIndicator').length);
  assert.equal(byLabel(tree, 'Try Date night').props.disabled, true);
});

test('location actions and the existing sheet call current-location behavior and preserve selection', () => {
  const app = harness();
  byLabel(app.render(), 'Change location').props.onPress();
  let sheet = all(app.render(), (node) => node.type === 'LocationSearchSheet')[0];
  assert.equal(sheet.props.visible, true);
  sheet.props.onUseCurrentLocation();
  assert.equal(app.calls.location, 1);
  sheet = all(app.render(), (node) => node.type === 'LocationSearchSheet')[0];
  assert.equal(sheet.props.visible, false);
  byLabel(app.render(), 'Use my current location').props.onPress();
  assert.equal(app.calls.location, 2);
  assert.equal(app.query().coordinates, app.location.selection.coordinates);
  app.location.status = 'denied'; app.location.selection = null; app.location.message = 'Test permission message';
  assert.ok(byText(app.render(), 'Test permission message'));
  byLabel(app.render(), 'Choose location').props.onPress();
  assert.equal(all(app.render(), (node) => node.type === 'LocationSearchSheet')[0].props.visible, true);
});

test('category codes and all four radius options reach the existing nearby hook unchanged', () => {
  const app = harness();
  let tree = app.render();
  assert.equal(app.query().radiusMeters, 5000);
  assert.equal(app.query().categoryCodes, undefined);
  const category = app.categories.categories[1];
  byLabel(tree, category.name).props.onPress();
  tree = app.render();
  assert.equal(app.query().categoryCodes, category.categoryCodes);
  assert.equal(byLabel(tree, `${category.name}, selected`).props.accessibilityState.selected, true);
  assert.equal(byLabel(tree, 'Test category 6'), undefined);
  byLabel(tree, 'Everything').props.onPress(); app.render();
  assert.equal(app.query().categoryCodes, undefined);
  for (const meters of [1000, 3000, 5000, 10000]) {
    byLabel(app.render(), `Discovery radius: ${meters / 1000} km`).props.onPress();
    tree = app.render();
    assert.equal(app.query().radiusMeters, meters);
    assert.equal(byLabel(tree, `Discovery radius: ${meters / 1000} km`).props.accessibilityState.selected, true);
  }
});

test('discovery grouping, order, detail navigation and favorite handlers remain connected', () => {
  const app = harness();
  const first = fixture('first'); const unknown = fixture('unknown', false); const second = fixture('second');
  app.nearby.places = [first, unknown, second];
  const tree = app.render();
  const detailButtons = all(tree, (node) => node.props.accessibilityLabel?.startsWith('View details for'));
  assert.deepEqual(detailButtons.map((node) => node.props.accessibilityLabel), [first, second, unknown].map((place) => `View details for ${place.name}`));
  detailButtons[0].props.onPress();
  assert.deepEqual(app.calls.routes[0], { pathname: '/place/[id]', params: { id: first.place_id, latitude: '0', longitude: '0', distanceMeters: '123' } });
  byLabel(tree, `Save ${first.name} to favorites`).props.onPress();
  assert.deepEqual(app.calls.toggled, ['first']);
  app.favoriteIds.add('first');
  assert.equal(byLabel(app.render(), `Remove ${first.name} from favorites`).props.accessibilityState.selected, true);
  assert.ok(byText(tree, 'Price not available yet'));
  assert.ok(app.formattedDistances.every((meters) => meters === 123));
});

test('anonymous favorite action still queues authentication and does not save prematurely', () => {
  const app = harness(); app.auth.user = null; const place = fixture('anonymous'); app.nearby.places = [place];
  byLabel(app.render(), `Save ${place.name} to favorites`).props.onPress();
  assert.deepEqual(app.calls.toggled, []);
  assert.equal(app.calls.queued.length, 1);
  assert.equal(app.calls.alerts[0][0], 'Sign in to save places');
  app.calls.queued[0]();
  assert.deepEqual(app.calls.toggled, ['anonymous']);
});

test('empty, loading, error and category retry states preserve their existing actions', () => {
  const app = harness();
  byLabel(app.render(), 'Use 10 km').props.onPress(); app.render(); assert.equal(app.query().radiusMeters, 10000);
  app.nearby.isLoading = true;
  assert.ok(byText(app.render(), 'Looking for places around you…'));
  app.nearby.isLoading = false; app.nearby.error = 'Test failure';
  byLabel(app.render(), 'Try again').props.onPress(); assert.equal(app.calls.refresh, 1);
  app.categories.error = 'Test failure';
  byLabel(app.render(), 'Retry loading categories').props.onPress(); assert.equal(app.calls.categories, 1);
});

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} Explore uses semantic surfaces and gives the hero priority over discovery`, () => {
    const app = harness(mode); app.nearby.places = [fixture(mode)];
    const tree = app.render();
    const theme = tokens.ColorTokens[mode];
    assert.equal(style(tree.props.style).backgroundColor, theme.background.canvas);
    const allNodes = all(tree, () => true);
    const labels = ['Use my current location', 'Ask Wise', `View details for TEST DATA ${mode}`, 'Everything, selected', 'Discovery radius: 1 km'];
    const positions = labels.map((label) => allNodes.findIndex((node) => node.props.accessibilityLabel === label));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    const hero = app.renderAsk({ prompt: '', onChangePrompt: () => {}, onSubmit: () => {} });
    assert.equal(style(hero.props.style).backgroundColor, theme.background.surfaceRaised);
    assert.equal(style(hero.props.style).borderRadius, tokens.Radius.card);
    assert.equal(style(hero.props.style).borderTopWidth, undefined);
    const card = app.renderPlace({ place: fixture(mode), isFavorite: false, onPress: () => {}, onToggleFavorite: () => {} });
    assert.equal(style(card.props.style).backgroundColor, theme.background.surface);
    assert.ok(style(hero.props.style).elevation > style(card.props.style).elevation);
    assert.equal(style(byText(hero, 'Ask Wise').props.style).color, theme.text.primary);
    assert.equal(style(byLabel(hero, 'Ask Wise').props.style).backgroundColor, theme.accent.primary);
  });
}

test('layout keeps one vertical scroll, wrapping copy, generous inputs and intact button labels', () => {
  const app = harness(); app.nearby.places = [fixture('long-name')];
  const tree = app.render();
  const scrolls = all(tree, (node) => node.type === 'ScrollView');
  assert.equal(scrolls.filter((node) => !node.props.horizontal).length, 1);
  assert.equal(scrolls[0].props.keyboardShouldPersistTaps, 'handled');
  assert.ok(style(scrolls[0].props.contentContainerStyle).paddingBottom >= 48);
  const input = byLabel(tree, 'Ask Wise your plan');
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.scrollEnabled, false);
  assert.equal(input.props.textAlignVertical, 'top');
  assert.ok(style(input.props.style).minHeight >= 48);
  assert.equal(style(input.props.style).height, undefined);
  for (const label of ['Ask Wise', 'Use my current location', 'Change location', 'Save TEST DATA long-name to favorites']) {
    const controlStyle = style(byLabel(tree, label).props.style);
    assert.ok((controlStyle.minHeight ?? controlStyle.height) >= 44);
  }
  const ctaStyle = style(byLabel(tree, 'Ask Wise').props.style);
  assert.equal(ctaStyle.width, undefined);
  assert.ok(all(tree, (node) => node.type === 'ScrollView' && node.props.horizontal).length >= 2, 'quick prompts and categories scroll independently');
  // The inline Ask control leaves editable text room at all phone widths.
  for (const width of [360, 390, 412, 430]) {
    const inputRoom = width - 4 * tokens.Spacing.md - 8 - (2 * ctaStyle.paddingHorizontal + 40);
    assert.ok(inputRoom >= 200, `${width}px editable prompt area`);
  }
  const name = byText(tree, 'TEST DATA long-name');
  assert.equal(name.props.numberOfLines, undefined);
});

test('one location control precedes Ask Wise even without location; provenance stays neutral', () => {
  const app = harness();
  for (const status of ['ready', 'idle', 'loading', 'denied', 'unavailable', 'error']) {
    app.location.status = status;
    app.location.selection = status === 'ready' ? { label: 'Test chosen area', coordinates: { latitude: 0, longitude: 0 } } : null;
    app.location.message = 'Test permission explanation';
    const tree = app.render();
    const nodes = all(tree, () => true);
    const controlLabel = status === 'ready' ? 'Change location' : 'Choose location';
    const controls = all(tree, (node) => node.props.accessibilityLabel === controlLabel);
    assert.equal(controls.length, 1);
    assert.ok(nodes.indexOf(controls[0]) < nodes.indexOf(byLabel(tree, 'Ask Wise')));
    assert.equal(byText(tree, 'Using current location'), undefined);
    assert.equal(byLabel(tree, 'Use my current location').props.disabled, status === 'loading');
    controls[0].props.onPress();
    const sheet = all(app.render(), (node) => node.type === 'LocationSearchSheet')[0];
    assert.equal(sheet.props.visible, true);
    sheet.props.onClose();
    assert.equal(all(app.render(), (node) => node.type === 'LocationSearchSheet')[0].props.visible, false);
  }
});

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: discovery pricing stays concise and truthful while detail keeps its explanation`, () => {
    const app = harness(mode);
    const priced = { ...fixture('pricing'), pricing_basis: 'brand_reference', pricing_status: 'estimated', budget_status: 'likely_fits', estimated_group_min_minor: 14000, estimated_group_max_minor: 27000 };
    const render = (place: any) => app.renderPlace({ place, isFavorite: false, onPress: () => {}, onToggleFavorite: () => {} });
    const tree = render(priced);
    assert.ok(byText(tree, '₱140–₱270'));
    assert.ok(byText(tree, 'Brand reference'));
    assert.ok(byText(tree, 'Likely fits'));
    assert.equal(byText(tree, 'Official brand reference'), undefined);
    assert.equal(all(tree, (n) => n.type === 'Text' && JSON.stringify(n.props.children).includes('Actual prices may vary')).length, 0);
    const full = expand(app.price.PriceSummary({ place: priced }));
    assert.ok(byText(full, 'Official brand reference'));
    assert.equal(all(full, (n) => n.type === 'Text' && JSON.stringify(n.props.children).includes('Actual prices may vary')).length, 1);
    assert.ok(style(byText(tree, priced.name).props.style).fontSize > style(byText(tree, '₱140–₱270').props.style).fontSize);
    assert.equal(style(byText(tree, 'Brand reference').props.style).color, tokens.ColorTokens[mode].text.secondary);

    for (const [basis, label] of [['branch_verified', 'Branch verified'], ['place_reference', 'Official place reference'], ['other', 'Test fixture only']]) {
      assert.ok(byText(render({ ...priced, pricing_basis: basis }), label));
    }
    const unknown = render({ ...priced, has_price: false });
    assert.ok(byText(unknown, 'Price not available yet'));
    assert.equal(byText(unknown, '₱140–₱270'), undefined);
    assert.equal(byText(unknown, 'Free admission'), undefined);
    const free = render({ ...priced, pricing_status: 'free', estimated_group_min_minor: 0, estimated_group_max_minor: 0 });
    assert.equal(all(free, (n) => n.type === 'Text' && n.props.children === 'Free admission').length, 1);
    assert.ok(byText(render({ ...priced, estimated_group_max_minor: 14000 }), '₱140'));
    const missingRange = render({ ...priced, estimated_group_min_minor: null });
    assert.ok(byText(missingRange, 'Brand reference'));
    assert.equal(byText(missingRange, '₱140–₱270'), undefined);

    const metadata = all(tree, (n) => n.type === 'View' && style(n.props.style).flexWrap === 'wrap')[0];
    assert.ok(metadata, 'decision information can wrap at narrow widths and large text sizes');
    assert.ok(byText(metadata, '₱140–₱270'));
    assert.ok(byText(metadata, '123 m'));
    assert.equal(byText(tree, 'Brand reference').props.numberOfLines, undefined);
  });
}
