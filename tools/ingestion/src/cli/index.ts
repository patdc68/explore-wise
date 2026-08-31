import { randomUUID } from "node:crypto";
import { metroManilaRegion } from "../../../../data/regions/metro-manila.js";
import { resolveFoursquareCategory } from "../../../../data/category-mappings/foursquare.js";
import { isSupportedSource } from "../config/sources.js";
import { DryRunRepository } from "../database/dry-run-repository.js";
import { runIngestion } from "../run-ingestion.js";
import {
  FICTIONAL_FIXTURE_CATEGORY_MAPPINGS,
  FoursquareFixtureSource,
} from "../sources/foursquare-fixture.js";
import { parseCliArgs } from "./parse-args.js";

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (!isSupportedSource(options.source)) {
    throw new Error(`Unsupported source: ${options.source}`);
  }
  if (options.region !== metroManilaRegion.regionCode) {
    throw new Error(`Unsupported region: ${options.region}`);
  }
  if (!options.dryRun) {
    throw new Error("This milestone supports fixture dry-runs only. Re-run with --dry-run.");
  }

  const summary = await runIngestion({
    source: new FoursquareFixtureSource(),
    context: {
      ingestionRunId: randomUUID(),
      sourceId: randomUUID(),
      sourceCode: options.source,
      knownSourceCodes: new Set([options.source]),
      region: metroManilaRegion,
      unknownCategoryPolicy: "review",
    },
    categoryResolver: (sourceCategory) => resolveFoursquareCategory(
      sourceCategory,
      FICTIONAL_FIXTURE_CATEGORY_MAPPINGS,
    ),
    repository: new DryRunRepository(),
    dryRun: true,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  });

  // Summary output intentionally excludes source payloads and credentials.
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : "Unknown ingestion error.";
  console.error(message);
  process.exitCode = 1;
});

