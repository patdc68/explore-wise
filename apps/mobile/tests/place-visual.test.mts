import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path: string, dependencies: Record<string, unknown> = {}) {
  const exports: any = {};
  const url = new URL(`../src/${path}`, import.meta.url);
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('exports', 'require', code)(exports, (name: string) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.endsWith('.svg')) {
      const asset = new URL(name, url);
      const svg = readFileSync(asset, 'utf8');
      assert.match(svg, /viewBox="0 0 640 360"/);
      assert.doesNotMatch(svg, /<image|<script|href=/);
      assert.ok(statSync(asset).size < 5000);
      return asset.href;
    }
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected visual dependency: ${name}`);
  });
  return exports;
}

const resolver = load('services/place-visual.ts');
const place = { name: 'TEST DATA venue', category_code: 'food.restaurant' };
const photo = 'https://example.com/test-fixtures/venue.jpg';

for (const [category, family] of Object.entries({
  'food.restaurant': 'restaurant', 'food.cafe': 'cafe', 'food.bakery': 'bakery',
  'food.dessert': 'dessert', 'activity.recreation': 'recreation',
  entertainment: 'entertainment', 'entertainment.cinema': 'cinema',
  'outdoor.park': 'outdoor', 'attraction.museum': 'culture', 'attraction.culture': 'culture',
  attraction: 'attraction', food: 'restaurant', activity: 'recreation', outdoor: 'outdoor',
})) {
  test(`${category} resolves to local ${family} artwork`, () => {
    const result = resolver.resolvePlaceVisual({ ...place, category_code: category });
    assert.equal(result.kind, 'artwork');
    assert.equal(result.family, family);
    assert.ok(result.source.endsWith(`/${family}.svg`));
    assert.match(result.accessibilityLabel, /category artwork$/);
    assert.ok(!result.accessibilityLabel.includes(place.name));
  });
}

test('normalizes categories and walks the nearest known parent without using the venue name', () => {
  assert.equal(resolver.getCategoryFallbackAsset(' FOOD.CAFE ').family, 'cafe');
  assert.equal(resolver.getCategoryFallbackAsset('food.cafe.specialty').family, 'cafe');
  assert.equal(resolver.getCategoryFallbackAsset('food.unmapped').family, 'restaurant');
  assert.equal(resolver.getCategoryFallbackAsset('attraction.unmapped').family, 'attraction');
  assert.deepEqual(resolver.resolvePlaceVisual({ ...place, name: 'TEST different name' }), resolver.resolvePlaceVisual(place));
});

test('unknown, malformed and absent categories safely resolve to generic discovery artwork', () => {
  for (const category of [undefined, null, '', '   ', 'unknown', 'foodtruck', 'food..cafe', 'food/cafe', '__proto__', 'constructor', 42, {}]) {
    const result = resolver.getCategoryFallbackAsset(category);
    assert.equal(result.family, 'generic');
    assert.equal(result.accessibilityLabel, 'ExploreWise discovery artwork');
  }
  assert.equal(resolver.resolvePlaceVisual({}).family, 'generic');
});

test('valid real image takes precedence with a truthful venue label', () => {
  const result = resolver.resolvePlaceVisual(place, { realImageUrl: ` ${photo} ` });
  assert.equal(result.kind, 'photo');
  assert.deepEqual(result.source, { uri: photo });
  assert.equal(result.accessibilityLabel, `Photo of ${place.name}`);
  assert.equal(resolver.resolvePlaceVisual({ category_code: 'unknown' }, { realImageUrl: photo }).kind, 'photo');
});

test('missing and unsafe image URLs use category artwork without throwing', () => {
  for (const value of [undefined, null, '', 'not a url', '/photo.jpg', '//example.com/photo.jpg',
    'http://example.com/photo.jpg', 'file:///photo.jpg', 'data:image/png;base64,AA==',
    'javascript:alert(1)', 'https://', 'https://user:password@example.com/photo.jpg',
    'https://example.com/a b.jpg', 'https://example.com/\nphoto.jpg', 'https://example.com\\photo.jpg', 42, {}]) {
    assert.equal(resolver.resolvePlaceVisual(place, { realImageUrl: value }).family, 'restaurant');
  }
});

test('request failure is local to its URL and never mutates place data', () => {
  const frozenPlace = Object.freeze({ ...place });
  assert.equal(resolver.resolvePlaceVisual(frozenPlace, { realImageUrl: photo, failedImageUrl: photo }).family, 'restaurant');
  assert.equal(resolver.resolvePlaceVisual(frozenPlace, { realImageUrl: `${photo}?v=2`, failedImageUrl: photo }).kind, 'photo');
  assert.equal(resolver.resolvePlaceVisual(frozenPlace, { realImageUrl: photo }).kind, 'photo');
  assert.deepEqual(frozenPlace, place);
});

const native = {
  StyleSheet: { create: (styles: any) => styles }, Platform: { select: (options: any) => options.default },
  View: 'View', Pressable: 'Pressable', Text: 'Text',
};
const tokens = load('constants/theme.ts', { 'react-native': native, '@/global.css': {} });
const style = (value: any): any => Array.isArray(value) ? Object.assign({}, ...value.map(style)) : typeof value === 'function' ? style(value({ pressed: false })) : value || {};
function nodes(tree: any, predicate: (node: any) => boolean): any[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function harness(mode: 'light' | 'dark') {
  let cursor = 0;
  let requestKey: string | null = null;
  let states: any[] = [];
  const react = { useState(initial: any) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: any) => { states[index] = next; }];
  } };
  const hooks = {
    useDesignTheme: () => tokens.ColorTokens[mode], useTheme: () => tokens.Colors[mode],
    useThemeElevation: () => tokens.ThemeElevation[mode],
  };
  const base = { 'react-native': native, '@/hooks/use-theme': hooks, '@/constants/theme': tokens, react };
  const text = load('components/themed-text.tsx', base);
  const clay = load('components/ui/clay.tsx', { ...base, '@/components/themed-text': text, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' } });
  const visual = load('components/discovery/place-visual.tsx', { ...base, 'expo-image': { Image: 'Image' }, '@/services/place-visual': resolver });
  const card = load('components/discovery/place-card.tsx', {
    ...base, '@/components/themed-text': text, '@/components/ui/clay': clay,
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    './place-visual': visual, './price-summary': { PriceSummary: 'PriceSummary' },
    '@/services/places': { formatDistance: (meters: number) => `${meters} m` },
  });
  function expand(element: any): any {
    if (!element || typeof element !== 'object') return element;
    if (Array.isArray(element)) return element.map(expand);
    if (typeof element.type === 'function') {
      // Model React's keyed remount boundary; execute production hook/event code.
      if (element.key !== null && element.key !== requestKey) { states = []; cursor = 0; requestKey = element.key; }
      return expand(element.type(element.props));
    }
    return { ...element, props: { ...element.props, children: expand(element.props.children) } };
  }
  return {
    renderVisual: (props: any) => { cursor = 0; return expand(visual.PlaceVisual(props)); },
    renderCard: (props: any) => { cursor = 0; return expand(card.PlaceCard(props)); },
  };
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: loading, displayed photo and failure retain the same frame and truthful labels`, () => {
    const app = harness(mode);
    const props = { place, placeId: 'test-1', realImageUrl: photo };
    let tree = app.renderVisual(props);
    const frame = style(tree.props.style);
    assert.equal(frame.aspectRatio, 16 / 9);
    assert.equal(frame.backgroundColor, tokens.ColorTokens[mode].background.subtle);
    assert.equal(tree.props.accessibilityLabel, 'Restaurant category artwork');
    assert.equal(nodes(tree, (n) => n.type === 'Image').length, 2);
    const remote = nodes(tree, (n) => n.props.source?.uri === photo)[0];
    remote.props.onDisplay();
    tree = app.renderVisual(props);
    assert.equal(tree.props.accessibilityLabel, `Photo of ${place.name}`);
    assert.deepEqual(style(tree.props.style), frame);
    remote.props.onError();
    tree = app.renderVisual(props);
    assert.equal(tree.props.accessibilityLabel, 'Restaurant category artwork');
    assert.deepEqual(style(tree.props.style), frame);
    assert.equal(nodes(tree, (n) => n.type === 'Image').length, 1);
    assert.equal(nodes(tree, (n) => n.type === 'Image')[0].props.accessible, false);
    tree = app.renderVisual({ ...props, realImageUrl: `${photo}?v=2` });
    assert.equal(nodes(tree, (n) => n.type === 'Image').length, 2);
    assert.equal(tree.props.accessibilityLabel, 'Restaurant category artwork');
  });

  test(`${mode}: card keeps details and Favorite independent, themed and accessible`, () => {
    const app = harness(mode);
    let details = 0; let favorites = 0;
    const fixture = { ...place, place_id: 'test-card', city: 'TEST city', category_name: 'Restaurant', distance_meters: 1200, has_price: false };
    for (const selected of [false, true]) {
      const tree = app.renderCard({ place: fixture, isFavorite: selected, onPress: () => details++, onToggleFavorite: () => favorites++ });
      assert.equal(style(tree.props.style).backgroundColor, tokens.ColorTokens[mode].background.surface);
      const buttons = nodes(tree, (n) => n.props.accessibilityRole === 'button');
      const favorite = buttons.find((n) => n.props.accessibilityLabel.includes('favorites'));
      const detail = buttons.find((n) => n.props.accessibilityLabel.startsWith('View details'));
      assert.equal(favorite.props.accessibilityState.selected, selected);
      assert.ok(style(favorite.props.style).height >= 44);
      assert.ok(style(favorite.props.style).width >= 44);
      assert.equal(style(favorite.props.style).backgroundColor, selected ? tokens.ColorTokens[mode].accent.primarySoft : 'transparent');
      favorite.props.onPress(); assert.equal(favorites, selected ? 2 : 1); assert.equal(details, selected ? 1 : 0);
      detail.props.onPress();
      assert.equal(nodes(tree, (n) => n.type === 'PriceSummary')[0].props.place, fixture);
      assert.equal(nodes(tree, (n) => n.props.accessibilityRole === 'image').length, 1);
      const name = nodes(tree, (n) => n.props.children === fixture.name)[0];
      assert.equal(name.props.numberOfLines, undefined);
    }
  });

  test(`${mode}: compact discovery artwork uses a stable mobile row tile through photo loading and failure`, () => {
    const app = harness(mode);
    const props = { place: { ...place, place_id: 'test-compact', has_price: false }, realImageUrl: photo, isFavorite: false, onPress: () => {}, onToggleFavorite: () => {} };
    const frame = (tree: any) => style(nodes(tree, (n) => n.props.accessibilityRole === 'image')[0].props.style);
    let tree = app.renderCard(props);
    const initialFrame = frame(tree);
    assert.equal(initialFrame.width, 96);
    assert.equal(initialFrame.height, 96);
    assert.equal(initialFrame.aspectRatio, 1);
    for (const width of [360, 390, 412, 430]) {
      const contentWidth = width - 2 * tokens.Spacing.screenHorizontal - 2 - 2 * tokens.Spacing.sm - tokens.Spacing.sm - initialFrame.width;
      assert.ok(contentWidth >= 190);
    }
    assert.equal(nodes(tree, (n) => n.type === 'PriceSummary')[0].props.compact, true);
    const remote = nodes(tree, (n) => n.props.source?.uri === photo)[0];
    remote.props.onDisplay();
    tree = app.renderCard(props);
    assert.deepEqual(frame(tree), initialFrame);
    remote.props.onError();
    tree = app.renderCard(props);
    assert.deepEqual(frame(tree), initialFrame);
    assert.equal(nodes(tree, (n) => n.props.accessibilityRole === 'image')[0].props.accessibilityLabel, 'Restaurant category artwork');
  });
}

test('a request failing before display and recycled places recover independently', () => {
  const app = harness('light');
  const props = { place, placeId: 'test-1', realImageUrl: photo };
  let tree = app.renderVisual(props);
  nodes(tree, (n) => n.props.source?.uri === photo)[0].props.onError();
  tree = app.renderVisual(props);
  assert.equal(nodes(tree, (n) => n.type === 'Image').length, 1);
  tree = app.renderVisual({ ...props, place: { ...place, name: 'TEST renamed' } });
  assert.equal(nodes(tree, (n) => n.type === 'Image').length, 1, 'renaming must not change image identity');
  tree = app.renderVisual({ ...props, placeId: 'test-2' });
  assert.equal(nodes(tree, (n) => n.type === 'Image').length, 2);
});
