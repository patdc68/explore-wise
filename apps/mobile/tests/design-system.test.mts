import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const theme = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8');
const clay = readFileSync(new URL('../src/components/ui/clay.tsx', import.meta.url), 'utf8');
const filterChip = readFileSync(new URL('../src/components/discovery/filter-chip.tsx', import.meta.url), 'utf8');

test('theme exposes one semantic palette with compatibility aliases', () => {
  for (const group of ['background', 'text', 'accent', 'border', 'semantic', 'depth']) {
    assert.match(theme, new RegExp(`${group}: \\{`));
  }
  assert.match(theme, /function compatibilityColors\(tokens:/);
  assert.match(theme, /light: compatibilityColors\(ColorTokens\.light\)/);
  assert.match(theme, /dark: compatibilityColors\(ColorTokens\.dark\)/);
  assert.match(theme, /display:[\s\S]*?screenTitle:[\s\S]*?sectionTitle:[\s\S]*?cardTitle:[\s\S]*?body:[\s\S]*?bodySecondary:[\s\S]*?metadata:[\s\S]*?label:[\s\S]*?button:[\s\S]*?caption:/);
  assert.match(theme, /flat:[\s\S]*?subtle:[\s\S]*?raised:[\s\S]*?hero:/);
});

test('button contract keeps labels safe and exposes disabled and loading state', () => {
  assert.match(clay, /export function ClayButton/);
  assert.match(clay, /accessibilityLabel=\{accessibilityLabel \?\? label\}/);
  assert.match(clay, /accessibilityState=\{\{ \.\.\.accessibilityState, busy: loading, disabled: inactive \}\}/);
  assert.match(clay, /numberOfLines=\{labelNumberOfLines\}/);
  assert.match(clay, /maxFontSizeMultiplier=\{1\.5\}/);
  assert.match(clay, /minHeight: TouchTarget\.primary/);
  assert.match(clay, /loading \? <ActivityIndicator/);
  assert.match(clay, /export function PrimaryButton/);
  assert.match(clay, /export function SecondaryButton/);
  assert.match(clay, /export function TertiaryButton/);
});

test('choice chip selection is semantic, visible, and not conveyed by color alone', () => {
  assert.match(clay, /export function ChoiceChip/);
  assert.match(clay, /accessibilityState=\{\{ \.\.\.accessibilityState, disabled: Boolean\(disabled\), selected \}\}/);
  assert.match(clay, /selected \? <ThemedText[\s\S]*?>✓<\/ThemedText> : null/);
  assert.match(clay, /selected && styles\.chipSelected/);
  assert.match(filterChip, /export \{ FilterChip \} from '@\/components\/ui\/clay'/);
});

test('input exposes focus, error, and disabled presentation APIs', () => {
  assert.match(clay, /export type ClayInputProps/);
  assert.match(clay, /error\?: boolean \| string/);
  assert.match(clay, /const \[focused, setFocused\] = useState\(false\)/);
  assert.match(clay, /hasError \? theme\.semantic\.error\.default : focused \? theme\.border\.focus/);
  assert.match(clay, /aria-invalid=\{hasError\}/);
  assert.match(clay, /editable=\{disabled \? false : editable\}/);
});

test('interactive cards and compact controls preserve accessibility and touch targets', () => {
  assert.match(clay, /export function ClayCard/);
  assert.match(clay, /accessibilityRole=\{accessibilityRole \?\? 'button'\}/);
  assert.match(clay, /pressed && !disabled && styles\.pressablePressed/);
  assert.match(clay, /export function IconButton/);
  assert.match(clay, /accessibilityLabel: string/);
  assert.match(clay, /height: TouchTarget\.comfortable/);
  assert.match(clay, /width: TouchTarget\.comfortable/);
});

test('metadata and screen layout stay lightweight and reusable', () => {
  assert.match(clay, /export function MetadataBadge/);
  assert.match(clay, /export function ScreenContainer/);
  assert.match(clay, /export function ScreenSection/);
  assert.match(clay, /paddingHorizontal: Spacing\.screenHorizontal/);
  assert.match(clay, /paddingBottom: Spacing\.xxxl/);
  assert.match(clay, /export function SectionHeader/);
});
