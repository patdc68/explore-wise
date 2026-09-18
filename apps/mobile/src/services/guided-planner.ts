import { answerQuestion, createPlannerDraft, navigateDraft, validatePlannerDraft, type PlannerDraft, type QuestionId } from '../../../../packages/planning/src/draft.ts';
import { intentFields, validatePlanningIntent, type Occasion, type PlanningIntent, type PlanningLocation } from '../../../../packages/planning/src/intent.ts';
import { OCCASION_QUESTIONS, questionsForDraft } from '../../../../packages/planning/src/questions.ts';
import { validate, type Result } from '../../../../packages/planning/src/validation.ts';

export type PlannerSession = { draft: PlannerDraft; screen: QuestionId | 'review' | 'generating' | 'complete'; editing: boolean; preview: PlanningIntent | null };
export const createPlannerSession = (): PlannerSession => ({ draft: createPlannerDraft(), screen: 'occasion', editing: false, preview: null });

export const PLANNER_PHASES = ['Basics', 'Budget & time', 'Preferences', 'Final touches', 'Review'] as const;
export type PlannerPhase = typeof PLANNER_PHASES[number];
export type PlannerProgress = Readonly<{ phase: PlannerPhase; phaseIndex: number; phaseCount: number; completion: number }>;

const PHASE_BY_QUESTION: Record<QuestionId, Exclude<PlannerPhase, 'Review'>> = {
  occasion: 'Basics', location: 'Basics', party: 'Basics', children: 'Basics', child_age_bands: 'Basics',
  budget: 'Budget & time', schedule: 'Budget & time',
  moods: 'Preferences', food: 'Preferences', activities: 'Preferences',
  anchors: 'Final touches', mobility: 'Final touches',
};

/** The native question engine stays dynamic; this is only its friendlier presentation progress. */
export function plannerProgress(draft: PlannerDraft, screen: PlannerSession['screen']): PlannerProgress {
  if (screen === 'review' || screen === 'generating' || screen === 'complete') return { phase: 'Review', phaseIndex: PLANNER_PHASES.length, phaseCount: PLANNER_PHASES.length, completion: 1 };
  const questions = plannerQuestions(draft);
  const index = Math.max(0, questions.findIndex((question) => question.id === screen));
  const phase = PHASE_BY_QUESTION[screen];
  const completion = screen === 'occasion' && !draft.answers.occasion ? 0 : Math.min(1, (index + 1) / (questions.length + 1));
  return { phase, phaseIndex: PLANNER_PHASES.indexOf(phase) + 1, phaseCount: PLANNER_PHASES.length, completion };
}

/** Auto-advance is immediate for reduced-motion users and brief for everyone else. */
export const PLANNER_AUTO_ADVANCE_MS = 140;
export function plannerAdvanceDelay(reduceMotion: boolean): number {
  return reduceMotion ? 0 : PLANNER_AUTO_ADVANCE_MS;
}

export function plannerQuestions(draft: PlannerDraft) {
  // Phase 2's solo presentation accepts the spec's suggested size without an extra question.
  return questionsForDraft(draft).filter((q) => !(q.id === 'party' && draft.answers.occasion === 'solo'));
}
export function setPlannerAnswer<K extends Exclude<keyof PlanningIntent, 'planningIntentVersion'>>(session: PlannerSession, key: K, value: PlanningIntent[K]): PlannerSession {
  let draft = answerQuestion(session.draft, key, value);
  if (key === 'occasion') {
    const occasion = value as Occasion;
    const suggested = OCCASION_QUESTIONS[occasion].suggestedPartySize;
    if (occasion === 'solo' || !draft.answers.party || session.draft.answers.occasion === 'solo') {
      if (suggested !== null) draft = answerQuestion(draft, 'party', { size: suggested, children: null });
      else {
        const answers = { ...draft.answers };
        delete answers.party;
        draft = { ...draft, answers };
      }
    }
  }
  return { ...session, draft, preview: null };
}
export function questionReady(draft: PlannerDraft, id: QuestionId): boolean {
  const a = draft.answers;
  if (id === 'party') return validate(intentFields.party, { size: a.party?.size, children: null }).success;
  if (id === 'children') return !!a.party?.children && a.party.children.state !== 'unanswered' && validate(intentFields.party, a.party).success;
  if (id === 'child_age_bands') return a.party?.children?.state === 'present' && a.party.children.ageBands.state !== 'unanswered' && validate(intentFields.party, a.party).success;
  return validate<unknown>(intentFields[id], a[id]).success && !(['moods', 'food', 'activities', 'mobility'].includes(id) && (a[id] as { state?: string })?.state === 'unanswered');
}

