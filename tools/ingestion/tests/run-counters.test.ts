import assert from "node:assert/strict";
import test from "node:test";
import { countStagingRunCounters } from "../src/accounting/run-counters.js";
import { metroManilaRegion } from "../../../data/regions/metro-manila.js";
import type { IngestionRepository } from "../src/database/repository.js";
import { runIngestion } from "../src/run-ingestion.js";
import type { IngestionSummary, PlaceSnapshot, ProductionPlaceWrite } from "../src/types/index.js";

test("run counters distinguish valid, review, rejected, and mixed staging records", () => {
  assert.deepEqual(countStagingRunCounters([{ validationStatus: "valid" }]), {
    stagingValid: 1, stagingReview: 0, stagingRejected: 0, stagingInserted: 1,
  });
  assert.deepEqual(countStagingRunCounters([{ validationStatus: "review" }]), {
    stagingValid: 0, stagingReview: 1, stagingRejected: 0, stagingInserted: 1,
  });
  assert.deepEqual(countStagingRunCounters([{ validationStatus: "invalid" }]), {
    stagingValid: 0, stagingReview: 0, stagingRejected: 1, stagingInserted: 1,
  });
  assert.deepEqual(countStagingRunCounters([
    { validationStatus: "valid" }, { validationStatus: "review" },
    { validationStatus: "invalid" }, { validationStatus: "review" },
  ]), { stagingValid: 1, stagingReview: 2, stagingRejected: 1, stagingInserted: 4 });
});

class AccountingRepository implements IngestionRepository {
  started: IngestionSummary | null = null;
  completed: IngestionSummary | null = null;

  async findExistingPlaces(): Promise<Map<string, PlaceSnapshot>> { return new Map(); }
  async startRun(summary: IngestionSummary): Promise<void> { this.started = summary; }
  async stageRecords(): Promise<void> {}
  async writePlaces(_records: readonly ProductionPlaceWrite[]): Promise<void> {}
  async completeRun(summary: IngestionSummary): Promise<void> { this.completed = summary; }
}

test("run finalization receives review counts separately from rejected counts", async () => {
  const repository = new AccountingRepository();
  const summary = await runIngestion({
    source: {
      sourceCode: "foursquare_os",
      async read() {
        return [
          { sourcePlaceId: "valid", name: "TEST / FICTIONAL Valid", categorySourceCode: "mapped", countryCode: "PH", latitude: 14.5, longitude: 121 },
          { sourcePlaceId: "review", name: "TEST / FICTIONAL Review", categorySourceCode: "review", countryCode: "PH", latitude: 14.5, longitude: 121 },
          { sourcePlaceId: "invalid", name: "TEST / FICTIONAL Invalid", categorySourceCode: "mapped", countryCode: "PH", latitude: 91, longitude: 121 },
        ];
      },
    },
    context: { ingestionRunId: "test-run", sourceId: "test-source", sourceCode: "foursquare_os", knownSourceCodes: new Set(["foursquare_os"]), region: metroManilaRegion, unknownCategoryPolicy: "review" },
    categoryResolver: (sourceCategory) => sourceCategory === "mapped"
      ? { status: "mapped", sourceCategory, exploreWiseCategoryCode: "food.cafe" }
      : { status: "review", sourceCategory, exploreWiseCategoryCode: null, reason: "unmapped_source_category" },
    repository,
    dryRun: false,
  });

  assert.equal(summary.received, 3);
  assert.equal(summary.valid, 1);
  assert.equal(summary.review, 1);
  assert.equal(summary.rejected, 1);
  assert.deepEqual(summary.metadata, {
    staging_valid: 1, staging_review: 1, staging_rejected: 1, staging_inserted: 3,
  });
  assert.deepEqual(repository.started, summary);
  assert.deepEqual(repository.completed, summary);
});
