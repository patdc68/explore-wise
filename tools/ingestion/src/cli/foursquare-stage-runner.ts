import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveFoursquareCategory } from "../../../../data/category-mappings/foursquare.js";
import { metroManilaRegion } from "../../../../data/regions/metro-manila.js";
import { loadLocalEnvironment, requireFoursquareAccessToken } from "../config/environment.js";
import { toFoursquareStagingDatabaseRow, type FoursquareStagingDatabaseRow } from "../reporting/foursquare-sample.js";
import { FoursquareIcebergCatalog } from "../sources/foursquare-catalog.js";
import { transformFoursquarePlace } from "../sources/foursquare.js";
import type { NormalizedStagingPlace, RawSourcePlace } from "../types/index.js";
import { RunDuplicateTracker } from "../validation/duplicate-tracker.js";
import { normalizeAndValidatePlace } from "../validation/validate-place.js";
import { foursquareStageHelp, parseFoursquareStageOptions } from "./foursquare-stage-options.js";

const BATCH_SIZE = 500;
const IDEMPOTENCY_SUBSET_SIZE = 100;
const columns = "ingestion_run_id,source_id,source_place_id,source_payload,source_updated_at,name,category_source_code,country_code,region,city,district,address,latitude,longitude,timezone,currency_code,website_url,phone_number,validation_status,validation_errors,normalized_name,dedupe_key";

