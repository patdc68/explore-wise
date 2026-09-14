import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { activityFocusFor } from '../src/services/ask-wise-normalization.ts';
import { customizeNavigation, stageSelectionHeading } from '../src/services/customize-ui.ts';
import { orderStageCandidates, visibleStageCandidates } from '../src/services/food-candidate-diversity.ts';
import { activityCategoryCodes, addUserStage, buildStages, stageActivityFocus } from '../src/services/itinerary.ts';

const place = (name: string, category: string) => ({ place_id: name, name, latitude: 14.55, longitude: 121.05, category_code: category, category_name: category, has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null } as any);

test('stage headings and activity ranking use the normalized focused stage, not candidate or proposal residue', () => {
  const generic = buildStages(['activity_fun'])[0]!;
  const cinema = buildStages(['activity_fun'], [], 'cinema')[0]!;
  const candidates = [place('Cinema', 'entertainment.cinema'), place('Park', 'outdoor.park'), place('Bowling', 'activity.recreation'), place('Museum', 'attraction.museum')];

  assert.equal(stageSelectionHeading(generic), 'Choose something fun');
  assert.equal(stageActivityFocus(generic), null);
  assert.deepEqual(new Set(orderStageCandidates(generic.categoryCodes, candidates, { activityFocus: stageActivityFocus(generic) }).map((item) => item.category_code)), new Set(candidates.map((item) => item.category_code)));
  assert.equal(stageSelectionHeading(cinema), 'Choose a cinema');
  assert.equal(stageActivityFocus(cinema), 'cinema');
  assert.equal(orderStageCandidates(cinema.categoryCodes, candidates, { activityFocus: stageActivityFocus(cinema) })[0]?.name, 'Cinema');

  const reconstructedGeneric = buildStages(['activity_fun'])[0]!;
  assert.equal(stageSelectionHeading(reconstructedGeneric), 'Choose something fun');
  assert.equal(stageActivityFocus(reconstructedGeneric), null);
});

test('user-added cinema and entertainment retain their own stage constraints', () => {
  const base: any = { start: { latitude: 14.55, longitude: 121.05, label: 'BGC' }, budgetMinor: 0, partySize: 1, stages: buildStages(['activity_fun']), stops: [] };
  const cinema = addUserStage(base, 'cinema').stages.at(-1)!;
  const entertainment = addUserStage(base, 'entertainment').stages.at(-1)!;
  assert.equal(stageSelectionHeading(cinema), 'Choose a cinema');
  assert.equal(stageActivityFocus(cinema), 'cinema');
  assert.equal(stageSelectionHeading(entertainment), 'Choose an entertainment option');
  assert.equal(stageActivityFocus(entertainment), null);
});

test('curated activity top eight defers institutional candidates but View more retains valid ones', () => {
  const fixture = [
    place('Commercial Cinema', 'entertainment.cinema'), place('Bowling Venue', 'activity.recreation'), place('Museum', 'attraction.museum'), place('Gallery', 'attraction.culture'),
    place('Major Attraction', 'attraction'), place('Public Park', 'outdoor.park'), place('Arcade', 'entertainment'), place('Visitor Center', 'attraction.culture'),
    place('Allied Medical Sciences Auditorium', 'entertainment'), place('Barangay Administrative Hall', 'attraction.culture'), place('Government Office', 'attraction'),
  ];
  const ranked = orderStageCandidates(activityCategoryCodes(), fixture, { outingContext: 'date' });
  const curated = visibleStageCandidates(activityCategoryCodes(), fixture).map((item) => item.name);
  for (const strong of ['Commercial Cinema', 'Bowling Venue', 'Museum', 'Gallery', 'Major Attraction', 'Public Park', 'Arcade', 'Visitor Center']) assert.ok(ranked.findIndex((item) => item.name === strong) < ranked.findIndex((item) => item.name === 'Allied Medical Sciences Auditorium'));
  assert.equal(curated.includes('Allied Medical Sciences Auditorium'), false);
  assert.ok(ranked.slice(8).some((item) => item.name === 'Allied Medical Sciences Auditorium'));

  assert.equal(activityFocusFor('find an auditorium'), 'auditorium');
  assert.equal(orderStageCandidates(['entertainment'], fixture, { activityFocus: 'auditorium' })[0]?.name, 'Allied Medical Sciences Auditorium');
});

test('date food keeps comparable restaurants ahead of bars unless nightlife is explicit', () => {
  const fixture = [place('Late Bar', 'food.restaurant'), place('Regular Restaurant', 'food.restaurant'), place('Bistro', 'food.restaurant')];
  assert.equal(orderStageCandidates(['food.restaurant'], fixture, { outingContext: 'date' })[0]?.name, 'Regular Restaurant');
  assert.equal(orderStageCandidates(['food.restaurant'], fixture, { outingContext: 'date', explicitNightlife: true })[0]?.name, 'Late Bar');
});

test('loading, empty selection, and valid selection expose truthful progression states', () => {
  const stages = buildStages(['food_talk', 'activity_fun']);
  const initial: any = { start: { latitude: 14.55, longitude: 121.05, label: 'BGC' }, budgetMinor: 0, partySize: 1, stages, stops: [] };
  assert.deepEqual(customizeNavigation(initial, 0, { loading: true }), { backDisabled: true, canContinue: false, primaryLabel: 'Finding places…', review: false });
  assert.equal(customizeNavigation(initial, 0).primaryLabel, 'Select a place');
  assert.equal(customizeNavigation(initial, 0).canContinue, false);
  const selected = { ...initial, stops: [{ stageId: stages[0].id, place: place('Dinner', 'food.restaurant') }] };
  assert.equal(customizeNavigation(selected, 0, { currentSelectionValid: true }).primaryLabel, 'Next');
  assert.equal(customizeNavigation(selected, 0, { currentSelectionValid: true }).canContinue, true);
  const clay = readFileSync(new URL('../src/components/ui/clay.tsx', import.meta.url), 'utf8');
  assert.match(clay, /accessibilityState=\{\{ disabled: Boolean\(disabled\) \}\}/);
  assert.match(clay, /disabled \? styles\.buttonDisabled : elevation\.raised/);
});
