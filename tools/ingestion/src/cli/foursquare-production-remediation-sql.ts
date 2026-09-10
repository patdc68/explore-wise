import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const reportPath = fileURLToPath(new URL("../../.artifacts/foursquare-production-remediation-foursquare-remediation-v1.0.0.json", import.meta.url));

interface ReportDecision {
  placeId: string;
  source: "foursquare_os";
  sourcePlaceId: string;
  name: string;
  foursquareCategoryIds: readonly string[];
  decision: string;
  decisionReason: string;
  ruleVersion: string;
  remediation: { disposition: "keep" | "hide" | "manual_review"; reason: string; ruleVersion: string };
}

interface ReportArtifact {
  decisions: readonly ReportDecision[];
  counts: { keep: number; hide: number; manual_review: number };
}

async function main(): Promise<void> {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as ReportArtifact;
  const plan = report.decisions.map((row) => ({
    place_id: row.placeId,
    source: row.source,
    source_place_id: row.sourcePlaceId,
    decision: row.remediation.disposition === "keep" ? "include" : row.remediation.disposition === "hide" ? "excluded" : "review",
    decision_reason: row.remediation.reason,
    rule_version: row.remediation.ruleVersion,
    taxonomy_version: row.ruleVersion,
    evidence: {
      taxonomy_decision: row.decision,
      taxonomy_reason: row.decisionReason,
      foursquare_category_ids: row.foursquareCategoryIds,
      remediation_disposition: row.remediation.disposition,
      remediation_reason: row.remediation.reason,
    },
  }));
  const expected = report.counts.keep + report.counts.hide + report.counts.manual_review;
  if (expected !== 1767 || plan.length !== expected) throw new Error("Refusing to create a remediation SQL plan with an invalid review count.");
  const payload = JSON.stringify(plan);
  if (payload.includes("$remediation_plan$")) throw new Error("Unsafe SQL delimiter in remediation evidence.");
  process.stdout.write(`begin;
create temporary table ew_remediation_plan on commit drop as
select *
from jsonb_to_recordset($remediation_plan$${payload}$remediation_plan$::jsonb) as plan(
  place_id uuid,
  source text,
  source_place_id text,
  decision text,
  decision_reason text,
  rule_version text,
  taxonomy_version text,
  evidence jsonb
);

do $$
begin
  if (select count(*) from ew_remediation_plan) <> ${expected} then
    raise exception 'Remediation plan count is not ${expected}';
  end if;
  if (select count(*) from public.ew_places place join ew_remediation_plan plan on plan.place_id = place.id and plan.source = place.source and plan.source_place_id = place.source_place_id) <> ${expected} then
    raise exception 'Remediation plan does not exactly match production place identities';
  end if;
end;
$$;

insert into public.ew_place_discovery_decisions (
  place_id, source, source_place_id, decision, decision_reason,
  rule_version, taxonomy_version, evidence, reviewed_at
)
select
  place_id, source, source_place_id, decision, decision_reason,
  rule_version, taxonomy_version, evidence, null
from ew_remediation_plan
on conflict (source, source_place_id) do update set
  place_id = excluded.place_id,
  decision = excluded.decision,
  decision_reason = excluded.decision_reason,
  rule_version = excluded.rule_version,
  taxonomy_version = excluded.taxonomy_version,
  evidence = excluded.evidence,
  reviewed_at = excluded.reviewed_at;

update public.ew_places as place
set status = case when plan.decision = 'include' then 'active' else 'inactive' end
from ew_remediation_plan as plan
where place.id = plan.place_id
  and (
    (plan.decision = 'include' and place.status <> 'active')
    or (plan.decision in ('review', 'excluded') and place.status = 'active')
  );

do $$
begin
  if (select count(*) from public.ew_place_discovery_decisions where rule_version = 'foursquare-remediation-v1.0.0') <> ${expected} then
    raise exception 'Durable decision count does not match remediation plan';
  end if;
  if exists (
    select 1
    from public.ew_places place
    join ew_remediation_plan plan on plan.place_id = place.id
    where (plan.decision = 'include' and place.status <> 'active')
       or (plan.decision in ('review', 'excluded') and place.status = 'active')
  ) then
    raise exception 'Place status is inconsistent with durable discovery decision';
  end if;
end;
$$;
commit;

select jsonb_build_object(
  'total_places', (select count(*) from public.ew_places),
  'active_places', (select count(*) from public.ew_places where status = 'active'),
  'inactive_places', (select count(*) from public.ew_places where status = 'inactive'),
  'remediation_decisions', (select count(*) from public.ew_place_discovery_decisions where rule_version = 'foursquare-remediation-v1.0.0'),
  'include_decisions', (select count(*) from public.ew_place_discovery_decisions where rule_version = 'foursquare-remediation-v1.0.0' and decision = 'include'),
  'review_decisions', (select count(*) from public.ew_place_discovery_decisions where rule_version = 'foursquare-remediation-v1.0.0' and decision = 'review'),
  'excluded_decisions', (select count(*) from public.ew_place_discovery_decisions where rule_version = 'foursquare-remediation-v1.0.0' and decision = 'excluded')
) as remediation_summary;
`);
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : "Unknown remediation SQL generation error.");
  process.exitCode = 1;
});
