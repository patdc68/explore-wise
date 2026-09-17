import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlanningIntent, type PlanningIntent, type Occasion } from '../src/intent.ts';
import { answerQuestion, anchorReviewState, createPlannerDraft, finalizePlannerDraft, navigateDraft, recordAnchorReview, resumePlannerDraft, validatePlannerDraft, type PlannerDraft } from '../src/draft.ts';
import { OCCASION_QUESTIONS, questionsForDraft } from '../src/questions.ts';

// Synthetic identities/coordinates; not factual venue fixtures.
const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
function intent(occasion: Occasion = 'date'): PlanningIntent {
  return {
    planningIntentVersion: 1, occasion,
    location: { source: 'selected_area', label: 'Test area', coordinates: { latitude: 0, longitude: 0 }, context: { locality: null, city: null, region: null, countryCode: null }, geography: { kind: 'radius', radiusMeters: 5000 } },
    party: { size: occasion === 'solo' ? 1 : 2, children: occasion === 'family' ? { state: 'unanswered' } : null },
    budget: { amountMinor: 100000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
    schedule: { kind: 'duration', durationMinutes: 180, outingDate: null, startTime: null, timeZone: null },
    moods: { state: 'unanswered' }, food: { state: 'no_preference' }, activities: { state: 'surprise_me' }, mobility: { state: 'skipped' },
    anchors: [], constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
  };
}
const draft = (value = intent()): PlannerDraft => ({ ...createPlannerDraft(), answers: value });
for (const occasion of ['date', 'friends', 'family', 'solo'] as const) {
  test(`valid ${occasion} intent and finalized draft`, () => {
    assert.equal(validatePlanningIntent(intent(occasion)).success, true);
    assert.equal(finalizePlannerDraft(draft(intent(occasion))).success, true);
  });
}
test('family children count and age metadata remain factual', () => {
  const value = { ...intent('family'), party: { size: 3, children: { state: 'present', count: 1, ageBands: { state: 'selected', values: ['6_to_12'] } } } };
  assert.equal(validatePlanningIntent(value).success, true);
  assert.equal(validatePlanningIntent({ ...value, party: { ...value.party, size: 0 } }).success, false);
  assert.equal(validatePlanningIntent({ ...value, party: { size: 1, children: { ...value.party.children, count: 2 } } }).success, false);
  assert.equal(validatePlanningIntent({ ...value, party: { ...value.party, children: { ...value.party.children, ageBands: { state: 'surprise_me' } } } }).success, false);
});
for (const basis of ['total', 'per_person'] as const) for (const strictness of ['strict', 'flexible'] as const) {
  test(`${basis} / ${strictness} budget is explicit and preserved`, () => {
    const value = intent();
    const result = validatePlanningIntent({ ...value, budget: { ...value.budget, basis, strictness } });
    assert.ok(result.success);
    assert.equal(result.data.budget.basis, basis);
    assert.equal(result.data.budget.strictness, strictness);
    assert.equal(result.data.budget.amountMinor, 100000);
  });
}
test('all optional preference states survive without normalization or guessed preferences', () => {
  for (const state of ['unanswered', 'skipped', 'no_preference', 'surprise_me'] as const) {
    const result = validatePlanningIntent({ ...intent(), food: { state } });
    assert.ok(result.success);
    assert.deepEqual(result.data.food, { state });
  }
  assert.equal(validatePlanningIntent({ ...intent(), food: { state: 'selected', values: ['invented'] } }).success, false);
  assert.equal(validatePlanningIntent({ ...intent(), food: { state: 'selected', values: [] } }).success, false);
  assert.equal(validatePlanningIntent({ ...intent(), food: { state: 'surprise_me', values: ['cafe'] } }).success, false);
});
test('partial drafts can resume/backtrack but cannot generate without required fields', () => {
  const initial = createPlannerDraft();
  assert.equal(validatePlannerDraft(JSON.parse(JSON.stringify(initial))).success, true);
  assert.equal(finalizePlannerDraft(initial).success, false);
  const next = navigateDraft(answerQuestion(initial, 'occasion', 'date'), 'location');
  assert.equal(navigateDraft(next, 'occasion').answers.occasion, 'date');
  assert.equal(initial.answers.occasion, undefined);
});
test('family -> solo removes children; returning to family does not revive stale metadata', () => {
  const family = draft({ ...intent('family'), party: { size: 3, children: { state: 'present', count: 1, ageBands: { state: 'skipped' } } } });
  const solo = answerQuestion(family, 'occasion', 'solo');
  assert.equal(solo.answers.party?.children, null);
  assert.deepEqual(answerQuestion(solo, 'occasion', 'family').answers.party?.children, { state: 'unanswered' });
  assert.equal(family.answers.party?.children?.state, 'present');
});
test('one and multiple resolved anchors validate; duplicate and noncatalog identities fail', () => {
  const anchor = { placeId: firstId, intent: 'must_visit', order: { kind: 'any' } };
  assert.equal(validatePlanningIntent({ ...intent(), anchors: [anchor] }).success, true);
  assert.equal(validatePlanningIntent({ ...intent(), anchors: [anchor, { ...anchor, placeId: secondId, intent: 'preferred' }] }).success, true);
  assert.equal(validatePlanningIntent({ ...intent(), anchors: [anchor, anchor] }).success, false);
  assert.equal(validatePlanningIntent({ ...intent(), anchors: [{ ...anchor, placeId: 'Google-or-free-text-name' }] }).success, false);
});
test('location edits retain anchors, require review, and reject stale review results', () => {
  let state = answerQuestion(draft(), 'anchors', [{ placeId: firstId, intent: 'must_visit', order: { kind: 'any' } }]);
  assert.equal(finalizePlannerDraft(state).success, false);
  state = recordAnchorReview(state, state.revision, firstId, 'valid');
  assert.equal(finalizePlannerDraft(state).success, true);
  const previousRevision = state.revision;
  state = answerQuestion(state, 'location', { ...intent().location, coordinates: { latitude: 1, longitude: 1 } });
  assert.equal(state.answers.anchors?.length, 1);
  assert.equal(anchorReviewState(state, firstId), 'needs_revalidation');
  assert.equal(finalizePlannerDraft(recordAnchorReview(state, previousRevision, firstId, 'valid')).success, false);
  assert.equal(finalizePlannerDraft(recordAnchorReview(state, state.revision, firstId, 'incompatible')).success, false);
  assert.equal(finalizePlannerDraft(recordAnchorReview(state, state.revision, firstId, 'valid')).success, true);
});
test('every anchor needs its own review, including preferred anchors', () => {
  const state = answerQuestion(draft(), 'anchors', [firstId, secondId].map((placeId) => ({ placeId, intent: 'preferred', order: { kind: 'any' } })));
  assert.equal(finalizePlannerDraft(recordAnchorReview(state, state.revision, firstId, 'valid')).success, false);
});
test('question branching and suggested defaults do not fabricate user answers', () => {
  assert.deepEqual(questionsForDraft(createPlannerDraft()).map((q) => q.id), ['occasion']);
  assert.equal(OCCASION_QUESTIONS.date.suggestedPartySize, 2);
  for (const occasion of ['date', 'friends', 'solo'] as const) assert.equal(questionsForDraft(draft(intent(occasion))).some((q) => q.id === 'children'), false);
  const family = draft(intent('family'));
  assert.equal(questionsForDraft(family).some((q) => q.id === 'children'), true);
  assert.equal(questionsForDraft(family).some((q) => q.id === 'child_age_bands'), false);
  const withChildren = answerQuestion(family, 'party', { size: 3, children: { state: 'present', count: 1, ageBands: { state: 'unanswered' } } });
  assert.equal(questionsForDraft(withChildren).some((q) => q.id === 'child_age_bands'), true);
});
test('invalid finalized boundary inputs are rejected', () => {
  const base = intent();
  const invalid: unknown[] = [null, {}, { ...base, planningIntentVersion: 2 }, { ...base, planningIntentVersion: undefined }, { ...base, extra: true },
    { ...base, party: { size: 1.5, children: null } }, { ...base, party: { size: 2, children: { state: 'none' } } },
    { ...base, location: { ...base.location, coordinates: { latitude: NaN, longitude: 0 } } },
    { ...base, budget: { ...base.budget, amountMinor: -1 } }, { ...base, budget: { ...base.budget, amountMinor: 1.2 } },
    { ...base, budget: { ...base.budget, basis: 'per_person', amountMinor: Number.MAX_SAFE_INTEGER } },
    { ...base, schedule: { ...base.schedule, durationMinutes: 0 } },
  ];
  for (const value of invalid) assert.equal(validatePlanningIntent(value).success, false);
});
test('date/time windows validate calendar, overnight semantics and timezone', () => {
  const window = { kind: 'window', outingDate: '2028-02-29', startTime: '23:00', endTime: '01:00', endDayOffset: 1, timeZone: 'Asia/Manila' };
  assert.equal(validatePlanningIntent({ ...intent(), schedule: window }).success, true);
  for (const patch of [{ outingDate: '2027-02-29' }, { endDayOffset: 0 }, { timeZone: 'Not/AZone' }, { startTime: '24:00' }]) {
    assert.equal(validatePlanningIntent({ ...intent(), schedule: { ...window, ...patch } }).success, false);
  }
});
test('hard exclusions and only-category scope cannot contradict anchors or each other', () => {
  const base = intent();
  assert.equal(validatePlanningIntent({ ...base, anchors: [{ placeId: firstId, intent: 'must_visit', order: { kind: 'any' } }], constraints: { ...base.constraints, excludedPlaceIds: [firstId] } }).success, false);
  assert.equal(validatePlanningIntent({ ...base, constraints: { ...base.constraints, categoryScope: { kind: 'only', categoryCodes: ['food.cafe'] }, excludedCategoryCodes: ['food.cafe'] } }).success, false);
});
test('version and zero budget persist; unknown-price policy never becomes free', () => {
  const base = intent();
  const result = validatePlanningIntent({ ...base, budget: { ...base.budget, amountMinor: 0, unknownPricePolicy: 'exclude' } });
  assert.ok(result.success);
  assert.equal(result.data.planningIntentVersion, 1);
  assert.equal(result.data.budget.amountMinor, 0);
  assert.equal(result.data.budget.unknownPricePolicy, 'exclude');
});
test('resuming a draft clears catalog reviews and rejects unsupported draft versions', () => {
  let state = answerQuestion(draft(), 'anchors', [{ placeId: firstId, intent: 'must_visit', order: { kind: 'any' } }]);
  state = recordAnchorReview(state, state.revision, firstId, 'valid');
  const result = resumePlannerDraft(JSON.parse(JSON.stringify(state)));
  assert.ok(result.success);
  assert.deepEqual(result.data.answers, state.answers);
  assert.equal(finalizePlannerDraft(result.data).success, false);
  assert.equal(resumePlannerDraft({ ...state, plannerDraftVersion: 2 }).success, false);
});
test('back navigation leaves hidden family branches safely after dependent edits', () => {
  const family = navigateDraft(draft(intent('family')), 'child_age_bands');
  assert.equal(answerQuestion(family, 'occasion', 'solo').currentQuestion, 'party');
  const none = answerQuestion(family, 'party', { size: 2, children: { state: 'none' } });
  assert.equal(none.currentQuestion, 'children');
  assert.equal(questionsForDraft(none).some((q) => q.id === 'child_age_bands'), false);
});
test('incompatible children count on party edits blocks generation instead of inventing demographics', () => {
  const family = draft(intent('family'));
  const smallerParty = answerQuestion(family, 'party', { size: 1, children: { state: 'present', count: 2, ageBands: { state: 'unanswered' } } });
  assert.equal(finalizePlannerDraft(smallerParty).success, false);
});
test('supported non-PHP currency and locality geography remain structured', () => {
  const base = intent();
  const result = validatePlanningIntent({ ...base, budget: { ...base.budget, currencyCode: 'JPY', amountMinor: 1000 },
    location: { ...base.location, source: 'explicit_location', geography: { kind: 'locality', localityId: 'test-locality' }, context: { locality: 'Test locality', city: 'Test city', region: null, countryCode: 'JP' } } });
  assert.ok(result.success);
  assert.equal(result.data.budget.amountMinor, 1000);
  assert.equal(result.data.location.geography.kind, 'locality');
});
test('preference edits preserve completed anchor checks; budget changes invalidate them', () => {
  let state = answerQuestion(draft(), 'anchors', [{ placeId: firstId, intent: 'must_visit', order: { kind: 'any' } }]);
  state = recordAnchorReview(state, state.revision, firstId, 'valid');
  state = answerQuestion(state, 'moods', { state: 'selected', values: ['chill'] });
  assert.equal(finalizePlannerDraft(state).success, true);
  state = answerQuestion(state, 'budget', { ...intent().budget, amountMinor: 0 });
  assert.equal(finalizePlannerDraft(state).success, false);
});
