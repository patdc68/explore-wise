import { intentFields, PLANNING_INTENT_VERSION, uuid, validatePlanningIntent, type PlanningIntent } from './intent.ts';
import { array, enumeration, number, object, partial, refine, validate, type Infer, type Result } from './validation.ts';

export const QUESTION_IDS = ['occasion', 'location', 'party', 'children', 'child_age_bands', 'budget', 'schedule', 'moods', 'food', 'activities', 'anchors', 'mobility'] as const;
export type QuestionId = typeof QUESTION_IDS[number];
const draftValidator = object({
  plannerDraftVersion: enumeration([1]),
  revision: number(0, Number.MAX_SAFE_INTEGER, true),
  currentQuestion: enumeration(QUESTION_IDS),
  answers: partial(intentFields),
  anchorReviews: refine(array(object({ placeId: uuid, revision: number(0, Number.MAX_SAFE_INTEGER, true), status: enumeration(['valid', 'incompatible']) })),
    (reviews) => new Set(reviews.map((r) => r.placeId)).size === reviews.length, 'Duplicate anchor review'),
});
export type PlannerDraft = Infer<typeof draftValidator>;
export const validatePlannerDraft = (value: unknown) => validate(draftValidator, value);
export function createPlannerDraft(): PlannerDraft {
  return {
    plannerDraftVersion: 1, revision: 0, currentQuestion: 'occasion', anchorReviews: [],
    answers: {
      planningIntentVersion: PLANNING_INTENT_VERSION,
      moods: { state: 'unanswered' }, food: { state: 'unanswered' }, activities: { state: 'unanswered' }, mobility: { state: 'unanswered' },
      anchors: [], constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
    },
  };
}

/** Immutable edits preserve unrelated answers; every edit invalidates pending async reviews. */
export function answerQuestion<K extends Exclude<keyof PlanningIntent, 'planningIntentVersion'>>(draft: PlannerDraft, key: K, value: PlanningIntent[K]): PlannerDraft {
  const answers = { ...draft.answers, [key]: value };
  if (key === 'occasion' && answers.party) {
    answers.party = { ...answers.party, children: answers.occasion === 'family' ? answers.party.children ?? { state: 'unanswered' } : null };
  }
  if (key === 'party' && answers.party) {
    answers.party = { ...answers.party, children: answers.occasion === 'family' ? answers.party.children ?? { state: 'unanswered' } : null };
  }
  const revision = draft.revision + 1;
  // Geography, party, exclusions, budget, time, or anchors can change feasibility.
  const affectsAnchors = ['location', 'party', 'occasion', 'budget', 'schedule', 'anchors', 'constraints'].includes(key);
  let currentQuestion = draft.currentQuestion;
  if (answers.occasion !== 'family' && (currentQuestion === 'children' || currentQuestion === 'child_age_bands')) currentQuestion = 'party';
  else if (currentQuestion === 'child_age_bands' && answers.party?.children?.state !== 'present') currentQuestion = 'children';
  return { ...draft, revision, currentQuestion, answers, anchorReviews: affectsAnchors ? [] : draft.anchorReviews.map((r) => ({ ...r, revision })) };
}
export function navigateDraft(draft: PlannerDraft, question: QuestionId): PlannerDraft {
  return { ...draft, currentQuestion: question };
}
/** Call with the revision captured BEFORE a trusted catalog compatibility check. Stale responses are ignored. */
export function recordAnchorReview(draft: PlannerDraft, checkedRevision: number, placeId: string, status: 'valid' | 'incompatible'): PlannerDraft {
  if (checkedRevision !== draft.revision || !draft.answers.location || !draft.answers.anchors?.some((a) => a.placeId === placeId)) return draft;
  return { ...draft, anchorReviews: [...draft.anchorReviews.filter((r) => r.placeId !== placeId), { placeId, revision: checkedRevision, status }] };
}
export function anchorReviewState(draft: PlannerDraft, placeId: string): 'needs_revalidation' | 'valid' | 'incompatible' {
  return draft.anchorReviews.find((r) => r.placeId === placeId && r.revision === draft.revision)?.status ?? 'needs_revalidation';
}
/** Persisted checks are stale evidence. Resuming keeps answers but requires fresh catalog review. */
export function resumePlannerDraft(value: unknown): Result<PlannerDraft> {
  const result = validatePlannerDraft(value);
  return result.success ? { success: true, data: { ...result.data, revision: result.data.revision + 1, anchorReviews: [] } } : result;
}
export function finalizePlannerDraft(value: unknown): Result<PlanningIntent> {
  const parsed = validatePlannerDraft(value);
  if (!parsed.success) return parsed;
  const draft = parsed.data;
  const result = validatePlanningIntent(draft.answers);
  if (!result.success) return result;
  if (result.data.anchors.some((a) => anchorReviewState(draft, a.placeId) !== 'valid')) {
    return { success: false, issues: [{ path: '$.anchors', message: 'Resolve anchor compatibility before generation; anchors have been retained' }] };
  }
  return result;
}
