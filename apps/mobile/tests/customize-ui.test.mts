import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { customizeNavigation, originSuggestionLabel, stageSelectionHeading } from '../src/services/customize-ui.ts';
import { addUserStage, buildStages, selectStop, type ItineraryState } from '../src/services/itinerary.ts';
import { START_OVER_LABEL, START_OVER_MESSAGE, START_OVER_TITLE, startOverConfirmation } from '../src/services/planning-session.ts';

const place = (id: string) => ({ place_id: id, name: id, latitude: 14.8, longitude: 120.9, category_name: 'Restaurant', category_code: 'food.restaurant', has_price: true, estimated_group_min_minor: 30000, estimated_group_max_minor: 30000, budget_status: 'fits' } as any);

test('Customize recording state renders Start over beside Back and uses the shared confirmation', () => {
  const stages = buildStages(['food_talk', 'activity_fun']);
  const selectedFirst = selectStop({ start: { latitude: 14.8, longitude: 120.9, label: 'Meycauayan' }, budgetMinor: 150000, partySize: 2, stages, stops: [] }, stages[0].id, place('Dinner'));
  const navigation = customizeNavigation(selectedFirst, 1);
  assert.equal(START_OVER_LABEL, 'Start over');
  assert.notEqual(START_OVER_LABEL, 'Start');
  assert.equal(navigation.backDisabled, false);
  assert.equal(navigation.primaryLabel, 'Select a place');
  assert.equal(navigation.canContinue, false);
  assert.equal(START_OVER_TITLE, 'Start over?');
  assert.equal(START_OVER_MESSAGE, 'This will remove all places and selections from your current itinerary.');
  assert.deepEqual(startOverConfirmation(() => {}).map((action) => action.text), ['Cancel', 'Start over']);
});

test('Customize copy is resolved from the actual stage and origin, never raw template syntax', () => {
  const stages = buildStages(['food_talk', 'cafe', 'activity_fun', 'discovery']);
  const rendered = [stageSelectionHeading(stages[0]), stageSelectionHeading(stages[1]), stageSelectionHeading(stages[2]), stageSelectionHeading(stages[3]), originSuggestionLabel({ label: 'Meycauayan' })].join('\n');
  assert.match(rendered, /Choose a dinner spot/);
  assert.match(rendered, /Choose a café/);
  assert.match(rendered, /Choose something fun/);
  assert.match(rendered, /Choose an attraction|Choose something fun/);
  assert.match(rendered, /Suggestions near Meycauayan/);
  assert.doesNotMatch(rendered, /\$\{/);
  assert.equal(originSuggestionLabel(null), null);
  assert.equal(originSuggestionLabel({ label: '   ' }), null);
});

test('manual stages use their selected category copy and are never presented as Wise suggestions', () => {
  const base: ItineraryState = { start: { latitude: 14.8, longitude: 120.9, label: 'Meycauayan' }, budgetMinor: 150000, partySize: 2, stages: buildStages(['food_talk', 'activity_fun']), stops: [] };
  const entertainment = addUserStage(base, 'entertainment').stages.at(-1)!;
  const dessert = addUserStage(base, 'dessert').stages.at(-1)!;
  const attraction = addUserStage(base, 'attraction').stages.at(-1)!;
  assert.equal(entertainment.title, 'Entertainment');
  assert.equal(entertainment.source, 'user_added');
  assert.equal(stageSelectionHeading(entertainment), 'Choose an entertainment option');
  assert.equal(stageSelectionHeading(dessert), 'Choose a dessert spot');
  assert.equal(stageSelectionHeading(attraction), 'Choose an attraction');
  assert.notEqual(stageSelectionHeading(entertainment), 'Choose something fun');
});

test('Customize navigation keeps one active stage, supports Back, and gates review on required selections', () => {
  const stages = buildStages(['food_talk', 'activity_fun']);
  const initial: ItineraryState = { start: { latitude: 14.8, longitude: 120.9, label: 'Meycauayan' }, budgetMinor: 150000, partySize: 2, stages, stops: [] };
  assert.deepEqual(customizeNavigation(initial, 0), { backDisabled: true, canContinue: false, primaryLabel: 'Select a place', review: false });
  const foodSelected = selectStop(initial, stages[0].id, place('Dinner'));
  assert.deepEqual(customizeNavigation(foodSelected, 0), { backDisabled: true, canContinue: true, primaryLabel: 'Next', review: false });
  assert.deepEqual(customizeNavigation(foodSelected, 1), { backDisabled: false, canContinue: false, primaryLabel: 'Select a place', review: true });
  const completed = selectStop(foodSelected, stages[1].id, place('Activity'));
  assert.deepEqual(customizeNavigation(completed, 1), { backDisabled: false, canContinue: true, primaryLabel: 'Review your plan', review: true });
});

test('Customize renders one responsive horizontal candidate carousel without guided Replace cards', () => {
  const planScreen = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const guided = planScreen.slice(planScreen.indexOf("if (screen === 'guided')"), planScreen.indexOf("const complete ="));
  assert.match(guided, /<CandidateList title=\{stageSelectionHeading\(currentStage\)\}/);
  assert.match(guided, /<StartOverAction onPress=\{clearPlan\}/);
  assert.doesNotMatch(guided, /<SelectedStops/);
  assert.doesNotMatch(guided, /Replace \$\{/);
  assert.match(planScreen, /<FlatList[^>]*horizontal/);
  assert.match(planScreen, /showsHorizontalScrollIndicator=\{false\}/);
  assert.match(planScreen, /decelerationRate="fast"/);
  assert.match(planScreen, /snapToInterval=\{snapInterval\}/);
  assert.match(planScreen, /width - Spacing\.md \* 2\) \* 0\.86/);
  assert.match(planScreen, /\{focusedIndex \+ 1\} of \{candidates\.length\}/);
});
