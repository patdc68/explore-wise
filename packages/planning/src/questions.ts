import { ACTIVITIES, CHILD_AGE_BANDS, FOODS, MOBILITY, MOODS, OCCASIONS, type Occasion } from './intent.ts';
import { type PlannerDraft, type QuestionId } from './draft.ts';

type Condition = 'always' | 'occasion_answered' | 'family' | 'children_present';
type Question = Readonly<{
  id: QuestionId;
  required: boolean;
  when: Condition;
  answer: string;
  allowedValues?: readonly string[];
  modes?: readonly string[];
}>;
const preferenceModes = ['selected', 'no_preference', 'surprise_me', 'skipped'] as const;
export const REQUIRED_ANSWER_OPTIONS = {
  budgetBasis: ['total', 'per_person'],
  budgetStrictness: ['strict', 'flexible'],
  unknownPricePolicy: ['allow_with_disclosure', 'exclude'],
  scheduleKind: ['duration', 'window'],
  anchorIntent: ['must_visit', 'preferred'],
} as const;
/** Declarative, non-rendering spec. `answer` names the canonical validator/field. */
export const QUESTIONS: readonly Question[] = [
  { id: 'occasion', required: true, when: 'always', answer: 'occasion', allowedValues: OCCASIONS },
  { id: 'location', required: true, when: 'occasion_answered', answer: 'location', allowedValues: ['current_location', 'selected_area', 'explicit_location'] },
  { id: 'party', required: true, when: 'occasion_answered', answer: 'party.size: integer 1..50' },
  { id: 'children', required: false, when: 'family', answer: 'party.children', allowedValues: ['none', 'present', 'skipped'] },
  { id: 'child_age_bands', required: false, when: 'children_present', answer: 'party.children.ageBands', allowedValues: CHILD_AGE_BANDS, modes: ['selected', 'skipped'] },
  { id: 'budget', required: true, when: 'occasion_answered', answer: 'budget: amountMinor, currencyCode, basis, strictness, unknownPricePolicy' },
  { id: 'schedule', required: true, when: 'occasion_answered', answer: 'schedule: duration or window; date/start optional' },
  { id: 'moods', required: false, when: 'occasion_answered', answer: 'moods', allowedValues: MOODS, modes: preferenceModes },
  { id: 'food', required: false, when: 'occasion_answered', answer: 'food', allowedValues: FOODS, modes: preferenceModes },
  { id: 'activities', required: false, when: 'occasion_answered', answer: 'activities', allowedValues: ACTIVITIES, modes: preferenceModes },
  { id: 'anchors', required: false, when: 'occasion_answered', answer: 'anchors: catalog UUIDs, must_visit/preferred, order any' },
  { id: 'mobility', required: false, when: 'occasion_answered', answer: 'mobility', allowedValues: MOBILITY, modes: ['selected', 'no_preference', 'skipped'] },
];
export const OCCASION_QUESTIONS = {
  date: { suggestedPartySize: 2, emphasize: ['moods', 'food', 'activities'], suggestedMoods: ['romantic', 'chill'] },
  friends: { suggestedPartySize: null, emphasize: ['party', 'food', 'activities'], suggestedMoods: ['fun', 'food_trip'] },
  family: { suggestedPartySize: null, emphasize: ['party', 'children', 'activities'], suggestedMoods: ['fun', 'outdoorsy'] },
  solo: { suggestedPartySize: 1, emphasize: ['moods', 'activities'], suggestedMoods: ['chill', 'adventurous', 'spontaneous'] },
} as const satisfies Record<Occasion, { suggestedPartySize: number | null; emphasize: readonly QuestionId[]; suggestedMoods: readonly typeof MOODS[number][] }>;

export function questionsForDraft(draft: PlannerDraft): readonly Question[] {
  return QUESTIONS.filter((q) => {
    if (q.when === 'always') return true;
    if (q.when === 'occasion_answered') return draft.answers.occasion !== undefined;
    if (q.when === 'family') return draft.answers.occasion === 'family';
    return draft.answers.occasion === 'family' && draft.answers.party?.children?.state === 'present';
  });
}
/** Presentation aliases write only the canonical vocabulary; none assert venue qualities. */
export const SOLO_PRESENTATION_MAPPING = {
  relaxing: { moods: ['chill'], activities: [] },
  exploring: { moods: ['spontaneous'], activities: ['sightseeing'] },
  productive: { moods: ['chill'], food: ['cafe'], activities: [] },
  self_care: { moods: ['chill'], activities: ['wellness'] },
  adventure: { moods: ['adventurous'], activities: [] },
} as const;
