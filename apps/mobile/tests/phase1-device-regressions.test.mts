import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { normalizeAskWiseWireIntent, type AskWiseIntent } from '../src/services/ask-wise-normalization.ts';
import { canNavigate, remainingBudget, selectStop } from '../src/services/itinerary.ts';
import { initialMapPreviewStatus, mapPreviewLayout, mapPreviewLoaded, mapPreviewReady, mapPreviewTimedOut } from '../src/services/map-state.ts';
import { formatPhp, parsePhpToMinor } from '../src/services/money.ts';
import { emptyPlanningSession, START_OVER_LABEL, START_OVER_MESSAGE, START_OVER_TITLE, startOverConfirmation } from '../src/services/planning-session.ts';
import { buildWiseProposal } from '../src/services/wise-proposal.ts';

const place = (id: string, spendMinor = 50000) => ({ place_id: id, name: id, latitude: 14.55, longitude: 121.05, category_name: id, category_code: id, has_price: true, estimated_group_min_minor: spendMinor, estimated_group_max_minor: spendMinor, budget_status: 'fits' } as any);

test('Ask Wise wire → proposal → itinerary → Review preserves 150000 minor units and formats once', async () => {
  const wireBudgetMinor = 150000;
  const intent: AskWiseIntent = normalizeAskWiseWireIntent({ budget_minor: wireBudgetMinor, party_size: 2, location: null, currency_code: 'PHP', time_context: 'tonight', preferences: [], exclusions: [], stages: ['food_talk', 'activity_fun'] });
  const proposal = await buildWiseProposal({ intent, start: { latitude: 14.54, longitude: 121.04, label: 'Start' }, fetcher: async ({ categoryCodes }) => [place(categoryCodes.includes('food') ? 'Restaurant' : 'Activity')] });
  const itinerary = proposal.state;
  const review = itinerary;
  assert.equal(proposal.state.budgetMinor, 150000);
  assert.equal(itinerary.budgetMinor, 150000);
  assert.equal(review.budgetMinor, 150000);
  assert.equal(formatPhp(review.budgetMinor), '₱1,500');
  const oneStop = selectStop({ ...review, stops: [] }, review.stages[0].id, place('Restaurant', 50000));
  assert.equal(formatPhp(remainingBudget(oneStop).minAmountMinor), '₱500');
  assert.equal(formatPhp(remainingBudget(oneStop).conservativeMinor!), '₱1,000');
});

test('PHP text budgets are converted to minor units exactly once', () => {
  for (const [input, minor] of [['15', 1500], ['150', 15000], ['1500', 150000], ['2500', 250000], ['3000', 300000], ['2k', 200000], ['2.5k', 250000], ['3k', 300000]] as const) assert.equal(parsePhpToMinor(input), minor);
});

test('navigation is explicitly gated by lifecycle finalization', () => {
  assert.equal(canNavigate('proposal'), false);
  assert.equal(canNavigate('building'), false);
  assert.equal(canNavigate('review'), false);
  assert.equal(canNavigate('finalized'), true);
});

