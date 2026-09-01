import type { NormalizedStagingPlace } from "../types/index.js";

export interface StagingRunCounters {
  stagingValid: number;
  stagingReview: number;
  stagingRejected: number;
  stagingInserted: number;
}

/**
 * Counts rows by their durable staging status. Review is deliberately separate
 * from rejection: only `invalid` rows are rejected.
 */
export function countStagingRunCounters(
  records: readonly Pick<NormalizedStagingPlace, "validationStatus">[],
): StagingRunCounters {
  let stagingValid = 0;
  let stagingReview = 0;
  let stagingRejected = 0;

  for (const record of records) {
    if (record.validationStatus === "valid") stagingValid += 1;
    else if (record.validationStatus === "review") stagingReview += 1;
    else if (record.validationStatus === "invalid") stagingRejected += 1;
  }

  return {
    stagingValid,
    stagingReview,
    stagingRejected,
    stagingInserted: records.length,
  };
}
