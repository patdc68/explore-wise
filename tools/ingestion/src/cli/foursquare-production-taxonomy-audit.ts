import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import {
  FOURSQUARE_TAXONOMY_RULE_VERSION,
  classifyFoursquareTaxonomyCategory,
  evaluateFoursquarePlaceTaxonomy,
  type FoursquareTaxonomyNode,
} from "../../../../data/category-mappings/foursquare.js";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";

const SOURCE = "foursquare_os";
const taxonomyPath = fileURLToPath(new URL("../../.artifacts/foursquare-categories-os.json", import.meta.url));
const artifactDirectory = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
const snapshotDirectory = fileURLToPath(new URL("../../.artifacts/foursquare-production-snapshot/", import.meta.url));

interface ProductionRow {
  id: string;
  source_place_id: string;
  name: string;
  current_explorewise_category: string | null;
  source_payload: Record<string, unknown> | null;
}

interface AuditRow {
  placeId: string;
  source: typeof SOURCE;
  sourcePlaceId: string;
  name: string;
  currentExploreWiseCategory: string | null;
  foursquareCategoryIds: readonly string[];
  foursquareCategoryLabels: readonly (string | null)[];
  resolvedSourceCategories: readonly { id: string; label: string | null }[];
  decision: "include" | "review" | "exclude";
  decisionReason: string;
  evidence: unknown;
  ruleVersion: typeof FOURSQUARE_TAXONOMY_RULE_VERSION;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function loadDatabaseEnvironment(): void {
  try {
    loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
  } catch {
    if (!process.env.SUPABASE_DB_URL?.trim()) {
      throw new Error("SUPABASE_DB_URL is required in tools/ingestion/.env.local or the operator environment.");
    }
  }
}

async function loadTaxonomy(): Promise<ReadonlyMap<string, FoursquareTaxonomyNode>> {
  const nodes = JSON.parse(await readFile(taxonomyPath, "utf8")) as FoursquareTaxonomyNode[];
  return new Map(nodes.map((node) => [node.category_id, node]));
}

async function readProductionRowsFromDatabase(): Promise<readonly ProductionRow[]> {
  const db = await connectSupabaseLoaderDatabase();
  try {
    const result = await db.query<ProductionRow>(`
      select
        place.id,
        place.source_place_id,
        place.name,
        category.code as current_explorewise_category,
        staged.source_payload
      from public.ew_places as place
      left join public.ew_categories as category on category.id = place.category_id
      left join lateral (
        select staging.source_payload
        from public.ew_place_import_staging as staging
        join public.ew_data_sources as source on source.id = staging.source_id
        where source.code = place.source
          and staging.source_place_id = place.source_place_id
          and staging.source_payload is not null
        order by staging.source_updated_at desc nulls last, staging.created_at desc
        limit 1
      ) as staged on true
      where place.source = $1
        and place.status = 'active'
      order by place.id
    `, [SOURCE]);
    return result.rows;
  } finally {
    await db.end();
  }
}

async function readProductionRowsFromSnapshot(): Promise<readonly ProductionRow[]> {
  const files = (await readdir(snapshotDirectory))
    .filter((file) => /^page-\d{3}\.json$/u.test(file))
    .sort();
  if (files.length === 0) throw new Error("No local production snapshot is available.");
  const pages = await Promise.all(files.map(async (file) => (
    JSON.parse(await readFile(join(snapshotDirectory, file), "utf8")) as ProductionRow[]
  )));
  return pages.flat();
}

async function readProductionRows(): Promise<{ rows: readonly ProductionRow[]; input: "database" | "supabase_mcp_snapshot" }> {
  try {
    loadDatabaseEnvironment();
    return { rows: await readProductionRowsFromDatabase(), input: "database" };
  } catch (cause) {
    try {
      return { rows: await readProductionRowsFromSnapshot(), input: "supabase_mcp_snapshot" };
    } catch {
      throw cause;
    }
  }
}

function classify(row: ProductionRow, taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>): AuditRow {
  const ids = strings(row.source_payload?.fsq_category_ids);
  const suppliedLabels = strings(row.source_payload?.fsq_category_labels);
  const sourceDecision = evaluateFoursquarePlaceTaxonomy({
    name: row.name,
    categories: ids.map((id) => classifyFoursquareTaxonomyCategory(id, taxonomy)),
  });
  return {
    placeId: row.id,
    source: SOURCE,
    sourcePlaceId: row.source_place_id,
    name: row.name,
    currentExploreWiseCategory: row.current_explorewise_category,
    foursquareCategoryIds: ids,
    foursquareCategoryLabels: ids.map((_, index) => suppliedLabels[index] ?? null),
    resolvedSourceCategories: sourceDecision.evidence.categories.map((category) => ({
      id: category.categoryId,
      label: category.categoryLabel,
    })),
    decision: sourceDecision.decision,
    decisionReason: sourceDecision.reason,
    evidence: sourceDecision.evidence,
    ruleVersion: sourceDecision.ruleVersion,
  };
}

function bucket(rows: readonly AuditRow[], predicate: (row: AuditRow) => boolean): readonly AuditRow[] {
  return rows.filter(predicate).slice(0, 25);
}

async function main(): Promise<void> {
  const [taxonomy, production] = await Promise.all([loadTaxonomy(), readProductionRows()]);
  const rows = production.rows.map((row) => classify(row, taxonomy));
  const counts = {
    include: rows.filter((row) => row.decision === "include").length,
    review: rows.filter((row) => row.decision === "review").length,
    exclude: rows.filter((row) => row.decision === "exclude").length,
  };
  if (rows.length !== 26459 || counts.include + counts.review + counts.exclude !== rows.length) {
    throw new Error(`Audit completeness check failed: expected 26,459 active Foursquare places, found ${rows.length}.`);
  }
  const artifact = {
    artifactVersion: 1,
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    ruleVersion: FOURSQUARE_TAXONOMY_RULE_VERSION,
    taxonomy: { source: "tools/ingestion/.artifacts/foursquare-categories-os.json", categoryCount: taxonomy.size },
    productionInput: production.input,
    productionPlaceCount: rows.length,
    counts,
    representativeExamples: {
      highConfidenceExclude: bucket(rows, (row) => row.decision === "exclude"),
      contextualReview: bucket(rows, (row) => row.decision === "review" && row.decisionReason === "contextual_name_guard"),
      mixedCategoryReview: bucket(rows, (row) => row.decision === "review" && row.decisionReason === "included_and_excluded_category_mix"),
      unknownCategoryReview: bucket(rows, (row) => row.decision === "review" && row.decisionReason === "unknown_source_category"),
    },
    rows,
  };
  await mkdir(artifactDirectory, { recursive: true });
  const artifactPath = `${artifactDirectory}foursquare-production-taxonomy-audit-${FOURSQUARE_TAXONOMY_RULE_VERSION}.json`;
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ artifactPath, productionPlaceCount: rows.length, counts, representativeExamples: artifact.representativeExamples }, null, 2));
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : "Unknown Foursquare production taxonomy audit error.");
  process.exitCode = 1;
});
