import { decideIdempotency } from "./deduplication/idempotency.js";
import { countStagingRunCounters } from "./accounting/run-counters.js";
import { createPrimarySourceIdentity } from "./normalization/identity.js";
import { toProductionPlaceWrite } from "./database/production-place-write.js";
import type { IngestionRepository } from "./database/repository.js";
import type { PlaceSourceAdapter } from "./sources/types.js";
import type {
  IngestionContext,
  IngestionSummary,
  ProductionPlaceWrite,
} from "./types/index.js";
import { RunDuplicateTracker } from "./validation/duplicate-tracker.js";
import {
  normalizeAndValidatePlace,
  type CategoryResolver,
} from "./validation/validate-place.js";

export interface RunIngestionOptions {
  source: PlaceSourceAdapter;
  context: IngestionContext;
  categoryResolver: CategoryResolver;
  repository: IngestionRepository;
  dryRun: boolean;
  limit?: number;
}

export async function runIngestion(options: RunIngestionOptions): Promise<IngestionSummary> {
  const rawRecords = await options.source.read({
    region: options.context.region,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  });
  const duplicateTracker = new RunDuplicateTracker();
  const stagingRecords = rawRecords.map((record) => normalizeAndValidatePlace(
    record,
    options.context,
    options.categoryResolver,
    duplicateTracker,
  ));
  const productionWrites = stagingRecords
    .filter((record) => record.validationStatus === "valid")
    .map(toProductionPlaceWrite);
  const stagingCounters = countStagingRunCounters(stagingRecords);
  const existingPlaces = await options.repository.findExistingPlaces(productionWrites);
  const writesToApply: ProductionPlaceWrite[] = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const write of productionWrites) {
    const identity = createPrimarySourceIdentity(write.sourceCode, write.sourcePlaceId);
    const decision = decideIdempotency(existingPlaces.get(identity), write);
    if (decision.action === "inserted") {
      inserted += 1;
      writesToApply.push(write);
    } else if (decision.action === "updated") {
      updated += 1;
      writesToApply.push(write);
    } else {
      unchanged += 1;
    }
  }

  const summary: IngestionSummary = {
    dryRun: options.dryRun,
    source: options.context.sourceCode,
    region: options.context.region.regionCode,
    received: stagingRecords.length,
    valid: stagingCounters.stagingValid,
    review: stagingCounters.stagingReview,
    rejected: stagingCounters.stagingRejected,
    inserted,
    updated,
    unchanged,
    errors: stagingRecords.reduce((total, record) => total + record.validationErrors.length, 0),
    metadata: {
      staging_valid: stagingCounters.stagingValid,
      staging_review: stagingCounters.stagingReview,
      staging_rejected: stagingCounters.stagingRejected,
      staging_inserted: stagingCounters.stagingInserted,
    },
  };

  if (!options.dryRun) {
    await options.repository.startRun(summary);
    await options.repository.stageRecords(stagingRecords);
    await options.repository.writePlaces(writesToApply);
    await options.repository.completeRun(summary);
  }

  return summary;
}
