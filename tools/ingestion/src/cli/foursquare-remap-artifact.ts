import { readFile, writeFile } from "node:fs/promises";
import { metroManilaRegion } from "../../../../data/regions/metro-manila.js";
import { resolveFoursquareCategory } from "../../../../data/category-mappings/foursquare.js";
import { buildFoursquareSampleReport, toFoursquareStagingDatabaseRow } from "../reporting/foursquare-sample.js";
import { transformFoursquarePlace, type FoursquarePlaceRow } from "../sources/foursquare.js";
import type { RawSourcePlace } from "../types/index.js";
import { RunDuplicateTracker } from "../validation/duplicate-tracker.js";
import { normalizeAndValidatePlace } from "../validation/validate-place.js";

interface StoredArtifact {
  version: number;
  generatedAt: string;
  run: { id: string; sourceId: string; sourceCode: string; regionCode: string };
  query: Record<string, unknown>;
  report: unknown;
  categoryMetadata?: ReadonlyArray<{
    categoryMappingHint: RawSourcePlace["categoryMappingHint"] | null;
    sourceCategoryClassifications: RawSourcePlace["sourceCategoryClassifications"];
  }>;
  sourceIdentities: readonly (string | null)[];
  stagingRows: ReadonlyArray<{ source_payload: unknown }>;
}

async function main(): Promise<void> {
  const artifactPath = process.argv[2];
  if (!artifactPath) throw new Error("Artifact path is required.");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as StoredArtifact;
  if (![1, 2].includes(artifact.version) || artifact.run.sourceCode !== "foursquare_os" || artifact.run.regionCode !== "PH-NCR") {
    throw new Error("Unsupported Foursquare sample artifact.");
  }

  const rawRecords = artifact.stagingRows.map((row, index) => {
    const transformed = transformFoursquarePlace(
      row.source_payload as FoursquarePlaceRow,
      metroManilaRegion,
    );
    const metadata = artifact.categoryMetadata?.[index];
    return {
      ...transformed,
      ...(metadata?.categoryMappingHint
        ? { categoryMappingHint: metadata.categoryMappingHint }
        : {}),
      ...(metadata?.sourceCategoryClassifications
        ? { sourceCategoryClassifications: metadata.sourceCategoryClassifications }
        : {}),
    };
  });
  const duplicateTracker = new RunDuplicateTracker();
  const stagingRecords = rawRecords.map((record) => normalizeAndValidatePlace(record, {
    ingestionRunId: artifact.run.id,
    sourceId: artifact.run.sourceId,
    sourceCode: artifact.run.sourceCode,
    knownSourceCodes: new Set([artifact.run.sourceCode]),
    region: metroManilaRegion,
    unknownCategoryPolicy: "review",
  }, resolveFoursquareCategory, duplicateTracker));
  const report = buildFoursquareSampleReport(rawRecords, stagingRecords, metroManilaRegion);
  const updatedArtifact = {
    ...artifact,
    version: 2,
    generatedAt: new Date().toISOString(),
    report,
    sourceIdentities: stagingRecords.map((record) => record.dedupeKey),
    stagingRows: stagingRecords.map(toFoursquareStagingDatabaseRow),
  };
  await writeFile(artifactPath, JSON.stringify(updatedArtifact, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ artifactPath, runId: artifact.run.id, report }, null, 2));
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : "Unknown artifact remapping error.";
  console.error(message);
  process.exitCode = 1;
});
