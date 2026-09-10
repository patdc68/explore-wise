import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichWiseIntent, foodFocusFor, type AskWiseIntent } from '../src/services/ask-wise-normalization.ts';
import { activityCategoryCodes, buildStages } from '../src/services/itinerary.ts';
import { buildWiseProposal } from '../src/services/wise-proposal.ts';

test('a canonical Ask Wise intent creates the existing Guided Itinerary stages', () => {
  const intent: AskWiseIntent = { location: 'BGC', partySize: 4, budgetMinor: 300000, currencyCode: 'PHP', timeContext: 'tonight', preferences: ['conversation-friendly', 'fun'], exclusions: ['bar'], stages: ['food_talk', 'activity_fun'], inferredStages: [], activityFocus: null, explicitQuickService: false };
  assert.deepEqual(buildStages(intent.stages).map((stage) => stage.id), ['food_talk-1', 'activity_fun-2']);
});
test('a Wise proposal is built from deterministic place records and Try another does not parse intent again', async () => {
  const intent: AskWiseIntent = { location: 'BGC', partySize: 2, budgetMinor: 150000, currencyCode: 'PHP', timeContext: 'tonight', preferences: [], exclusions: [], stages: ['food_talk', 'activity_fun'], inferredStages: [], activityFocus: null, explicitQuickService: false };
  const places = (prefix: string, latitude: number) => [{ place_id: `${prefix}-A`, name: `${prefix} A`, latitude, longitude: 121, category_name: prefix, category_code: prefix, has_price: true, estimated_group_min_minor: 50000, estimated_group_max_minor: 50000, budget_status: 'fits' }, { place_id: `${prefix}-B`, name: `${prefix} B`, latitude: latitude + .01, longitude: 121.01, category_name: prefix, category_code: prefix, has_price: true, estimated_group_min_minor: 50000, estimated_group_max_minor: 50000, budget_status: 'fits' }] as any;
  let fetches = 0; const fetcher = async ({ categoryCodes }: any) => { fetches++; return categoryCodes.includes('food') ? places('Restaurant',14.5) : places('Activity',14.6); };
  const first = await buildWiseProposal({ intent, start: { latitude: 14.4, longitude: 121, label: 'BGC' }, fetcher });
  const second = await buildWiseProposal({ intent, start: first.state.start, fetcher, excludedCombinations: first.historyKey.split('|') });
  assert.equal(first.state.budgetMinor, 150000); assert.equal(first.state.stops.length, 2); assert.notEqual(second.historyKey, first.historyKey); assert.equal(fetches, 4);
});

const bareIntent = (): AskWiseIntent => ({ location: null, partySize: null, budgetMinor: null, currencyCode: 'PHP', timeContext: 'tonight', preferences: [], exclusions: [], stages: [], inferredStages: [], activityFocus: null, explicitQuickService: false });
const stageTypes = (prompt: string) => enrichWiseIntent(bareIntent(), prompt);

test('deterministic stage enrichment adds one lightweight complementary stage', () => {
  for (const prompt of ['I have 1500 budget tonight', 'Date tonight, 2500']) {
    const intent = stageTypes(prompt);
    assert.deepEqual(intent.stages, ['food_talk', 'activity_fun']);
    assert.deepEqual(intent.inferredStages, []);
  }
  const food = stageTypes('Suggest a restaurant with 1500');
  assert.deepEqual(food.stages, ['food_talk', 'activity_fun']);
  assert.deepEqual(food.inferredStages, ['activity_fun']);
  const activity = stageTypes('Suggest an activity tonight');
  assert.deepEqual(activity.stages, ['activity_fun', 'food_talk']);
  assert.deepEqual(activity.inferredStages, ['food_talk']);
});

test('explicit order is preserved and only or just prevents stage enrichment', () => {
  assert.deepEqual(stageTypes('I want bowling then dinner').stages, ['activity_fun', 'food_talk']);
  assert.deepEqual(stageTypes('Dinner after bowling').stages, ['activity_fun', 'food_talk']);
  assert.deepEqual(stageTypes('Coffee then something fun').stages, ['cafe', 'activity_fun']);
  assert.deepEqual(stageTypes('kain muna tapos gala').stages, ['food_talk', 'activity_fun']);
  assert.deepEqual(stageTypes('gala muna tapos kain').stages, ['activity_fun', 'food_talk']);
  assert.deepEqual(stageTypes('Just a restaurant under 1000').stages, ['food_talk']);
  assert.deepEqual(stageTypes('I only want an activity').stages, ['activity_fun']);
  assert.deepEqual(stageTypes('Kain lang').stages, ['food_talk']);
});

test('explicit activity wording narrows its retrieval family while something fun stays broad', () => {
  assert.deepEqual(activityCategoryCodes(stageTypes('bowling after dinner').activityFocus), ['activity.recreation']);
  assert.deepEqual(activityCategoryCodes(stageTypes('movie after dinner').activityFocus), ['entertainment.cinema', 'entertainment']);
  assert.deepEqual(activityCategoryCodes(stageTypes('museum after dinner').activityFocus), ['attraction.museum', 'attraction.culture', 'attraction']);
  assert.deepEqual(activityCategoryCodes(stageTypes('park after dinner').activityFocus), ['outdoor.park', 'outdoor']);
  assert.ok(activityCategoryCodes(stageTypes('something fun after dinner').activityFocus).includes('entertainment.cinema'));
});

test('explicit food wording supplies deterministic restaurant, cafe, and dessert ranking intent', () => {
  assert.equal(foodFocusFor('good restaurant for dinner'), 'restaurant');
  assert.equal(foodFocusFor('coffee date tonight'), 'cafe');
  assert.equal(foodFocusFor('ice cream and cake'), 'dessert');
  assert.equal(foodFocusFor('Four friends in BGC tonight'), null);
});

test('no-budget generic outings do not forward a fallback display budget into place ranking', async () => {
  const intent = stageTypes('Four friends in BGC tonight');
  const forwardedBudgets: Array<number | null> = [];
  await buildWiseProposal({ intent, start: { latitude: 14.55, longitude: 121.05, label: 'BGC' }, fetcher: async ({ categoryCodes, budgetMinor }) => {
    forwardedBudgets.push(budgetMinor);
    return [{ place_id: categoryCodes[0]!, name: categoryCodes[0]!, latitude: 14.55, longitude: 121.05, category_code: categoryCodes[0]!, category_name: categoryCodes[0]!, has_price: false, estimated_group_min_minor: null, estimated_group_max_minor: null, budget_status: 'unknown' }] as any;
  } });
  assert.deepEqual(forwardedBudgets, [null, null]);
});
