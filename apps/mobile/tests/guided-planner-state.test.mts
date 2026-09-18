import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizePlannerDraft, validatePlannerDraft } from '../../../packages/planning/src/draft.ts';
import { validatePlanningIntent, type Occasion } from '../../../packages/planning/src/intent.ts';
import { addPlannerAnchor, budgetSummary, completePlannerPreview, createPlannerSession, editPlannerQuestion, nextPlannerQuestion, parseBudgetInput, plannerAdvanceDelay, plannerLocation, plannerProgress, plannerQuestions, plannerScreenReady, previousPlannerQuestion, questionReady, removePlannerAnchor, replacePlannerAnchor, setPlannerAnswer, skipPlannerQuestion, validatePlannerPreview } from '../src/services/guided-planner.ts';

const location = plannerLocation({ label: 'TEST AREA', coordinates: { latitude: 0, longitude: 0 }, source: 'location-search' });
const anchor1 = '11111111-1111-4111-8111-111111111111';
const anchor2 = '22222222-2222-4222-8222-222222222222';
function essentials(occasion: Occasion) {
  let s = setPlannerAnswer(createPlannerSession(), 'occasion', occasion);
  s = setPlannerAnswer(s, 'location', location);
  if (!s.draft.answers.party) s = setPlannerAnswer(s, 'party', { size: 4, children: occasion === 'family' ? { state: 'none' } : null });
  s = setPlannerAnswer(s, 'budget', { amountMinor: 300000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' });
  s = setPlannerAnswer(s, 'schedule', { kind: 'duration', durationMinutes: 150, outingDate: null, startTime: null, timeZone: null });
  for (const field of ['moods', 'food', 'activities', 'mobility'] as const) s = setPlannerAnswer(s, field, { state: 'no_preference' });
  return s;
}
for (const occasion of ['date', 'friends', 'family', 'solo'] as const) {
  test(`${occasion}: complete canonical answers reach local preview`, () => {
    const s = essentials(occasion);
    assert.equal(validatePlannerPreview(s.draft).success, true);
    const complete = completePlannerPreview(s);
    assert.equal(complete.screen, 'complete');
    assert.equal(validatePlanningIntent(complete.preview).success, true);
    assert.deepEqual(complete.preview?.anchors, []);
    assert.equal(finalizePlannerDraft(s.draft).success, true);
  });
}
test('Family with children reveals age bands; none/skipped hides them and drops age data', () => {
  let s = essentials('family');
  s = setPlannerAnswer(s, 'party', { size: 4, children: { state: 'present', count: 2, ageBands: { state: 'selected', values: ['3_to_5', '6_to_12'] } } });
  assert.ok(plannerQuestions(s.draft).some((q) => q.id === 'child_age_bands'));
  assert.equal(validatePlannerPreview(s.draft).success, true);
  s = setPlannerAnswer(s, 'party', { size: 4, children: { state: 'none' } });
  assert.ok(!plannerQuestions(s.draft).some((q) => q.id === 'child_age_bands'));
  assert.deepEqual(s.draft.answers.party?.children, { state: 'none' });
  s = skipPlannerQuestion(editPlannerQuestion(s, 'children'));
  assert.deepEqual(s.draft.answers.party?.children, { state: 'skipped' });
});
test('Family → Solo clears dependents, forces size 1, preserves unrelated answers and anchors', () => {
  let s = addPlannerAnchor(essentials('family'), anchor1);
  s = setPlannerAnswer(s, 'party', { size: 5, children: { state: 'present', count: 2, ageBands: { state: 'selected', values: ['under_3'] } } });
  const budget = s.draft.answers.budget;
  s = setPlannerAnswer(s, 'occasion', 'solo');
  assert.deepEqual(s.draft.answers.party, { size: 1, children: null });
  assert.deepEqual(s.draft.answers.budget, budget);
  assert.equal(s.draft.answers.anchors?.length, 1);
  assert.ok(!plannerQuestions(s.draft).some((q) => ['party', 'children', 'child_age_bands'].includes(q.id)));
  s = setPlannerAnswer(s, 'occasion', 'family');
  assert.equal(s.draft.answers.party, undefined);
  assert.equal(validatePlannerDraft(s.draft).success, true);
  assert.equal(validatePlannerPreview(s.draft).success, false);
});
test('back and review editing keep unrelated answers; new children branch is visited', () => {
  let s = essentials('family');
  s = editPlannerQuestion(s, 'budget');
  const before = s.draft.answers;
  s = previousPlannerQuestion(s);
  assert.equal(s.screen, 'review');
  assert.deepEqual(s.draft.answers, before);
  s = editPlannerQuestion(s, 'children');
  s = setPlannerAnswer(s, 'party', { size: 4, children: { state: 'present', count: 1, ageBands: { state: 'unanswered' } } });
  s = nextPlannerQuestion(s);
  assert.equal(s.screen, 'child_age_bands');
  s = skipPlannerQuestion(s);
  assert.equal(s.screen, 'review');
  assert.deepEqual(s.draft.answers.food, before.food);
  s = previousPlannerQuestion(s);
  assert.equal(s.screen, 'mobility');
});
test('custom money uses exact minor units, total/per-person are explicit, zero is valid', () => {
  assert.equal(parseBudgetInput('1234.56'), 123456);
  assert.equal(parseBudgetInput('0'), 0);
  for (const invalid of ['', '-5', '1e3', '1.234', 'Infinity', '9007199254740991']) assert.ok(Number.isNaN(parseBudgetInput(invalid)));
  let s = essentials('date');
  assert.match(budgetSummary(s.draft), /₱3,000 total\nfor 2 people/);
  s = setPlannerAnswer(s, 'budget', { ...s.draft.answers.budget!, basis: 'per_person' });
  assert.match(budgetSummary(s.draft), /₱3,000 per person\nfor 2 people · ₱6,000 total/);
  assert.equal(completePlannerPreview(s).preview?.budget.amountMinor, 300000);
});
test('no preference, surprise and skip remain distinct and do not mix with selected values', () => {
  let s = essentials('date');
  s = setPlannerAnswer(s, 'moods', { state: 'selected', values: ['romantic'] });
  s = setPlannerAnswer(s, 'moods', { state: 'surprise_me' });
  s = setPlannerAnswer(s, 'food', { state: 'no_preference' });
  s = skipPlannerQuestion(editPlannerQuestion(s, 'activities'));
  const result = completePlannerPreview(s).preview!;
  assert.deepEqual(result.moods, { state: 'surprise_me' });
  assert.deepEqual(result.food, { state: 'no_preference' });
  assert.deepEqual(result.activities, { state: 'skipped' });
});
test('multiple catalog anchors add/remove without fake compatibility reviews', () => {
  let s = addPlannerAnchor(addPlannerAnchor(essentials('date'), anchor1), anchor2);
  s = addPlannerAnchor(s, anchor1);
  assert.equal(s.draft.answers.anchors?.length, 2);
  assert.equal(validatePlannerPreview(s.draft).success, true);
  assert.equal(finalizePlannerDraft(s.draft).success, false, 'real generation remains gated');
  assert.deepEqual(s.draft.anchorReviews, []);
  s = removePlannerAnchor(s, anchor1);
  assert.deepEqual(completePlannerPreview(s).preview?.anchors.map((a) => a.placeId), [anchor2]);
  s = addPlannerAnchor(s, 'google-place-id');
  assert.equal(validatePlannerPreview(s.draft).success, false);
});
test('incomplete, invalid budget, missing coordinates and invalid schedules cannot complete', () => {
  const empty = createPlannerSession();
  assert.equal(completePlannerPreview(empty), empty);
  assert.equal(nextPlannerQuestion(empty), empty);
  const s = essentials('date');
  for (const broken of [
    setPlannerAnswer(s, 'budget', { ...s.draft.answers.budget!, amountMinor: NaN }),
    setPlannerAnswer(s, 'location', { ...location, coordinates: { latitude: NaN, longitude: 0 } }),
    setPlannerAnswer(s, 'schedule', { kind: 'window', outingDate: '2026-02-30', startTime: '18:00', endTime: '01:00', endDayOffset: 0, timeZone: 'Asia/Manila' }),
  ]) assert.equal(completePlannerPreview(broken), broken);
});
test('party reduction can reach child-count correction; final preview stays blocked until corrected', () => {
  let s = essentials('family');
  s = setPlannerAnswer(s, 'party', { size: 2, children: { state: 'present', count: 3, ageBands: { state: 'skipped' } } });
  assert.equal(questionReady(s.draft, 'party'), true);
  assert.equal(validatePlannerPreview(s.draft).success, false);
  s = nextPlannerQuestion(editPlannerQuestion(s, 'party'));
  assert.equal(s.screen, 'children');
});

test('grouped progress stays truthful across dynamic Family and Solo branches', () => {
  let family = essentials('family');
  family = setPlannerAnswer(family, 'party', { size: 4, children: { state: 'present', count: 2, ageBands: { state: 'unanswered' } } });
  const solo = essentials('solo');
  assert.deepEqual(plannerProgress(family.draft, 'child_age_bands'), { phase: 'Basics', phaseIndex: 1, phaseCount: 5, completion: 5 / (plannerQuestions(family.draft).length + 1) });
  assert.equal(plannerProgress(family.draft, 'budget').phase, 'Budget & time');
  assert.equal(plannerProgress(family.draft, 'food').phase, 'Preferences');
  assert.equal(plannerProgress(solo.draft, 'budget').phase, 'Budget & time');
  assert.equal(plannerProgress(solo.draft, 'review').phase, 'Review');
  assert.equal(plannerProgress(solo.draft, 'complete').completion, 1);
  assert.notEqual(plannerQuestions(family.draft).length, plannerQuestions(solo.draft).length);
});

test('single-choice advance policy and combined preferences keep reduced motion accessible', () => {
  assert.equal(plannerAdvanceDelay(true), 0);
  assert.equal(plannerAdvanceDelay(false), 140);
  let s = essentials('date');
  s = editPlannerQuestion(s, 'food');
  s = setPlannerAnswer(s, 'food', { state: 'unanswered' });
  s = setPlannerAnswer(s, 'activities', { state: 'unanswered' });
  s = setPlannerAnswer(s, 'food', { state: 'selected', values: ['cafe'] });
  assert.equal(plannerScreenReady(s.draft, 'food'), false);
  s = setPlannerAnswer(s, 'activities', { state: 'surprise_me' });
  assert.equal(plannerScreenReady(s.draft, 'food'), true);
  s = nextPlannerQuestion(s);
  assert.equal(s.screen, 'review');
  assert.deepEqual(s.draft.answers.food, { state: 'selected', values: ['cafe'] });
  assert.deepEqual(s.draft.answers.activities, { state: 'surprise_me' });
});

test('combined preference skip keeps food and activities distinct', () => {
  const skipped = skipPlannerQuestion(editPlannerQuestion(essentials('date'), 'food'));
  assert.deepEqual(skipped.draft.answers.food, { state: 'skipped' });
  assert.deepEqual(skipped.draft.answers.activities, { state: 'skipped' });
  assert.equal(validatePlannerPreview(skipped.draft).success, true);
});

test('anchor change keeps catalog UUID identity and selected state', () => {
  let s = addPlannerAnchor(essentials('date'), anchor1);
  s = replacePlannerAnchor(s, anchor1, anchor2);
  assert.deepEqual(s.draft.answers.anchors?.map((anchor) => anchor.placeId), [anchor2]);
  s = removePlannerAnchor(s, anchor2);
  assert.deepEqual(s.draft.answers.anchors, []);
});