/** Food and activities share one visual step but retain separate canonical draft fields. */
export function plannerScreenReady(draft: PlannerDraft, id: QuestionId): boolean {
  return id === 'food' ? questionReady(draft, 'food') && questionReady(draft, 'activities') : questionReady(draft, id);
}

export function editPlannerQuestion(session: PlannerSession, id: QuestionId): PlannerSession {
  return { ...session, screen: id, editing: true, draft: navigateDraft(session.draft, id), preview: null };
}
export function nextPlannerQuestion(session: PlannerSession): PlannerSession {
  if (session.screen === 'review' || session.screen === 'generating' || session.screen === 'complete' || !plannerScreenReady(session.draft, session.screen as QuestionId)) return session;
  const questions = plannerQuestions(session.draft);
  if (session.editing && session.screen === 'occasion') {
    const dependent = questions.find((q) => ['party', 'children', 'child_age_bands'].includes(q.id) && !questionReady(session.draft, q.id));
    if (dependent) return { ...session, screen: dependent.id, draft: navigateDraft(session.draft, dependent.id) };
  }
  const currentIndex = questions.findIndex((q) => q.id === session.screen);
  const nextIndex = currentIndex + (session.screen === 'food' && questions[currentIndex + 1]?.id === 'activities' ? 2 : 1);
  const next = questions[nextIndex]?.id;
  // Finish newly revealed dependent family questions even when editing from review.
  const followUp = next === 'children' || next === 'child_age_bands';
  const screen = session.editing && !followUp ? 'review' : next ?? 'review';
  return { ...session, screen, editing: screen === 'review' ? false : session.editing, draft: screen === 'review' ? session.draft : navigateDraft(session.draft, screen) };
}
export function previousPlannerQuestion(session: PlannerSession): PlannerSession {
  if (session.screen === 'complete' || session.editing) return { ...session, screen: 'review', editing: false, preview: null };
  const questions = plannerQuestions(session.draft);
  const index = session.screen === 'review' ? questions.length : questions.findIndex((q) => q.id === session.screen);
  const previous = questions[Math.max(0, index - 1)].id;
  const screen = previous === 'activities' ? 'food' : previous;
  return { ...session, screen, draft: navigateDraft(session.draft, screen) };
}
export function skipPlannerQuestion(session: PlannerSession): PlannerSession {
  const id = session.screen;
  if (id === 'children' && session.draft.answers.party) return nextPlannerQuestion(setPlannerAnswer(session, 'party', { ...session.draft.answers.party, children: { state: 'skipped' } }));
  if (id === 'child_age_bands' && session.draft.answers.party?.children?.state === 'present') return nextPlannerQuestion(setPlannerAnswer(session, 'party', { ...session.draft.answers.party, children: { ...session.draft.answers.party.children, ageBands: { state: 'skipped' } } }));
  if (id === 'food') {
    let next = setPlannerAnswer(session, 'food', { state: 'skipped' });
    next = setPlannerAnswer(next, 'activities', { state: 'skipped' });
    return nextPlannerQuestion(next);
  }
  if (id === 'moods' || id === 'activities' || id === 'mobility') return nextPlannerQuestion(setPlannerAnswer(session, id, { state: 'skipped' }));
  if (id === 'anchors') return nextPlannerQuestion(session);
  return session;
}
export function addPlannerAnchor(session: PlannerSession, placeId: string): PlannerSession {
  const anchors = session.draft.answers.anchors ?? [];
  const normalized = placeId.toLowerCase();
  if (anchors.some((a) => a.placeId.toLowerCase() === normalized) || anchors.length >= 50) return session;
  return setPlannerAnswer(session, 'anchors', [...anchors, { placeId: normalized, intent: 'must_visit', order: { kind: 'any' } }]);
}
export const removePlannerAnchor = (session: PlannerSession, placeId: string) => {
  const normalized = placeId.toLowerCase();
  return setPlannerAnswer(session, 'anchors', (session.draft.answers.anchors ?? []).filter((a) => a.placeId.toLowerCase() !== normalized));
};
export function replacePlannerAnchor(session: PlannerSession, previousPlaceId: string, nextPlaceId: string): PlannerSession {
  const previous = previousPlaceId.toLowerCase();
  const next = nextPlaceId.toLowerCase();
  const anchors = session.draft.answers.anchors ?? [];
  if (anchors.some((anchor) => anchor.placeId.toLowerCase() === next && anchor.placeId.toLowerCase() !== previous)) return session;
  return setPlannerAnswer(session, 'anchors', anchors.map((anchor) => anchor.placeId.toLowerCase() === previous ? { ...anchor, placeId: next } : anchor));
}

