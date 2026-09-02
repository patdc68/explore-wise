import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";

const SOURCE_ID = "71aad752-1586-459f-9540-7f7c81c12300";
const EXPECTED_RECORDS = 29_018;
const EXPECTED_BATCHES = 59;
// All staging rows present before the next authoritative full run. This is a
// preservation guard, not a value to be backfilled or modified by the loader.
const STAGING_BASELINE_ROWS = 34_168;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type StageReport = {
  runId: string;
  sourceId: string;
  sourceBatchCount: number;
  batchCount: number;
  categoryMapping: { source: "data/category-mappings/foursquare.ts"; sha256: string };
  report: { sourceRecords: number; valid: number; review: number; rejected: number };
};

type LoaderState = {
  runId: string;
  sourceId: string;
  completedBatches: number[];
  idempotencyApplied?: boolean;
};

function artifactDirectory(): string {
  return fileURLToPath(new URL("../../.artifacts/", import.meta.url));
}

function loadLoaderEnvironment(): void {
  try {
    loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
  } catch {
    // An operator may instead provide SUPABASE_DB_URL through the process
    // environment (for example, a password manager or CI secret store).
    if (!process.env.SUPABASE_DB_URL?.trim()) throw new Error("SUPABASE_DB_URL is required in tools/ingestion/.env.local or the operator environment.");
  }
}

function requireRunId(args: readonly string[]): string {
  const index = args.indexOf("--run-id");
  const runId = index < 0 ? undefined : args[index + 1];
  if (!runId || !RUN_ID_PATTERN.test(runId)) throw new Error("--run-id must be a UUID.");
  return runId;
}

