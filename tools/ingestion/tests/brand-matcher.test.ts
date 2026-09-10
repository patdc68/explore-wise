import assert from 'node:assert/strict';
import test from 'node:test';
import { PHASE1_BRAND_DEFINITIONS, matchBrandName } from '../src/pricing/brand-matcher.js';

test('Phase 1 brand matcher supports exact, qualified, and alias-safe names', () => {
  assert.equal(matchBrandName('Jollibee')?.canonicalName, 'Jollibee');
  assert.equal(matchBrandName('Jollibee - SM North')?.canonicalName, 'Jollibee');
  assert.equal(matchBrandName('KFC BGC')?.canonicalName, 'KFC');
  assert.equal(matchBrandName('Mang Inasal Molino')?.canonicalName, 'Mang Inasal');
  assert.equal(matchBrandName('Jolly Bee Cafe'), null);
  assert.equal(matchBrandName('King Chow'), null);
  assert.equal(matchBrandName('SuperJollibee'), null);
  assert.equal(PHASE1_BRAND_DEFINITIONS[0]?.matchingRuleVersion, 'phase1_brand_reference_v1');
});
