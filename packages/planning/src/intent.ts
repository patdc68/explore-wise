import { array, enumeration, fail, type Infer, nullable, number, object, refine, text, union, unique, validate, type Validator } from './validation.ts';

export const PLANNING_INTENT_VERSION = 1;
/** Future candidate policy only; this module does not evaluate or rank place prices. */
export const FLEXIBLE_BUDGET_OVERAGE_BASIS_POINTS = 1000; // 10%, rounded down in minor units.
export const OCCASIONS = ['date', 'friends', 'family', 'solo'] as const;
export const MOODS = ['romantic', 'chill', 'fun', 'artsy', 'adventurous', 'outdoorsy', 'food_trip', 'spontaneous'] as const;
export const FOODS = ['cafe', 'casual', 'fast_food', 'restaurant', 'local_food', 'dessert', 'drinks'] as const;
export const ACTIVITIES = ['art_museum', 'outdoor_park', 'games_arcade', 'movie', 'shopping', 'sightseeing', 'nightlife', 'wellness'] as const;
export const MOBILITY = ['keep_close', 'short_rides_ok', 'flexible'] as const;
export const CHILD_AGE_BANDS = ['under_3', '3_to_5', '6_to_12', '13_to_17'] as const;
export type Occasion = typeof OCCASIONS[number];