function sqlValue(value: unknown): string { if (value === null || value === undefined) return "null"; if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null"; return `'${String(value).replaceAll("'", "''")}'`; }
function rowSql(row: FoursquareStagingDatabaseRow): string { const values = [row.ingestion_run_id, row.source_id, row.source_place_id, row.source_payload === null ? null : JSON.stringify(row.source_payload), row.source_updated_at, row.name, row.category_source_code, row.country_code, row.region, row.city, row.district, row.address, row.latitude, row.longitude, row.timezone, row.currency_code, row.website_url, row.phone_number, row.validation_status, JSON.stringify(row.validation_errors), row.normalized_name, row.dedupe_key].map(sqlValue); values[3] = values[3] === "null" ? "null" : `${values[3]}::jsonb`; values[19] = `${values[19]}::jsonb`; return `(${values.join(",")})`; }
function insertSql(rows: readonly FoursquareStagingDatabaseRow[]): string { return `insert into public.ew_place_import_staging (${columns}) values\n${rows.map(rowSql).join(",\n")}\non conflict (ingestion_run_id, source_id, source_place_id) do nothing;\n`; }
function missing(value: unknown): boolean { return value === null || value === undefined || (typeof value === "string" && value.trim().length === 0); }
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
function increment(counts: Map<string, number>, key: string): void { counts.set(key, (counts.get(key) ?? 0) + 1); }

class AggregateReport {
  sourceRecords = 0; valid = 0; review = 0; rejected = 0; missingNames = 0; missingCoordinates = 0; missingAddress = 0; missingLocality = 0; missingRegion = 0; missingPostcode = 0; missingPhone = 0; missingWebsite = 0; unresolvedFlagCoverage = 0;
  readonly categories = new Map<string, number>(); readonly flags = new Map<string, number>(); readonly validationErrors = new Map<string, number>();
  add(raw: RawSourcePlace, staged: NormalizedStagingPlace): void {
    this.sourceRecords += 1; if (staged.validationStatus === "valid") this.valid += 1; else if (staged.validationStatus === "review") this.review += 1; else this.rejected += 1;
    const payload = raw.sourcePayload as Record<string, unknown> | null;
    if (missing(payload?.name)) this.missingNames += 1; if (missing(payload?.latitude) || missing(payload?.longitude)) this.missingCoordinates += 1; if (missing(payload?.address)) this.missingAddress += 1; if (missing(payload?.locality)) this.missingLocality += 1; if (missing(payload?.region)) this.missingRegion += 1; if (missing(payload?.postcode)) this.missingPostcode += 1; if (missing(payload?.tel)) this.missingPhone += 1; if (missing(payload?.website)) this.missingWebsite += 1;
    const category = staged.categoryMapping?.status === "mapped" ? staged.categoryMapping.exploreWiseCategoryCode : null; if (category) increment(this.categories, category);
    const flags = strings(payload?.unresolved_flags); if (flags.length > 0) this.unresolvedFlagCoverage += 1; for (const flag of new Set(flags)) increment(this.flags, flag); for (const error of staged.validationErrors) increment(this.validationErrors, error.code);
  }
  finish(): object { return { sourceRecords: this.sourceRecords, valid: this.valid, review: this.review, rejected: this.rejected, categoryDistribution: Object.fromEntries([...this.categories.entries()].sort(([a], [b]) => a.localeCompare(b))), flags: Object.fromEntries([...this.flags.entries()].sort(([a], [b]) => a.localeCompare(b))), missingFieldStats: { names: this.missingNames, coordinates: this.missingCoordinates, address: this.missingAddress, locality: this.missingLocality, region: this.missingRegion, postcode: this.missingPostcode, phone: this.missingPhone, website: this.missingWebsite }, unresolvedFlagCoverage: this.unresolvedFlagCoverage, validationErrorCounts: Object.fromEntries([...this.validationErrors.entries()].sort(([a], [b]) => a.localeCompare(b))) }; }
}

export async function runFoursquareStage(args: readonly string[]): Promise<void> {
  const options = parseFoursquareStageOptions(args);
  if (options.help) { console.log(foursquareStageHelp()); return; }
  loadLocalEnvironment();
  const runId = options.runId ?? randomUUID(); const maxRecords = options.mode.kind === "all" ? undefined : options.mode.limit;
  const started = performance.now(); const catalog = new FoursquareIcebergCatalog(requireFoursquareAccessToken()); const queryPlan = await catalog.explainOptimizedRelevantBatch(metroManilaRegion, BATCH_SIZE); const queryStarted = performance.now(); const duplicateTracker = new RunDuplicateTracker(); const report = new AggregateReport(); const directory = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
  let sourceBatchCount = 0; let firstBatchDurationMs: number | null = null; let batchCount = 0; let idempotencyRows: FoursquareStagingDatabaseRow[] = [];
  const process = async (page: readonly import("../sources/foursquare.js").FoursquarePlaceRow[], writeArtifact: boolean): Promise<void> => {
    if (firstBatchDurationMs === null) firstBatchDurationMs = Math.round(performance.now() - queryStarted); sourceBatchCount += 1;
    const rawRecords = page.map((row) => transformFoursquarePlace(row, metroManilaRegion));
    const staged = rawRecords.map((record) => normalizeAndValidatePlace(record, { ingestionRunId: runId, sourceId: options.sourceId, sourceCode: "foursquare_os", knownSourceCodes: new Set(["foursquare_os"]), region: metroManilaRegion, unknownCategoryPolicy: "review" }, resolveFoursquareCategory, duplicateTracker));
    staged.forEach((record, index) => report.add(rawRecords[index] as RawSourcePlace, record)); const rows = staged.map(toFoursquareStagingDatabaseRow);
    idempotencyRows = [...idempotencyRows, ...rows].sort((left, right) => (left.source_place_id ?? "").localeCompare(right.source_place_id ?? "")).slice(0, IDEMPOTENCY_SUBSET_SIZE);
    if (writeArtifact) { batchCount += 1; await writeFile(`${directory}foursquare-stage-${runId}-batch-${String(batchCount).padStart(4, "0")}.sql`, insertSql(rows), { encoding: "utf8", mode: 0o600 }); }
  };
  if (options.probeOnly) await process(await catalog.readOptimizedRelevantBatch(metroManilaRegion, BATCH_SIZE), false);
  else { await mkdir(directory, { recursive: true }); for await (const page of catalog.streamOptimizedRelevantPlaces(metroManilaRegion, maxRecords, BATCH_SIZE)) await process(page, true); }
  const queryDurationMs = Math.round(performance.now() - queryStarted); const aggregate = report.finish();
  if (options.probeOnly) { console.log(JSON.stringify({ probeOnly: true, firstBatchDurationMs, sourceBatchCount, report: aggregate }, null, 2)); return; }
  await writeFile(`${directory}foursquare-stage-${runId}-idempotency.sql`, insertSql(idempotencyRows), { encoding: "utf8", mode: 0o600 });
  const finalReport = { runId, sourceId: options.sourceId, mode: options.mode, sourceBatchCount, batchCount, firstBatchDurationMs, queryDurationMs, totalPreparationDurationMs: Math.round(performance.now() - started), queryPlan, report: aggregate };
  await writeFile(`${directory}foursquare-stage-${runId}-report.json`, JSON.stringify(finalReport, null, 2), { encoding: "utf8", mode: 0o600 }); console.log(JSON.stringify({ ...finalReport, artifactDirectory: directory }, null, 2));
}
