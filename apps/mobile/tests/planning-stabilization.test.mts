import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { customizeNavigation } from '../src/services/customize-ui.ts';
import { ADD_STOP_CATEGORIES, MAX_ITINERARY_STOPS, buildStages, selectStop } from '../src/services/itinerary.ts';

const place = (id: string) => ({ place_id: id, name: id, latitude: 14.55, longitude: 121.05, category_name: 'Restaurant', category_code: 'food.restaurant', has_price: true, estimated_group_min_minor: 30000, estimated_group_max_minor: 30000, budget_status: 'fits' } as any);

test('Review exposes deterministic add-stop choices and a bounded user_added extension flow', () => {
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  assert.deepEqual(ADD_STOP_CATEGORIES.map((item) => item.label), ['Food', 'Café', 'Dessert', 'Something fun', 'Cinema', 'Attraction', 'Entertainment', 'Outdoor']);
  assert.equal(MAX_ITINERARY_STOPS, 6);
  assert.match(plan, /label="\+ Add another stop"/);
  assert.match(plan, /screen === 'add-category'/);
  assert.match(plan, /ADD_STOP_CATEGORIES\.map/);
  assert.match(plan, /addUserStage\(current, categoryId\)/);
  assert.match(plan, /updateStop\(place, currentStage\.source === 'user_added'\)/);
  assert.match(plan, /Maximum of \{MAX_ITINERARY_STOPS\} stops reached/);
  assert.match(plan, /currentStage\?\.source === 'user_added' && selectedId/);
});

test('four-stage Customize navigation stays sequential and only final stage reviews', () => {
  const stages = buildStages(['food_talk', 'activity_fun']);
  const base: any = { start: { latitude: 1, longitude: 2, label: 'Start' }, budgetMinor: 100000, partySize: 2, stages: [...stages, { id: 'user-added-1', title: 'Dessert', categoryCodes: ['food.dessert'], required: true, source: 'user_added' }, { id: 'user-added-2', title: 'Outdoor', categoryCodes: ['outdoor.park'], required: true, source: 'user_added' }], stops: [] };
  let selected = base;
  for (const stage of base.stages) selected = selectStop(selected, stage.id, place(stage.id));
  assert.equal(customizeNavigation(selected, 0).primaryLabel, 'Next');
  assert.equal(customizeNavigation(selected, 2).primaryLabel, 'Next');
  assert.equal(customizeNavigation(selected, 3).primaryLabel, 'Review your plan');
});

test('all itinerary reset controls use the shared Start over action, never a literal Start reset', () => {
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const reset = readFileSync(new URL('../src/components/itinerary/start-over-action.tsx', import.meta.url), 'utf8');
  assert.match(plan, /<StartOverAction onPress=\{clearPlan\}/);
  assert.match(reset, /START_OVER_LABEL/);
  assert.doesNotMatch(reset, /label="Start"|label='Start'/);
});