/** Surprise is an answer mode, never a category that can be mixed with selected values. */
export function preference<const T extends readonly string[]>(values: T) {
  return union(
    object({ state: enumeration(['unanswered', 'no_preference', 'skipped', 'surprise_me']) }),
    object({ state: enumeration(['selected']), values: unique(array(enumeration(values), 1, values.length)) }),
  );
}
const uuidText = refine(text, (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'Expected catalog UUID');
export const uuid: Validator<string> = (value, path) => uuidText(value, path).toLowerCase();
const positiveInteger = number(1, Number.MAX_SAFE_INTEGER, true);
export const locationValidator = object({
  source: enumeration(['current_location', 'selected_area', 'explicit_location']),
  label: text,
  coordinates: object({ latitude: number(-90, 90), longitude: number(-180, 180) }),
  context: object({ locality: nullable(text), city: nullable(text), region: nullable(text), countryCode: nullable(refine(text, (v) => /^[A-Z]{2}$/.test(v), 'Expected ISO country code')) }),
  // Labels/context are presentation, not enforceable geographical boundaries.
  geography: union(
    object({ kind: enumeration(['radius']), radiusMeters: positiveInteger }),
    object({ kind: enumeration(['locality']), localityId: text }),
  ),
});
export const childrenValidator = union(
  object({ state: enumeration(['unanswered', 'skipped', 'none']) }),
  object({ state: enumeration(['present']), count: positiveInteger, ageBands: union(
    object({ state: enumeration(['unanswered', 'skipped']) }),
    object({ state: enumeration(['selected']), values: unique(array(enumeration(CHILD_AGE_BANDS), 1, CHILD_AGE_BANDS.length)) }),
  ) }),
);
export const partyValidator = refine(object({ size: number(1, 50, true), children: nullable(childrenValidator) }),
  (p) => p.children?.state !== 'present' || p.children.count <= p.size, 'Children count exceeds party size');
export const budgetValidator = object({
  amountMinor: number(0, Number.MAX_SAFE_INTEGER, true),
  currencyCode: refine(text, (v) => /^[A-Z]{3}$/.test(v), 'Expected ISO currency code'),
  basis: enumeration(['total', 'per_person']),
  strictness: enumeration(['strict', 'flexible']),
  unknownPricePolicy: enumeration(['allow_with_disclosure', 'exclude']),
});
const date = refine(text, (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Expected valid YYYY-MM-DD date');
const time = refine(text, (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Expected HH:mm local time');
const timezone = refine(text, (v) => {
  try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; }
}, 'Expected IANA timezone');
const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
export const scheduleValidator = union(
  refine(object({ kind: enumeration(['duration']), durationMinutes: positiveInteger, outingDate: nullable(date), startTime: nullable(time), timeZone: nullable(timezone) }),
    (s) => (s.outingDate === null && s.startTime === null) || s.timeZone !== null, 'Dated/timed schedules require timezone'),
  refine(object({ kind: enumeration(['window']), outingDate: nullable(date), startTime: time, endTime: time, endDayOffset: enumeration([0, 1]), timeZone: timezone }),
    (s) => minutes(s.endTime) + s.endDayOffset * 1440 > minutes(s.startTime), 'Window must end after it starts'),
);
export const anchorValidator = object({
  placeId: uuid,
  intent: enumeration(['must_visit', 'preferred']),
  // Reserved discriminated shape; V1 has no ordering behavior.
  order: object({ kind: enumeration(['any']) }),
});
export const anchorsValidator = refine(array(anchorValidator), (a) => new Set(a.map((item) => item.placeId.toLowerCase())).size === a.length, 'Duplicate anchor identity');
export const constraintsValidator = object({
  excludedPlaceIds: unique(array(uuid)),
  excludedCategoryCodes: unique(array(text)),
  // Explicit-only is separate from soft preference, preserving future “just cafe” intent.
  categoryScope: union(object({ kind: enumeration(['any']) }), object({ kind: enumeration(['only']), categoryCodes: unique(array(text, 1)) })),
});
export const intentFields = {
  planningIntentVersion: enumeration([PLANNING_INTENT_VERSION]),
  occasion: enumeration(OCCASIONS), location: locationValidator, party: partyValidator,
  budget: budgetValidator, schedule: scheduleValidator,
  moods: preference(MOODS), food: preference(FOODS), activities: preference(ACTIVITIES),
  mobility: union(object({ state: enumeration(['unanswered', 'no_preference', 'skipped']) }), object({ state: enumeration(['selected']), value: enumeration(MOBILITY) })),
  anchors: anchorsValidator, constraints: constraintsValidator,
};
const shape = object(intentFields);
export type PlanningIntent = Infer<typeof shape>;
export type PlanningLocation = PlanningIntent['location'];
export type Anchor = PlanningIntent['anchors'][number];

export const planningIntentValidator: Validator<PlanningIntent> = (value, path) => {
  const intent = shape(value, path);
  if (intent.occasion !== 'family' && intent.party.children !== null) fail(`${path}.party.children`, 'Children metadata is only applicable to family');
  if (intent.occasion === 'family' && intent.party.children === null) fail(`${path}.party.children`, 'Family must record an explicit children answer state');
  if (intent.budget.basis === 'per_person' && !Number.isSafeInteger(intent.budget.amountMinor * intent.party.size)) fail(`${path}.budget.amountMinor`, 'Group budget exceeds safe integer range');
  if (intent.anchors.some((a) => intent.constraints.excludedPlaceIds.some((id) => id.toLowerCase() === a.placeId.toLowerCase()))) fail(`${path}.anchors`, 'Anchor conflicts with explicit exclusion');
  if (intent.constraints.categoryScope.kind === 'only' && intent.constraints.categoryScope.categoryCodes.every((code) => intent.constraints.excludedCategoryCodes.includes(code))) fail(`${path}.constraints`, 'All explicitly requested categories are excluded');
  return intent;
};
/** Structural validation only; catalog/geography/price feasibility needs trusted backend checks. */
export const validatePlanningIntent = (value: unknown) => validate(planningIntentValidator, value);

export const CONSTRAINT_STRENGTH = {
  activeCatalog: 'hard', geography: 'hard', mustVisitAnchor: 'hard', partyPriceMultiplier: 'hard',
  strictKnownBudget: 'hard', explicitExclusions: 'hard', explicitCategoryScope: 'hard', availableTime: 'hard',
  occasion: 'soft', moods: 'soft', food: 'soft', activities: 'soft', mobility: 'soft', preferredAnchor: 'soft', flexibleBudget: 'soft',
} as const;
