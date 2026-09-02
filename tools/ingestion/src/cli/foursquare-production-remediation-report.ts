import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FoursquareTaxonomyNode } from "../../../../data/category-mappings/foursquare.js";
import {
  FOURSQUARE_REMEDIATION_RULE_VERSION,
  remediateFoursquareReview,
  type ReviewAuditRow,
} from "../remediation/foursquare-production-remediation.js";

const artifactDirectory = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
const auditPath = fileURLToPath(new URL("../../.artifacts/foursquare-production-taxonomy-audit-foursquare-taxonomy-v2.0.0.json", import.meta.url));
const taxonomyPath = fileURLToPath(new URL("../../.artifacts/foursquare-categories-os.json", import.meta.url));

type AuditArtifact = { rows: readonly (ReviewAuditRow & { decision: string; decisionReason: string })[] };

function distribution<T extends string>(values: readonly T[]): Record<T, number> {
  return values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {} as Record<T, number>);
}

async function main(): Promise<void> {
  const [audit, taxonomyNodes] = await Promise.all([
    readFile(auditPath, "utf8").then((value) => JSON.parse(value) as AuditArtifact),
    readFile(taxonomyPath, "utf8").then((value) => JSON.parse(value) as FoursquareTaxonomyNode[]),
  ]);
  const taxonomy = new Map(taxonomyNodes.map((node) => [node.category_id, node]));
  const reviewRows = audit.rows.filter((row) => row.decision === "review");
  const decisions = reviewRows.map((row) => ({ ...row, remediation: remediateFoursquareReview(row, taxonomy) }));
  const counts = distribution(decisions.map((row) => row.remediation.disposition));
  if (reviewRows.length !== 1767 || Object.values(counts).reduce((sum, count) => sum + count, 0) !== 1767) {
    throw new Error(`Remediation invariant failed: expected 1,767 review rows, found ${reviewRows.length}.`);
  }
  const report = {
    artifactVersion: 1,
    generatedAt: new Date().toISOString(),
    remediationRuleVersion: FOURSQUARE_REMEDIATION_RULE_VERSION,
    reviewInputCount: reviewRows.length,
    counts,
    distributions: {
      byDispositionAndReason: Object.fromEntries(["keep", "hide", "manual_review"].map((disposition) => [
        disposition,
        distribution(decisions.filter((row) => row.remediation.disposition === disposition).map((row) => row.remediation.reason)),
      ])),
    },
    namedPlaces: Object.fromEntries(["Tierra Santa Memorial Park", "Holy Cross Memorial Park", "New Hatchin Japanese Grocery", "Tapsimania"].map((name) => {
      const row = decisions.find((candidate) => candidate.name === name);
      if (!row) throw new Error(`Required audit example is missing: ${name}`);
      return [name, row];
    })),
    representativeExamples: Object.fromEntries(["keep", "hide", "manual_review"].map((disposition) => [
      disposition,
      decisions.filter((row) => row.remediation.disposition === disposition).slice(0, 25),
    ])),
    decisions,
  };
  await mkdir(artifactDirectory, { recursive: true });
  const artifactPath = `${artifactDirectory}foursquare-production-remediation-${FOURSQUARE_REMEDIATION_RULE_VERSION}.json`;
  await writeFile(artifactPath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ artifactPath, counts, namedPlaces: report.namedPlaces }, null, 2));
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : "Unknown remediation reporting error.");
  process.exitCode = 1;
});
