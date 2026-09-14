import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

import { createThemePreferenceStore, resolveThemePreference, THEME_PREFERENCE_KEY } from '../src/services/theme-preference.ts';

const require = createRequire(import.meta.url);
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
// Run production token/component code with host views stubbed, without a native renderer.
function load(path: string, dependencies: Record<string, unknown>) {
  const exports: any = {};
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  }).outputText;
  new Function('exports', 'require', compiled)(exports, (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unstubbed dependency: ${name}`);
  });
  return exports;
}

const native = {
  Platform: { select: (options: any) => options.default },
  StyleSheet: { create: (styles: any) => styles },
  View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch',
  TextInput: 'TextInput', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
};
const tokens = load('constants/theme.ts', { 'react-native': native, '@/global.css': {} });

function memoryStorage(saved: string | null = null) {
  return {
    saved,
    writes: [] as string[][],
    async getItem(key: string) { assert.equal(key, THEME_PREFERENCE_KEY); return this.saved; },
    async setItem(key: string, value: string) { this.saved = value; this.writes.push([key, value]); },
  };
}

for (const [saved, expected] of [[null, 'light'], ['light', 'light'], ['dark', 'dark'], ['corrupt', 'light']] as const) {
  test(`restoring ${JSON.stringify(saved)} resolves to ${expected}`, async () => {
    const storage = memoryStorage(saved);
    const store = createThemePreferenceStore(storage);
    assert.deepEqual(store.getSnapshot(), { preference: 'light', ready: false });
    await store.hydrate();
    assert.deepEqual(store.getSnapshot(), { preference: expected, ready: true });
    assert.deepEqual(storage.writes, []);
  });
}

test('invalid values never infer a device or system preference', () => {
  for (const value of ['system', 'DARK', '"dark"', '', undefined, {}, true, 1]) {
    assert.equal(resolveThemePreference(value), 'light');
  }
});

test('storage read failure falls back to light and releases startup', async () => {
  const store = createThemePreferenceStore({ ...memoryStorage(), getItem: async () => { throw new Error('unavailable'); } });
  await store.hydrate();
  assert.deepEqual(store.getSnapshot(), { preference: 'light', ready: true });
});

function uiHarness(store: ReturnType<typeof createThemePreferenceStore>) {
  const preference = { useThemePreference: () => ({ ...store.getSnapshot(), setPreference: store.setPreference }) };
  const hooks = load('hooks/use-theme.ts', { '@/constants/theme': tokens, '@/providers/theme-provider': preference });
  const themedText = load('components/themed-text.tsx', { 'react-native': native, '@/constants/theme': tokens, '@/hooks/use-theme': hooks });
  const clay = load('components/ui/clay.tsx', {
    react: { useState: (initial: unknown) => [initial, () => {}] },
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/constants/theme': tokens, '@/hooks/use-theme': hooks, '@/components/themed-text': themedText,
  });
  const setting = load('components/appearance-setting.tsx', {
    'react-native': native, '@/constants/theme': tokens, '@/hooks/use-theme': hooks,
    '@/providers/theme-provider': preference, '@/components/themed-text': themedText, '@/components/ui/clay': clay,
  });
  return { ...setting, clay, hooks, themedText };
}

for (const [initial, next] of [['light', 'dark'], ['dark', 'light']] as const) {
  test(`${initial} to ${next} immediately updates both theme APIs and persists the expected value`, async () => {
    const storage = memoryStorage(initial);
    const store = createThemePreferenceStore(storage);
    await store.hydrate();
    const { hooks } = uiHarness(store);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => { notifications++; });
    const write = store.setPreference(next);
    assert.equal(hooks.useTheme(), tokens.Colors[next]);
    assert.equal(hooks.useDesignTheme(), tokens.ColorTokens[next]);
    assert.equal(hooks.useThemeElevation(), tokens.ThemeElevation[next]);
    assert.equal(notifications, 1);
    unsubscribe();
    await write;
    assert.deepEqual(storage.writes, [[THEME_PREFERENCE_KEY, next]]);
    const restarted = createThemePreferenceStore(storage);
    await restarted.hydrate();
    assert.equal(restarted.getSnapshot().preference, next);
  });
}

test('rapid toggles serialize storage writes and preserve the last choice', async () => {
  const storage = memoryStorage();
  const store = createThemePreferenceStore(storage);
  await store.hydrate();
  const first = store.setPreference('dark');
  const last = store.setPreference('light');
  assert.equal(store.getSnapshot().preference, 'light');
  await Promise.all([first, last]);
  assert.deepEqual(storage.writes, [[THEME_PREFERENCE_KEY, 'dark'], [THEME_PREFERENCE_KEY, 'light']]);
  assert.equal(storage.saved, 'light');
});

test('a failed write does not break subsequent persistence or current theme', async () => {
  let attempts = 0;
  const storage = memoryStorage();
  const store = createThemePreferenceStore({ ...storage, async setItem(key, value) {
    if (++attempts === 1) throw new Error('unavailable');
    await storage.setItem(key, value);
  } });
  await store.setPreference('dark');
  assert.equal(store.getSnapshot().preference, 'dark');
  await store.setPreference('light');
  assert.equal(storage.saved, 'light');
});

test('hydration is idempotent and cannot overwrite a newer explicit preference', async () => {
  let finish!: (value: string) => void;
  const store = createThemePreferenceStore({ ...memoryStorage(), getItem: () => new Promise((resolve) => { finish = resolve; }) });
  const hydration = store.hydrate();
  assert.equal(store.hydrate(), hydration);
  await store.setPreference('dark');
  finish('light');
  await hydration;
  assert.equal(store.getSnapshot().preference, 'dark');
});

function paths(value: any, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) => typeof item === 'object' ? paths(item, `${prefix}${key}.`) : `${prefix}${key}`).sort();
}

test('light and dark expose equivalent semantic token and elevation structures', () => {
  assert.deepEqual(paths(tokens.ColorTokens.light), paths(tokens.ColorTokens.dark));
  assert.deepEqual(paths(tokens.Colors.light), paths(tokens.Colors.dark));
  assert.deepEqual(paths(tokens.ThemeElevation.light), paths(tokens.ThemeElevation.dark));
  assert.equal(tokens.ThemeElevation.light, tokens.Elevation);
});

function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('dark palette has separated surfaces, readable text/semantics, lime accent and restrained depth', () => {
  const dark = tokens.ColorTokens.dark;
  assert.equal(new Set(Object.values(dark.background)).size, 4);
  for (const background of Object.values(dark.background) as string[]) {
    for (const foreground of [dark.text.primary, dark.text.secondary, dark.text.muted]) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
    }
  }
  assert.ok(contrast(dark.accent.onPrimary, dark.accent.primary) >= 4.5);
  for (const semantic of Object.values(dark.semantic) as any[]) assert.ok(contrast(semantic.default, semantic.soft) >= 4.5);
  for (const level of ['subtle', 'raised', 'hero']) {
    assert.ok(tokens.ThemeElevation.dark[level].shadowRadius < tokens.Elevation[level].shadowRadius);
    assert.ok(tokens.ThemeElevation.dark[level].elevation < tokens.Elevation[level].elevation);
  }
});

test('approved Stitch canvas, text, accent and surface roles retain compatibility aliases', () => {
  const light = tokens.ColorTokens.light;
  assert.equal(light.background.canvas, '#FAF8F2');
  assert.equal(light.background.surface, '#FFFFFF');
  assert.equal(light.background.surfaceRaised, '#FFFFFF');
  assert.equal(light.text.primary, '#0D172A');
  assert.equal(light.border.subtle, '#E5E0D4');
  const dark = tokens.ColorTokens.dark;
  assert.equal(dark.background.canvas, '#0B1320');
  assert.equal(dark.background.surface, '#162238');
  assert.equal(dark.background.surfaceRaised, '#1E2E4A');
  assert.equal(dark.text.primary, '#F8FAFC');
  assert.equal(dark.border.subtle, '#334155');
  for (const mode of ['light', 'dark']) {
    const theme = tokens.ColorTokens[mode];
    assert.equal(theme.accent.primary, '#84CC16');
    assert.ok(contrast(theme.accent.onPrimary, theme.accent.primary) >= 4.5);
    assert.equal(tokens.Colors[mode].background, theme.background.canvas);
    assert.equal(tokens.Colors[mode].accent, theme.accent.primary);
    assert.equal(tokens.Colors[mode].text, theme.text.primary);
  }
});

function find(element: any, type: any): any {
  if (!element || typeof element !== 'object') return undefined;
  if (element.type === type) return element;
  return [element.props?.children].flat(Infinity).map((child) => find(child, type)).find(Boolean);
}
const flattenStyle = (style: any): any => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('Dark mode row and native switch expose the current state and both toggle the preference', async () => {
  const store = createThemePreferenceStore(memoryStorage());
  await store.hydrate();
  const { AppearanceSetting, clay } = uiHarness(store);
  for (const enabled of [false, true]) {
    const element = AppearanceSetting();
    const card = find(element, clay.ClayCard);
    const row = clay.ClayCard(card.props);
    const toggle = find(element, 'Switch');
    for (const control of [row, toggle]) {
      assert.equal(control.props.accessibilityRole, 'switch');
      assert.equal(control.props.accessibilityLabel, 'Dark mode');
      assert.equal(control.props.accessibilityState.checked, enabled);
    }
    assert.equal(toggle.props.value, enabled);
    assert.ok(flattenStyle(row.props.style({ pressed: false })).minHeight >= 48);
    if (!enabled) row.props.onPress();
    else toggle.props.onValueChange(false);
    assert.equal(store.getSnapshot().preference, enabled ? 'light' : 'dark');
  }
});

for (const preference of ['light', 'dark'] as const) {
  test(`shared primitives consume the ${preference} palette and depth`, async () => {
    const store = createThemePreferenceStore(memoryStorage(preference));
    await store.hydrate();
    const { clay, themedText } = uiHarness(store);
    const theme = tokens.ColorTokens[preference];
    const depth = tokens.ThemeElevation[preference];
    const card = clay.ClayCard({ variant: 'raised' });
    assert.equal(flattenStyle(card.props.style).backgroundColor, theme.background.surfaceRaised);
    assert.equal(flattenStyle(card.props.style).elevation, depth.raised.elevation);
    for (const [name, background] of [['PrimaryButton', theme.accent.primary], ['SecondaryButton', theme.action.secondary], ['TertiaryButton', 'transparent']]) {
      const wrapper = clay[name]({ label: 'Example' });
      const button = clay.ClayButton(wrapper.props);
      assert.equal(flattenStyle(button.props.style({ pressed: false })).backgroundColor, background);
    }
    const input = clay.ClayInput({});
    assert.equal(flattenStyle(input.props.style).color, theme.text.primary);
    for (const name of ['ChoiceChip', 'FilterChip', 'IconButton']) {
      const control = clay[name]({ label: 'Example', accessibilityLabel: 'Example' });
      assert.equal(flattenStyle(control.props.style({ pressed: false })).backgroundColor, theme.background.surfaceRaised);
    }
    const badge = clay.MetadataBadge({ label: 'Info', tone: 'info' });
    assert.equal(flattenStyle(badge.props.style).backgroundColor, theme.semantic.info.soft);
    assert.equal(flattenStyle(clay.ScreenContainer({}).props.style).backgroundColor, theme.background.canvas);
    assert.equal(flattenStyle(themedText.ThemedText({}).props.style).color, theme.text.primary);
    assert.ok(clay.ScreenSection({}));
    assert.ok(clay.SectionHeader({ title: 'Appearance' }));
  });
}

test('startup and navigation use the local preference with native automatic support retained', () => {
  assert.match(source('providers/theme-provider.tsx'), /ready \? children : null/);
  assert.match(source('app/_layout.tsx'), /<ThemeProvider><ThemedRootLayout \/><\/ThemeProvider>/);
  assert.match(source('app/_layout.tsx'), /Appearance\.setColorScheme\(preference\)/);
  assert.match(source('app/_layout.tsx'), /<StatusBar style=\{preference === 'dark' \? 'light' : 'dark'\}/);
  assert.match(source('app/_layout.tsx'), /SystemUI\.setBackgroundColorAsync\(theme\.background\.canvas\)/);
  assert.match(source('app/(tabs)/_layout.tsx'), /const colors = useTheme\(\)/);
  assert.doesNotMatch(source('hooks/use-theme.ts') + source('app/_layout.tsx') + source('app/(tabs)/_layout.tsx'), /useColorScheme/);
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(config.expo.userInterfaceStyle, 'automatic');
});
