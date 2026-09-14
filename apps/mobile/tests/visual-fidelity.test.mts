import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: any = {};
  new Function('exports', 'require', code)(exports, (name: string) => name === 'react/jsx-runtime' ? require(name) : dependencies[name]);
  return exports;
}
const tokens = load('constants/theme.ts', { 'react-native': { Platform: { select: (options: any) => options.default } }, '@/global.css': {} });

for (const mode of ['light', 'dark'] as const) {
  for (const width of [360, 390, 412, 430]) {
    test(`${mode}: ${width}px navigation reserves safe area and keeps four accessible destinations`, () => {
      for (const bottom of [0, 24, 48]) {
        const inset = load('hooks/use-floating-tab-inset.ts', { 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom }) } }).useFloatingTabInset();
        const layout = load('app/(tabs)/_layout.tsx', {
          'react-native': { View: 'View' }, '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
          'expo-router': { Tabs: Object.assign(() => null, { Screen: 'Screen' }) },
          'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom }) },
          '@/constants/theme': tokens,
          '@/hooks/use-theme': { useTheme: () => tokens.Colors[mode], useThemeElevation: () => tokens.ThemeElevation[mode] },
        }).default();
        const options = layout.props.screenOptions;
        const bar = options.tabBarStyle;
        assert.equal(bar.position, 'absolute');
        assert.equal(bar.bottom, bottom + 16);
        assert.equal(bar.borderRadius, tokens.Radius.navigation);
        assert.equal(bar.height, 64);
        assert.equal(options.tabBarHideOnKeyboard, true);
        assert.equal(options.tabBarActiveBackgroundColor, undefined, 'only the icon receives lime');
        assert.ok(inset >= bar.bottom + bar.height + 16, 'last scroll item clears the capsule');
        const items = layout.props.children;
        assert.deepEqual(items.map((item: any) => item.props.name), ['index', 'plan', 'favorites', 'profile']);
        const itemWidth = (width - bar.left - bar.right - 2 * bar.paddingHorizontal) / items.length - 2 * options.tabBarItemStyle.marginHorizontal;
        assert.ok(itemWidth >= 44);
        assert.ok(bar.height - bar.paddingTop - 2 * options.tabBarItemStyle.marginVertical >= 44);
        const active = items[0].props.options.tabBarIcon({ color: tokens.Colors[mode].text, focused: true });
        assert.equal(active.props.style.backgroundColor, tokens.Colors[mode].accent);
        assert.ok(active.props.style.width < itemWidth);
        const inactive = items[0].props.options.tabBarIcon({ color: tokens.Colors[mode].muted, focused: false });
        assert.equal(inactive.props.style.backgroundColor, 'transparent');
      }
    });
  }
}

test('semantic typography uses the centrally loaded bundled display and body fonts', () => {
  const root = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(root, /useFonts\(\{ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, PlusJakartaSans_400Regular \}\)/);
  assert.match(root, /if \(!fontsLoaded && !fontError\) return null/);
  for (const role of ['display', 'screenTitle', 'sectionTitle', 'cardTitle', 'label', 'button', 'eyebrow', 'price', 'badge']) {
    assert.match(tokens.Typography[role].fontFamily, /^SpaceGrotesk_/);
  }
  for (const role of ['body', 'bodySecondary', 'caption']) assert.equal(tokens.Typography[role].fontFamily, 'PlusJakartaSans_400Regular');
});
