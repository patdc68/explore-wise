import { randomUUID } from "node:crypto";
import { runFoursquareStage } from "./foursquare-stage-runner.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { metroManilaRegion } from "../../../../data/regions/metro-manila.js";
import { resolveFoursquareCategory } from "../../../../data/category-mappings/foursquare.js";
import { loadLocalEnvironment, requireFoursquareAccessToken } from "../config/environment.js";
import { toFoursquareStagingDatabaseRow, buildFoursquareSampleReport, type FoursquareStagingDatabaseRow } from "../reporting/foursquare-sample.js";
import { FoursquareIcebergCatalog } from "../sources/foursquare-catalog.js";
import { transformFoursquarePlace } from "../sources/foursquare.js";
import type { RawSourcePlace } from "../types/index.js";
import { RunDuplicateTracker } from "../validation/duplicate-tracker.js";
import { normalizeAndValidatePlace } from "../validation/validate-place.js";

/*
const BATCH_SIZE = 500;
const IDEMPOTENCY_SUBSET_SIZE = 100;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function uuid(value: string, name: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new Error(`${name} must be a UUID.`);
  return value;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowSql(row: FoursquareStagingDatabaseRow): string {
  const values = [
    row.ingestion_run_id, row.source_id, row.source_place_id,
    row.source_payload === null ? null : JSON.stringify(row.source_payload), row.source_updated_at,
    row.name, row.category_source_code, row.country_code, row.region, row.city, row.district,
    row.address, row.latitude, row.longitude, row.timezone, row.currency_code, row.website_url,
    row.phone_number, row.validation_status, JSON.stringify(row.validation_errors), row.normalized_name,
    row.dedupe_key,
  ].map(sqlValue);
  values[3] = values[3] === "null" ? "null" : `${values[3]}::jsonb`;
  values[19] = `${values[19]}::jsonb`;
  return `(${values.join(",")})`;
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const sourceId = uuid(argument("--source-id"), "--source-id");
  const requestedLimit = Number(argument("--limit"));
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 5000) throw new Error("--limit must be an integer from 1 to 5000.");
  const runId = process.argv.includes("--run-id") ? uuid(argument("--run-id"), "--run-id") : randomUUID();
  const probeOnly = process.argv.includes("--probe");
  const started = performance.now();
  const catalog = new FoursquareIcebergCatalog(requireFoursquareAccessToken());
  const queryPlan = await catalog.explainOptimizedRelevantBatch(metroManilaRegion, BATCH_SIZE);
  const queryStarted = performance.now();
  const duplicateTracker = new RunDuplicateTracker();
  const rawRecords: RawSourcePlace[] = [];
  const stagingRecords = [];
  let sourceRowsReturned = 0;
  let sourceBatchCount = 0;
  let firstBatchDurationMs: number | null = null;
  if (probeOnly) {
    const page = await catalog.readOptimizedRelevantBatch(metroManilaRegion, BATCH_SIZE);
    firstBatchDurationMs = Math.round(performance.now() - queryStarted);
    sourceRowsReturned += page.length;
    sourceBatchCount += 1;
    rawRecords.push(...page.map((row) => transformFoursquarePlace(row, metroManilaRegion)));
  } else {
    for await (const page of catalog.streamOptimizedRelevantPlaces(metroManilaRegion, requestedLimit, BATCH_SIZE)) {
      if (firstBatchDurationMs === null) firstBatchDurationMs = Math.round(performance.now() - queryStarted);
      sourceRowsReturned += page.length;
      sourceBatchCount += 1;
      rawRecords.push(...page.map((row) => transformFoursquarePlace(row, metroManilaRegion)));
    }
  }
  const queryDurationMs = Math.round(performance.now() - queryStarted);
  for (let index = 0; index < rawRecords.length; index += BATCH_SIZE) {
    const batch = rawRecords.slice(index, index + BATCH_SIZE);
    stagingRecords.push(...batch.map((record) => normalizeAndValidatePlace(record, {
      ingestionRunId: runId, sourceId, sourceCode: "foursquare_os", knownSourceCodes: new Set(["foursquare_os"]),
      region: metroManilaRegion, unknownCategoryPolicy: "review",
    }, resolveFoursquareCategory, duplicateTracker)));
  }
  const stagingRows = stagingRecords.map(toFoursquareStagingDatabaseRow);
  const report = buildFoursquareSampleReport(rawRecords, stagingRecords, metroManilaRegion);
  if (probeOnly) {
    const planText = queryPlan.map((row) => String(row.explain_value ?? "")).join("\n");
    console.log(JSON.stringify({
      probeOnly: true,
      queryPlan: {
        hasStreamingLimit: planText.includes("STREAMING_LIMIT"),
        hasGlobalOrderBy: planText.includes("ORDER_BY") || planText.includes("TOP_N"),
        hasIcebergScan: planText.includes("ICEBERG_SCAN"),
      },
      firstBatchDurationMs,
      sourceRowsReturned,
      valid: report.valid,
      review: report.review,
      rejected: report.rejected,
      unresolvedFlagCoverage: report.unresolvedFlagCoverage,
      exploreWiseCategoryDistribution: report.exploreWiseCategoryDistribution,
    }, null, 2));
    return;
  }
  const directory = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const columns = "ingestion_run_id,source_id,source_place_id,source_payload,source_updated_at,name,category_source_code,country_code,region,city,district,address,latitude,longitude,timezone,currency_code,website_url,phone_number,validation_status,validation_errors,normalized_name,dedupe_key";
  const batches = Array.from({ length: Math.ceil(stagingRows.length / BATCH_SIZE) }, (_, index) => stagingRows.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
  for (const [index, batch] of batches.entries()) {
    await writeFile(`${directory}foursquare-stage-${runId}-batch-${String(index + 1).padStart(2, "0")}.sql`, `insert into public.ew_place_import_staging (${columns}) values\n${batch.map(rowSql).join(",\n")}\non conflict (ingestion_run_id, source_id, source_place_id) do nothing;\n`, { encoding: "utf8", mode: 0o600 });
  }
  const idempotencyRows = [...stagingRows]
    .sort((left, right) => (left.source_place_id ?? "").localeCompare(right.source_place_id ?? ""))
    .slice(0, Math.min(IDEMPOTENCY_SUBSET_SIZE, stagingRows.length));
  await writeFile(`${directory}foursquare-stage-${runId}-idempotency.sql`, `insert into public.ew_place_import_staging (${columns}) values\n${idempotencyRows.map(rowSql).join(",\n")}\non conflict (ingestion_run_id, source_id, source_place_id) do nothing;\n`, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${directory}foursquare-stage-${runId}-report.json`, JSON.stringify({ runId, sourceId, requestedLimit, sourceBatchCount, closedExcluded: 0, queryPlan, firstBatchDurationMs, queryDurationMs, totalPreparationDurationMs: Math.round(performance.now() - started), report }, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ runId, sourceId, requestedLimit, sourceBatchCount, closedExcluded: 0, firstBatchDurationMs, queryDurationMs, totalPreparationDurationMs: Math.round(performance.now() - started), sourceRowsReturned, stagingRows: stagingRows.length, batchCount: batches.length, artifactDirectory: directory }, null, 2));
}

*/
runFoursquareStage(process.argv.slice(2)).catch((cause: unknown) => { console.error(cause instanceof Error ? cause.message : "Unknown Foursquare staging error."); process.exitCode = 1; });
