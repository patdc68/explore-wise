export type PromotionDisposition = "eligible" | "review" | "excluded";

export type ExplicitDiscoveryDecision = "include" | "review" | "excluded" | null;

export interface PersistedPromotionRecord {
  validationStatus: "valid" | "review" | "invalid";
  mappedCategoryCode: string | null;
  categoryId: string | null;
  categoryActive: boolean;
  unresolvedFlags: readonly string[];
  dateClosed: string | null;
}

export function normalizePersistedFlags(flags: readonly string[]): readonly string[] {
  return [...new Set(flags.map((flag) => flag.trim().toLocaleLowerCase("und")).filter(Boolean))].sort();
}

/** Applies only persisted staging values; it never consults source taxonomy. */
export function classifyPersistedPromotion(
  record: PersistedPromotionRecord,
  explicitDiscoveryDecision: ExplicitDiscoveryDecision = null,
): PromotionDisposition {
  if (explicitDiscoveryDecision === "excluded") return "excluded";
  if (explicitDiscoveryDecision === "review") return "review";
  if (record.validationStatus !== "valid") return record.validationStatus === "invalid" ? "excluded" : "review";
  if (!record.mappedCategoryCode || !record.categoryId || !record.categoryActive) return "review";
  const flags = normalizePersistedFlags(record.unresolvedFlags);
  if (record.dateClosed || flags.includes("closed") || flags.includes("privatevenue")) return "excluded";
  return flags.length === 0 ? "eligible" : "review";
}

export type SourceUpdateDecision = "insert" | "update" | "unchanged" | "stale";

export function classifySourceUpdate(existingSourceUpdatedAt: string | null, stagedSourceUpdatedAt: string | null): SourceUpdateDecision {
  if (existingSourceUpdatedAt === null) return "insert";
  if (stagedSourceUpdatedAt === null) return "unchanged";
  return Date.parse(stagedSourceUpdatedAt) < Date.parse(existingSourceUpdatedAt) ? "stale" : "update";
}

export const PROMOTE_STAGED_PLACE_SQL = `
insert into public.ew_places (
  source, source_place_id, name, category_id, country_code, region, city,
  district, address, location, timezone, default_currency, website_url,
  phone_number, status, source_updated_at
)
select $1, $2, $3, category.id, $5, $6, $7, $8, $9,
  extensions.st_setsrid(extensions.st_makepoint($10, $11), 4326)::extensions.geography,
  $12, $13, $14, $15, 'active', $16
from public.ew_categories category
where category.code = $4 and category.is_active
  and not exists (
    select 1
    from public.ew_place_discovery_decisions as decision
    where decision.source = $1
      and decision.source_place_id = $2
      and decision.decision in ('review', 'excluded')
  )
on conflict (source, source_place_id) do update set
  name = excluded.name, category_id = excluded.category_id, country_code = excluded.country_code,
  region = excluded.region, city = excluded.city, district = excluded.district,
  address = excluded.address, location = excluded.location, timezone = excluded.timezone,
  default_currency = excluded.default_currency, website_url = excluded.website_url,
  phone_number = excluded.phone_number, status = 'active', source_updated_at = excluded.source_updated_at
where excluded.source_updated_at is not null
  and (ew_places.source_updated_at is null or excluded.source_updated_at >= ew_places.source_updated_at)
  and not exists (
    select 1
    from public.ew_place_discovery_decisions as decision
    where decision.source = excluded.source
      and decision.source_place_id = excluded.source_place_id
      and decision.decision in ('review', 'excluded')
  )
  and row(ew_places.name, ew_places.category_id, ew_places.country_code, ew_places.region,
    ew_places.city, ew_places.district, ew_places.address, ew_places.location, ew_places.timezone,
    ew_places.default_currency, ew_places.website_url, ew_places.phone_number, ew_places.status,
    ew_places.source_updated_at) is distinct from row(excluded.name, excluded.category_id,
    excluded.country_code, excluded.region, excluded.city, excluded.district, excluded.address,
    excluded.location, excluded.timezone, excluded.default_currency, excluded.website_url,
    excluded.phone_number, 'active', excluded.source_updated_at)
returning id;
`;
