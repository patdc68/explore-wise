import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { alternativesTitle } from '../src/services/customize-ui.ts';
import { buildStages, selectStop } from '../src/services/itinerary.ts';

const place = (id: string, priced = true) => ({ place_id: id, name: id, latitude: 14.55, longitude: 121.05, category_name: 'Restaurant', category_code: 'food.restaurant', has_price: priced, estimated_group_min_minor: priced ? 40000 : null, estimated_group_max_minor: priced ? 40000 : null, budget_status: priced ? 'fits' : 'unknown' } as any);

test('alternatives use human stage titles and selection preserves every other selected stop', () => {
  const stages = buildStages(['food_talk', 'activity_fun']);
  assert.equal(alternativesTitle(stages[0]), 'More dinner options');
  assert.equal(alternativesTitle(stages[1]), 'More things to do');
  const initial = { start: { latitude: 14.55, longitude: 121.05, label: 'BGC' }, budgetMinor: 150000, partySize: 2, stages, stops: [] };
  const withBoth = selectStop(selectStop(initial, stages[0].id, place('Dinner')), stages[1].id, place('Cinema'));
  const changedFood = selectStop(withBoth, stages[0].id, place('Unknown-price dinner', false));
  assert.deepEqual(changedFood.stops.map((stop) => stop.place.place_id), ['Unknown-price dinner', 'Cinema']);
  assert.equal(changedFood.stops[0]?.place.has_price, false);
});

test('View more is a pushed, vertical, paged alternatives route rather than a ninth place', () => {
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const alternatives = readFileSync(new URL('../src/app/plan/alternatives.tsx', import.meta.url), 'utf8');
  assert.match(plan, /kind: 'more'/);
  assert.match(plan, /router\.push\('\/plan\/alternatives'/);
  assert.match(plan, /hasMoreOptions=\{candidatePool\.length > shortlist\.length\}/);
  assert.match(plan, /accessibilityLabel="View more options"/);
  assert.match(alternatives, /<FlatList/);
  assert.doesNotMatch(alternatives, /<FlatList[^>]*horizontal[^>]*data=\{visible\}/);
  assert.match(alternatives, /onEndReached=\{loadMore\}/);
  assert.match(alternatives, /PriceSummary place=\{place\}/);
  assert.match(alternatives, /accessibilityLabel=\{`Select \$\{place\.name\}`\}/);
  assert.match(alternatives, /Broader alternative/);
  assert.match(alternatives, /broaderCandidateIds/);
});

test('an outside-shortlist selection is retained, selected, and snapped in the same Customize stage', () => {
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  assert.match(plan, /current\.some\(\(item\) => item\.place_id === place\.place_id\) \? current : \[place, \.\.\.current\]/);
  assert.match(plan, /shortlistWithSelectedCandidate/);
  assert.match(plan, /onContentSizeChange=\{snapToSelected\}/);
  assert.match(plan, /scrollToIndex\(\{ animated: true, index: selectedIndex, viewPosition: 0 \}\)/);
  assert.match(plan, /Selected<\/ThemedText>/);
  assert.match(plan, /select: \(place\) => \{ updateStop\(place\); router\.back\(\); \}/);
});
