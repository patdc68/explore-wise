import type { PlanningIntent } from './intent.ts';

/**
 * Phase 3 planner limits are deliberately centralized here.  The mobile
 * planner may have a wider editing surface, but the generation boundary uses
 * this bounded policy for every request.
 */
export const PLANNER_POLICY = Object.freeze({
  requestVersion: 1,
  responseVersion: 1,
  maxBodyBytes: 16 * 1024,
  partySize: Object.freeze({ min: 1, max: 50 }),
  radiusMeters: Object.freeze({ min: 1, max: 50_000 }),
  maxCategoryCodesPerQuery: 20,
  maxGenerationAnchors: 6,
  maxCandidatePool: 50,
  candidatePools: Object.freeze({
    broad: 50,
    budgetEvidence: 12,
    preferenceEvidence: 16,
  }),
  maxGeneratedStages: 5,
  maxDatabaseCalls: 20,
  maxAttempts: 5,
  maxAttemptOrdinal: 4,
  maxExcludedCombinationsPerAttempt: 6,
  maxCombinationLength: 200,
  durationMinutes: Object.freeze({ min: 60, max: 720 }),
  preferredSequentialRadiusMeters: Object.freeze({
    keep_close: 2_000,
    short_rides_ok: 5_000,
    flexible: 10_000,
    neutral: 5_000,
  }),
} as const);

export const GENERATION_REQUEST_VERSION = PLANNER_POLICY.requestVersion;
export const GENERATION_RESPONSE_VERSION = PLANNER_POLICY.responseVersion;
export const MIN_PARTY_SIZE = PLANNER_POLICY.partySize.min;
export const MAX_PARTY_SIZE = PLANNER_POLICY.partySize.max;
export const MIN_RADIUS_METERS = PLANNER_POLICY.radiusMeters.min;
export const MAX_RADIUS_METERS = PLANNER_POLICY.radiusMeters.max;
export const MAX_GENERATION_ANCHORS = PLANNER_POLICY.maxGenerationAnchors;
export const MAX_CATEGORY_CODES_PER_QUERY = PLANNER_POLICY.maxCategoryCodesPerQuery;
export const MAX_CANDIDATE_POOL = PLANNER_POLICY.maxCandidatePool;
export const MAX_BROAD_CANDIDATES = PLANNER_POLICY.candidatePools.broad;
export const MAX_BUDGET_EVIDENCE_CANDIDATES = PLANNER_POLICY.candidatePools.budgetEvidence;
export const MAX_PREFERENCE_EVIDENCE_CANDIDATES = PLANNER_POLICY.candidatePools.preferenceEvidence;
export const MAX_GENERATED_STAGES = PLANNER_POLICY.maxGeneratedStages;
export const MAX_DATABASE_CALLS = PLANNER_POLICY.maxDatabaseCalls;
export const MAX_ATTEMPTS = PLANNER_POLICY.maxAttempts;
export const MAX_ATTEMPT_ORDINAL = PLANNER_POLICY.maxAttemptOrdinal;
export const MAX_EXCLUDED_COMBINATIONS_PER_ATTEMPT = PLANNER_POLICY.maxExcludedCombinationsPerAttempt;
export const MAX_COMBINATION_LENGTH = PLANNER_POLICY.maxCombinationLength;
export const MIN_DURATION_MINUTES = PLANNER_POLICY.durationMinutes.min;
export const MAX_DURATION_MINUTES = PLANNER_POLICY.durationMinutes.max;
export const MAX_REQUEST_BODY_BYTES = PLANNER_POLICY.maxBodyBytes;

export type MobilityPolicyValue = 'keep_close' | 'short_rides_ok' | 'flexible' | 'neutral';

/** Convert a valid local HH:mm value into minutes since midnight. */
export function minutesSinceMidnight(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

/** Duration represented by either a duration or an overnight time window. */
export function scheduleDurationMinutes(schedule: PlanningIntent['schedule']): number | null {
  if (schedule.kind === 'duration') return schedule.durationMinutes;
  const start = minutesSinceMidnight(schedule.startTime);
  const end = minutesSinceMidnight(schedule.endTime);
  if (start === null || end === null) return null;
  return end + schedule.endDayOffset * 1_440 - start;
}

/**
 * The deterministic V1 stop-count policy.  Values outside the supported
 * composition window return null so callers can ask for clarification rather
 * than silently changing the user's time request.
 */
export function stopCountForDuration(durationMinutes: number): number | null {
  if (!Number.isSafeInteger(durationMinutes)
    || durationMinutes < PLANNER_POLICY.durationMinutes.min
    || durationMinutes > PLANNER_POLICY.durationMinutes.max) return null;
  if (durationMinutes < 120) return 1;
  if (durationMinutes < 240) return 2;
  if (durationMinutes < 360) return 3;
  if (durationMinutes < 540) return 4;
  return 5;
}

export function stopCountForSchedule(schedule: PlanningIntent['schedule']): number | null {
  const duration = scheduleDurationMinutes(schedule);
  return duration === null ? null : stopCountForDuration(duration);
}

/**
 * Mobility is a preference, never a permission to leave the hard geography.
 * Unanswered/no-preference/skipped all use the neutral policy radius.
 */
export function preferredSequentialRadiusMeters(
  mobility: MobilityPolicyValue | PlanningIntent['mobility'] | null | undefined,
  hardRadiusMeters: number,
): number {
  const selected = typeof mobility === 'object' && mobility?.state === 'selected' ? mobility.value : mobility;
  const key: MobilityPolicyValue = selected === 'keep_close' || selected === 'short_rides_ok' || selected === 'flexible' ? selected : 'neutral';
  const preferred = PLANNER_POLICY.preferredSequentialRadiusMeters[key];
  return Math.min(preferred, hardRadiusMeters);
}