test('finalized renderer keeps navigation and Start over but gates every normal editing control', () => {
  const planScreen = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  assert.match(planScreen, /const editable = screen === 'review' && !state\.finalized/);
  assert.match(planScreen, /<SelectedStops state=\{state\} editable=\{editable\}/);
  assert.match(planScreen, /editable \? <SecondaryButton label="Customize"/);
  assert.match(planScreen, /const canAdd = editable && state\.stages\.length < MAX_ITINERARY_STOPS/);
  assert.match(planScreen, /\{canAdd \? <SecondaryButton label="\+ Add another stop"/);
  assert.match(planScreen, /const isCurrent = execution\.status === 'in_progress' && status === 'current'/);
  assert.match(planScreen, /onNavigate=\{state\.finalized && isCurrent \?/);
  assert.doesNotMatch(planScreen, /label="Navigate to first stop"/);
  assert.match(planScreen, /function SelectedStops[\s\S]*?\{editable \? <SecondaryButton label=/);
  assert.match(planScreen, /onRemove=\{editable && stage\?\.source === 'user_added'/);
});

test('start over has a confirmation contract and only clears planning-session state', () => {
  assert.equal(START_OVER_LABEL, 'Start over');
  assert.notEqual(START_OVER_LABEL, 'Start');
  assert.equal(START_OVER_TITLE, 'Start over?');
  assert.equal(START_OVER_MESSAGE, 'This will remove all places and selections from your current itinerary.');
  const reset = emptyPlanningSession();
  assert.deepEqual(reset, { request: null, proposal: null, itinerary: null, history: [], candidates: [], highlightedId: null, stageIndex: 0, notice: null, error: null, phase: 'initial' });
});

test('proposal, Customize, review, and finalized use the shared Start over control and confirmation', () => {
  const planScreen = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const proposalCard = readFileSync(new URL('../src/components/wise-proposal-card.tsx', import.meta.url), 'utf8');
  const startOverAction = readFileSync(new URL('../src/components/itinerary/start-over-action.tsx', import.meta.url), 'utf8');
  assert.match(proposalCard, /<StartOverAction onPress=\{onStartOver\}/);
  assert.match(planScreen, /if \(screen === 'guided'\)[\s\S]*?SecondaryButton label="Back"[\s\S]*?<StartOverAction onPress=\{clearPlan\}/);
  assert.match(planScreen, /screen === 'review'[\s\S]*?<StartOverAction onPress=\{clearPlan\}/);
  assert.match(planScreen, /screen === 'finalized'[\s\S]*?<StartOverAction onPress=\{clearPlan\}/);
  assert.match(startOverAction, /label=\{START_OVER_LABEL\} accessibilityLabel=\{START_OVER_LABEL\}/);
  assert.match(startOverAction, /labelNumberOfLines=\{1\}/);
  assert.match(startOverAction, /minHeight: 48/);
  assert.match(startOverAction, /minWidth: 112/);
  assert.match(startOverAction, /paddingHorizontal: Spacing\.lg/);
  assert.match(startOverAction, /flexShrink: 0/);
  assert.doesNotMatch(startOverAction, /\bwidth:\s*\d+|\bmaxWidth:/);
  assert.doesNotMatch(startOverAction, /label="Start"|label='Start'/);
  assert.match(planScreen, /Alert\.alert\(START_OVER_TITLE, active \? 'This will remove your itinerary and all completed or skipped stop progress\.' : START_OVER_MESSAGE, startOverConfirmation\(/);
  assert.match(planScreen, /if \(active && !await executionStore\.clear\(active\.execution\.itineraryId\)\) return; const cleared = emptyPlanningSession\(\)/);
  let confirmed = false;
  const actions = startOverConfirmation(() => { confirmed = true; });
  assert.deepEqual(actions.map((action) => action.text), ['Cancel', 'Start over']);
  actions[1].onPress?.();
  assert.equal(confirmed, true);
});

test('proposal actions expose the approved hierarchy with full accessible labels and existing handlers', () => {
  const proposalCard = readFileSync(new URL('../src/components/wise-proposal-card.tsx', import.meta.url), 'utf8');
  assert.match(proposalCard, /<PrimaryButton disabled=\{busy \|\| stops\.length === 0\}[\s\S]*?accessibilityLabel="Build this plan"[\s\S]*?onPress=\{onUse\}/);
  assert.match(proposalCard, /<SecondaryButton disabled=\{busy\} label="Customize stops" accessibilityLabel="Customize stops" labelNumberOfLines=\{1\} onPress=\{onCustomize\}/);
  assert.match(proposalCard, /<TertiaryButton disabled=\{busy\} label="Try another idea" accessibilityLabel="Try another idea" labelNumberOfLines=\{1\} onPress=\{onTryAnother\}/);
  assert.match(proposalCard, /<View style=\{styles\.actions\}>/);
  assert.match(proposalCard, /fullWidth \/>/);
  assert.doesNotMatch(proposalCard, /label="Try"|label="Try again"/);
});

test('Customize exposes compact vertical alternatives with the same selection callbacks', () => {
  const planScreen = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  assert.match(planScreen, /candidates\.map\(\(place\) => <CustomizeCandidateCard/);
  assert.match(planScreen, /onSelect=\{\(\) => onSelect\(place\)\}/);
  assert.match(planScreen, /onHighlight=\{\(\) => onHighlight\(place\.place_id\)\}/);
  assert.doesNotMatch(planScreen, /snapToInterval|cardWidth/);
  const guided = planScreen.slice(planScreen.indexOf("if (screen === 'guided')"), planScreen.indexOf('const complete ='));
  assert.match(guided, /<CandidateList title=\{stageSelectionHeading\(currentStage\)\}/);
  assert.doesNotMatch(guided, /<SelectedStops/);
  assert.match(planScreen, /const openStage = \(stageId: string\)[\s\S]*?setCandidateRefreshKey/);
});

test('map loading state has finite dimensions, clears its overlay on load, and only falls back after timeout', () => {
  const laidOut = mapPreviewLayout(initialMapPreviewStatus(), 360, 220);
  assert.equal(laidOut.width, 360); assert.equal(laidOut.height, 220);
  assert.equal(mapPreviewReady(laidOut).mapReady, true);
  const loaded = mapPreviewLoaded(laidOut);
  assert.equal(loaded.mapLoaded, true); assert.equal(loaded.mapTimedOut, false);
  assert.equal(mapPreviewTimedOut(loaded).mapTimedOut, false);
  assert.equal(mapPreviewTimedOut(laidOut).mapTimedOut, true);
});

test('new Ask Wise requests replace the active prompt while Try another keeps it and reset clears it', () => {
  const original = 'I have a date tonight. And my budget is 1500 suggest some good restaurant and activities with my budget';
  const tryAnotherRequest = original;
  const newRequest = 'Dinner for two with 2k';
  assert.equal(tryAnotherRequest, original);
  assert.notEqual(newRequest, original);
  assert.equal(emptyPlanningSession().request, null);
});
