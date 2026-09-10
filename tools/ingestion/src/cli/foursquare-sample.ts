import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { metroManilaRegion } from "../../../../data/regions/metro-manila.js";
import { resolveFoursquareCategory } from "../../../../data/category-mappings/foursquare.js";
import { loadLocalEnvironment, requireFoursquareAccessToken } from "../config/environment.js";
import { RunDuplicateTracker } from "../validation/duplicate-tracker.js";
import { normalizeAndValidatePlace } from "../validation/validate-place.js";
import { FoursquareIcebergCatalog } from "../sources/foursquare-catalog.js";
import { FoursquareOpenSourcePlacesAdapter } from "../sources/foursquare.js";
import {
  buildFoursquareSampleReport,
  toFoursquareStagingDatabaseRow,
} from "../reporting/foursquare-sample.js";

function requireArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function validateUuid(value: string, name: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const token = requireFoursquareAccessToken();
  const sourceId = validateUuid(requireArgument("--source-id"), "--source-id");
  const runIdArgument = process.argv.indexOf("--run-id") >= 0 ? requireArgument("--run-id") : randomUUID();
  const runId = validateUuid(runIdArgument, "--run-id");
  const limit = Number(requireArgument("--limit"));
  if (!Number.isSafeInteger(limit) || limit < 20 || limit > 50) {
    throw new Error("--limit must be an integer between 20 and 50.");
  }

  const catalog = new FoursquareIcebergCatalog(token);
  const source = new FoursquareOpenSourcePlacesAdapter(catalog);
  const rawRecords = await source.read({ region: metroManilaRegion, limit });
  const duplicateTracker = new RunDuplicateTracker();
  const stagingRecords = rawRecords.map((record) => normalizeAndValidatePlace(record, {
    ingestionRunId: runId,
    sourceId,
    sourceCode: source.sourceCode,
    knownSourceCodes: new Set([source.sourceCode]),
    region: metroManilaRegion,
    unknownCategoryPolicy: "review",
  }, resolveFoursquareCategory, duplicateTracker));
  const report = buildFoursquareSampleReport(rawRecords, stagingRecords, metroManilaRegion);
  const artifactDirectory = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
  const artifactPath = fileURLToPath(new URL(`../../.artifacts/foursquare-sample-${runId}.json`, import.meta.url));
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, JSON.stringify({
    version: 2,
    generatedAt: new Date().toISOString(),
    run: {
      id: runId,
      sourceId,
      sourceCode: source.sourceCode,
      regionCode: metroManilaRegion.regionCode,
    },
    query: {
      table: "places.datasets.places_os",
      endpoint: "https://catalog.h3-hub.foursquare.com/iceberg",
      country: metroManilaRegion.countryCode,
      sourceRegion: metroManilaRegion.displayName,
      geographicBounds: metroManilaRegion.geographicBounds,
      categoryFilter: "live categories_os ancestry joined to the curated include rule IDs",
      diversityStrategy: "round-robin by mapped ExploreWise category, then rule precedence and fsq_place_id",
      orderBy: "diversity_rank asc, mapping_precedence asc, fsq_place_id asc",
      requestedLimit: limit,
    },
    report,
    categoryMetadata: rawRecords.map((record) => ({
      categoryMappingHint: record.categoryMappingHint ?? null,
      sourceCategoryClassifications: record.sourceCategoryClassifications ?? [],
    })),
    sourceIdentities: stagingRecords.map((record) => record.dedupeKey),
    stagingRows: stagingRecords.map(toFoursquareStagingDatabaseRow),
  }, null, 2), { encoding: "utf8", mode: 0o600 });

  console.log(JSON.stringify({ artifactPath, runId, report }, null, 2));
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : "Unknown Foursquare sample error.";
  console.error(message);
  process.exitCode = 1;
});
