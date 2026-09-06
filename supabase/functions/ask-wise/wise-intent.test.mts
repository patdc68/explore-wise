import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetMinorFromPrompt, normalizePromptBudget, normalizeWiseIntent, validateWisePrompt } from './wise-intent.ts';

const wire = (overrides: Record<string, unknown> = {}) => ({ budget_minor: 300000, party_size: 4, location: 'BGC', currency_code: 'php', time_context: 'tonight', preferences: ['conversation-friendly', 'fun'], exclusions: ['bar'], stages: ['food_talk', 'activity_fun'], ...overrides });
test('normalizes English, Filipino, and Taglish-shaped structured intent into the one canonical contract', () => {
  for (const source of ['English', 'Filipino', 'Taglish']) { const intent = normalizeWiseIntent(wire({ preferences: [source] })); assert.equal(intent?.budgetMinor, 300000); assert.equal(intent?.partySize, 4); assert.equal(intent?.currencyCode, 'PHP'); assert.deepEqual(intent?.stages, ['food_talk', 'activity_fun']); }
});
test('accepts omitted nullable values and preserves exclusions', () => { const intent = normalizeWiseIntent(wire({ budget_minor: null, party_size: null, location: null, currency_code: null, time_context: null, exclusions: ['no alcohol', 'not too crowded'], stages: ['activity_fun'] })); assert.equal(intent?.budgetMinor, null); assert.deepEqual(intent?.exclusions, ['no alcohol', 'not too crowded']); });
test('rejects invalid domain values, extra fields, and place or pricing injection', () => { assert.equal(normalizeWiseIntent(wire({ party_size: 0 })), null); assert.equal(normalizeWiseIntent(wire({ stages: ['restaurant A'] })), null); assert.equal(normalizeWiseIntent({ ...wire(), restaurant_name: 'Fabricated Place', estimated_price: 10000 }), null); });
test('rejects blank and oversized prompts before provider invocation', () => { assert.equal(validateWisePrompt('  '), null); assert.equal(validateWisePrompt('x'.repeat(1201)), null); assert.equal(validateWisePrompt('  kain muna  '), 'kain muna'); });
test('preserves a PHP 1,500 request as 150000 minor units with restaurant then activity stages', () => { const intent = normalizeWiseIntent(wire({ budget_minor: 150000, party_size: null, stages: ['food_talk', 'activity_fun'] })); assert.equal(intent?.budgetMinor, 150000); assert.equal(intent?.partySize, null); assert.deepEqual(intent?.stages, ['food_talk', 'activity_fun']); });
test('normalizes an explicit PHP prompt budget when a provider incorrectly returns whole pesos', () => {
  assert.equal(budgetMinorFromPrompt('I have a date tonight. And my budget is 1500.'), 150000);
  assert.equal(budgetMinorFromPrompt('Budget: 2.5k'), 250000);
  const intent = normalizeWiseIntent(wire({ budget_minor: 1500 }));
  assert.equal(normalizePromptBudget(intent!, 'my budget is 1500').budgetMinor, 150000);
});
test('preserves explicit ramen intent in the existing structured preferences contract', () => {
  const intent = normalizeWiseIntent(wire({ budget_minor: 200000, party_size: 2, location: 'Makati', preferences: ['ramen'], exclusions: [], stages: ['food_talk'] }));
  assert.equal(intent?.budgetMinor, 200000);
  assert.equal(intent?.partySize, 2);
  assert.deepEqual(intent?.preferences, ['ramen']);
  assert.deepEqual(intent?.stages, ['food_talk']);
});
