import assert from "node:assert/strict";
import test from "node:test";
import { metroManilaRegion } from "../../../data/regions/metro-manila.js";
import type { IngestionRepository } from "../src/database/repository.js";
import { runIngestion } from "../src/run-ingestion.js";
import type { PlaceSourceAdapter } from "../src/sources/types.js";
import type {
  IngestionSummary,
  NormalizedStagingPlace,
  PlaceSnapshot,
  ProductionPlaceWrite,
} from "../src/types/index.js";

class SpyRepository implements IngestionRepository {
  mutations = 0;

  async findExistingPlaces(): Promise<Map<string, PlaceSnapshot>> {
    return new Map();
  }

  async startRun(_summary: IngestionSummary): Promise<void> {
    this.mutations += 1;
  }

  async stageRecords(_records: readonly NormalizedStagingPlace[]): Promise<void> {
    this.mutations += 1;
  }

  async writePlaces(_records: readonly ProductionPlaceWrite[]): Promise<void> {
    this.mutations += 1;
  }

  async completeRun(_summary: IngestionSummary): Promise<void> {
    this.mutations += 1;
  }
}

const source: PlaceSourceAdapter = {
  sourceCode: "foursquare_os",
  async read() {
    return [{
      sourcePlaceId: "TEST-DRY-RUN-1",
      name: "TEST / FICTIONAL Dry Run Cafe",
      categorySourceCode: "test:cafe",
      countryCode: "PH",
      latitude: 14.5,
      longitude: 121,
      timezone: "Asia/Manila",
      currencyCode: "PHP",
      sourcePayload: { testFixture: true, fictional: true },
    }];
  },
};

test("dry-run computes results without any run, staging, or production mutation", async () => {
  const repository = new SpyRepository();
  const summary = await runIngestion({
    source,
    context: {
      ingestionRunId: "test-run",
      sourceId: "test-source",
      sourceCode: "foursquare_os",
      knownSourceCodes: new Set(["foursquare_os"]),
      region: metroManilaRegion,
      unknownCategoryPolicy: "review",
    },
    categoryResolver: (sourceCategory) => ({
      status: "mapped",
      sourceCategory,
      exploreWiseCategoryCode: "food.cafe",
    }),
    repository,
    dryRun: true,
  });

  assert.equal(repository.mutations, 0);
  assert.equal(summary.dryRun, true);
  assert.equal(summary.received, 1);
  assert.equal(summary.inserted, 1);
});