function parseOptions(args: readonly string[]): { runId: string; idempotencyOnly: boolean } {
  const runId = requireRunId(args);
  const allowed = new Set(["--run-id", runId, "--idempotency"]);
  if (args.some((arg) => !allowed.has(arg))) throw new Error("Usage: npm run load:foursquare -- --run-id <uuid> [--idempotency]");
  return { runId, idempotencyOnly: args.includes("--idempotency") };
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function readReport(runId: string): Promise<StageReport> {
  const path = `${artifactDirectory()}foursquare-stage-${runId}-report.json`;
  if (!await exists(path)) throw new Error(`Missing staging report: ${path}`);
  const report = JSON.parse(await readFile(path, "utf8")) as StageReport;
  if (report.runId !== runId || report.sourceId !== SOURCE_ID) throw new Error("Report run/source ID does not match the approved Foursquare load.");
  if (report.categoryMapping?.source !== "data/category-mappings/foursquare.ts" || !/^[a-f0-9]{64}$/u.test(report.categoryMapping.sha256)) throw new Error("Report does not contain a valid Foursquare category-mapping snapshot hash.");
  if (report.sourceBatchCount !== EXPECTED_BATCHES || report.batchCount !== EXPECTED_BATCHES || report.report.sourceRecords !== EXPECTED_RECORDS || report.report.valid !== 26_459 || report.report.review !== 2_558 || report.report.rejected !== 1) throw new Error("Report accounting does not match the approved full preparation run.");
  return report;
}

async function batchPaths(runId: string): Promise<string[]> {
  const paths = Array.from({ length: EXPECTED_BATCHES }, (_, index) => `${artifactDirectory()}foursquare-stage-${runId}-batch-${String(index + 1).padStart(4, "0")}.sql`);
  const normalPattern = new RegExp(`^foursquare-stage-${runId}-batch-\\d{4}\\.sql$`);
  const discovered = (await readdir(artifactDirectory())).filter((entry) => normalPattern.test(entry));
  if (discovered.length !== EXPECTED_BATCHES) throw new Error(`Expected exactly ${EXPECTED_BATCHES} normal batch artifacts, found ${discovered.length}.`);
  for (const path of paths) if (!await exists(path)) throw new Error(`Missing normal staging batch: ${path}`);
  const idempotency = `${artifactDirectory()}foursquare-stage-${runId}-idempotency.sql`;
  if (!await exists(idempotency)) throw new Error(`Missing idempotency artifact: ${idempotency}`);
  return paths;
}

async function loadState(runId: string): Promise<LoaderState> {
  const path = `${artifactDirectory()}foursquare-load-${runId}-state.json`;
  if (!await exists(path)) return { runId, sourceId: SOURCE_ID, completedBatches: [] };
  const state = JSON.parse(await readFile(path, "utf8")) as LoaderState;
  if (state.runId !== runId || state.sourceId !== SOURCE_ID || !Array.isArray(state.completedBatches) || state.completedBatches.some((batch) => !Number.isInteger(batch) || batch < 1 || batch > EXPECTED_BATCHES)) throw new Error("Loader state is invalid or belongs to a different run/source.");
  return { ...state, completedBatches: [...new Set(state.completedBatches)].sort((a, b) => a - b) };
}

async function saveState(state: LoaderState): Promise<void> {
  await writeFile(`${artifactDirectory()}foursquare-load-${state.runId}-state.json`, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function sqlLiteral(value: string): string { return `'${value.replaceAll("'", "''")}'`; }

function preflightSql(runId: string): string {
  return `select count(*) from public.ew_places;\nselect count(*) from public.ew_place_import_staging;\nselect count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and source_id = ${sqlLiteral(SOURCE_ID)};\nselect coalesce((select source_id::text from public.ew_ingestion_runs where id = ${sqlLiteral(runId)}), '');\nselect count(*) from public.ew_data_sources where id = ${sqlLiteral(SOURCE_ID)} and code = 'foursquare_os';`;
}

async function preflight(runId: string, state: LoaderState, database: Client): Promise<void> {
  const result = await database.query(preflightSql(runId));
  const rows = Array.isArray(result) ? result.map((item) => item.rows[0]) : [result.rows[0]];
  const [places, staging, runRows, runSource, source] = rows.map((row) => String(Object.values(row as Record<string, unknown>)[0] ?? ""));
  if (places !== "0") throw new Error(`Preflight failed: ew_places must be empty (found ${places}).`);
  if (source !== "1") throw new Error("Preflight failed: the approved Foursquare source is not registered exactly once.");
  if (runSource && runSource !== SOURCE_ID) throw new Error("Preflight failed: this ingestion run ID belongs to another source.");
  const expectedTotal = STAGING_BASELINE_ROWS + Number(runRows);
  if (Number(staging) !== expectedTotal) throw new Error(`Preflight failed: staging history is not preserved (total ${staging}, run rows ${runRows}, expected baseline ${STAGING_BASELINE_ROWS}).`);
  if (state.completedBatches.length === 0 && runRows !== "0") throw new Error("Preflight failed: run already has staging rows but no loader state; do not guess which batches completed.");
  if (state.completedBatches.length > 0 && runRows === "0") throw new Error("Preflight failed: loader state records completed batches but the corresponding staging rows are absent.");
}

async function ensureRun(runId: string, report: StageReport, database: Client): Promise<void> {
  const metadata = JSON.stringify({ category_mapping: report.categoryMapping });
  await database.query(`insert into public.ew_ingestion_runs (id, source_id, region_code, status, metadata) values (${sqlLiteral(runId)}, ${sqlLiteral(SOURCE_ID)}, 'PH-NCR', 'running', ${sqlLiteral(metadata)}::jsonb) on conflict (id) do update set status = 'running', metadata = coalesce(public.ew_ingestion_runs.metadata, '{}'::jsonb) || excluded.metadata where public.ew_ingestion_runs.source_id = excluded.source_id;`);
}

async function reconcileRun(runId: string, report: StageReport, database: Client): Promise<void> {
  const checks = `select count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and source_id = ${sqlLiteral(SOURCE_ID)};
select count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and validation_status = 'valid';
select count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and validation_status = 'review';
select count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and validation_status = 'invalid';
select count(distinct source_place_id) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and source_id = ${sqlLiteral(SOURCE_ID)};
select count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and source_id <> ${sqlLiteral(SOURCE_ID)};
select count(*) from public.ew_place_import_staging where ingestion_run_id = ${sqlLiteral(runId)} and (latitude not between 14.3472554 and 14.7853355 or longitude not between 120.7917034 and 121.1350232);`;
  const result = await database.query(checks);
  const values = (Array.isArray(result) ? result : [result]).map((item) => String(Object.values(item.rows[0] as Record<string, unknown>)[0] ?? ""));
  if (values.join(",") !== "29018,26459,2558,1,29018,0,0") throw new Error(`Run reconciliation failed: ${values.join(",")}. The ingestion run was left running for investigation.`);
  const metadata = JSON.stringify({ staging_valid: 26459, staging_review: 2558, staging_rejected: 1, staging_inserted: 29018, category_mapping: report.categoryMapping });
  await database.query(`update public.ew_ingestion_runs set status = 'completed', completed_at = now(), records_received = 29018, records_valid = 26459, records_rejected = 1, metadata = ${sqlLiteral(metadata)}::jsonb where id = ${sqlLiteral(runId)} and source_id = ${sqlLiteral(SOURCE_ID)};`);
}

export async function runFoursquareLoad(args: readonly string[]): Promise<void> {
  const started = performance.now(); const { runId, idempotencyOnly } = parseOptions(args);
  loadLoaderEnvironment();
  const report = await readReport(runId); const batches = await batchPaths(runId); const state = await loadState(runId); const database = await connectSupabaseLoaderDatabase();
  try {
  await preflight(runId, state, database);
  if (idempotencyOnly) {
    if (state.completedBatches.length !== EXPECTED_BATCHES) throw new Error("Idempotency artifact can run only after all 59 normal batches are recorded complete.");
    if (state.idempotencyApplied) { console.log(JSON.stringify({ runId, idempotency: "skipped_already_recorded" })); return; }
    await database.query(await readFile(`${artifactDirectory()}foursquare-stage-${runId}-idempotency.sql`, "utf8"));
    state.idempotencyApplied = true; await saveState(state); console.log(JSON.stringify({ runId, idempotency: "applied", expectedAdditionalRows: 0, durationMs: Math.round(performance.now() - started) })); return;
  }
  await ensureRun(runId, report, database);
  const applied: number[] = []; const skipped = [...state.completedBatches];
  for (const [index, path] of batches.entries()) {
    const batch = index + 1;
    if (state.completedBatches.includes(batch)) continue;
    await database.query(await readFile(path, "utf8"));
    state.completedBatches.push(batch); state.completedBatches.sort((a, b) => a - b); await saveState(state); applied.push(batch);
  }
  await reconcileRun(runId, report, database);
  console.log(JSON.stringify({ runId, batchesDiscovered: EXPECTED_BATCHES, applied, skipped, failed: [], durationMs: Math.round(performance.now() - started) }, null, 2));
  } finally {
    await database.end();
  }
}

runFoursquareLoad(process.argv.slice(2)).catch((cause: unknown) => { console.error(cause instanceof Error ? cause.message : "Unknown Foursquare load error."); process.exitCode = 1; });