/** PHASE 2 ONLY: structural preview, NEVER real generation or a trusted anchor review.
 * Phase 3 must perform trusted compatibility checks and use finalizePlannerDraft.
 * No fake valid reviews are recorded to bypass that production gate. */
export function validatePlannerPreview(draft: PlannerDraft): Result<PlanningIntent> {
  const parsed = validatePlannerDraft(draft);
  if (!parsed.success) return parsed;
  const missing = plannerQuestions(draft).find((q) => !questionReady(draft, q.id));
  if (missing) return { success: false, issues: [{ path: `$.${missing.id}`, message: `Finish ${missing.id} before previewing.` }] };
  return validatePlanningIntent(draft.answers);
}
export function completePlannerPreview(session: PlannerSession): PlannerSession {
  const result = validatePlannerPreview(session.draft);
  return result.success ? { ...session, screen: 'complete', preview: result.data } : session;
}
export function plannerLocation(selection: { label: string; coordinates: PlanningLocation['coordinates']; source: 'current-location' | 'location-search' }): PlanningLocation {
  return { label: selection.label, coordinates: selection.coordinates, source: selection.source === 'current-location' ? 'current_location' : 'selected_area', context: { locality: null, city: null, region: null, countryCode: null }, geography: { kind: 'radius', radiusMeters: 5000 } };
}
export function parseBudgetInput(text: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(text.trim())) return NaN;
  const [whole, fraction = ''] = text.trim().split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : NaN;
}
export const LABELS: Record<string, string> = {
  date: 'Date', friends: 'Friends', family: 'Family', solo: 'Just me', romantic: 'Romantic', chill: 'Chill', fun: 'Fun', artsy: 'Artsy', adventurous: 'Adventurous', outdoorsy: 'Outdoorsy', food_trip: 'Food trip', spontaneous: 'Spontaneous',
  cafe: 'Cafe', casual: 'Casual', fast_food: 'Fast food', restaurant: 'Restaurant', local_food: 'Local food', dessert: 'Dessert', drinks: 'Drinks', art_museum: 'Art / Museum', outdoor_park: 'Park / Outdoor', games_arcade: 'Games / Arcade', movie: 'Movie', shopping: 'Shopping', sightseeing: 'Sightseeing', nightlife: 'Nightlife', wellness: 'Wellness',
  keep_close: 'Keep it close', short_rides_ok: 'Short rides are okay', flexible: 'Flexible', no_preference: 'No preference', surprise_me: 'Surprise me', skipped: 'Skipped', unanswered: 'Not answered', under_3: 'Under 3', '3_to_5': '3–5', '6_to_12': '6–12', '13_to_17': '13–17',
};
export function preferenceSummary(answer: PlanningIntent['moods'] | PlanningIntent['food'] | PlanningIntent['activities'] | PlanningIntent['mobility'] | undefined): string {
  if (!answer) return 'Not answered';
  if (answer.state !== 'selected') return LABELS[answer.state];
  return 'values' in answer ? answer.values.map((v) => LABELS[v]).join(', ') : LABELS[answer.value];
}
export function budgetSummary(draft: PlannerDraft): string {
  const b = draft.answers.budget;
  if (!b || !Number.isFinite(b.amountMinor)) return 'Choose a budget';
  const money = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: b.currencyCode, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
  const size = draft.answers.party?.size;
  return `${money(b.amountMinor)} ${b.basis === 'total' ? 'total' : 'per person'}\nfor ${size ?? 'your'} ${size === 1 ? 'person' : 'people'}${b.basis === 'per_person' && size ? ` · ${money(b.amountMinor * size)} total` : ''}`;
}
