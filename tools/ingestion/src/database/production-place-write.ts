import type {
  NormalizedStagingPlace,
  ProductionPlaceWrite,
} from "../types/index.js";
import { isValidLatitude, isValidLongitude } from "../normalization/location.js";

export function toProductionPlaceWrite(record: NormalizedStagingPlace): ProductionPlaceWrite {
  if (
    record.validationStatus !== "valid"
    || record.sourcePlaceId === null
    || record.name === null
    || record.countryCode === null
    || record.latitude === null
    || record.longitude === null
    || record.timezone === null
    || record.currencyCode === null
    || record.categoryMapping?.status !== "mapped"
    || record.categoryMapping.exploreWiseCategoryCode === null
    || !isValidLatitude(record.latitude)
    || !isValidLongitude(record.longitude)
    || !/^[A-Z]{2}$/.test(record.countryCode)
    || !/^[A-Z]{3}$/.test(record.currencyCode)
    || record.timezone.trim().length === 0
  ) {
    throw new Error("Only fully validated records with verified category mappings can become production places.");
  }

  return {
    sourceCode: record.sourceCode,
    sourcePlaceId: record.sourcePlaceId,
    name: record.name,
    categoryCode: record.categoryMapping.exploreWiseCategoryCode,
    countryCode: record.countryCode,
    region: record.region,
    city: record.city,
    district: record.district,
    address: record.address,
    latitude: record.latitude,
    longitude: record.longitude,
    timezone: record.timezone,
    currencyCode: record.currencyCode,
    websiteUrl: record.websiteUrl,
    phoneNumber: record.phoneNumber,
    sourceUpdatedAt: record.sourceUpdatedAt,
    status: "pending",
  };
}

/**
 * Parameterized write contract for a repository implementation. It resolves only
 * an existing ExploreWise category code, builds PostGIS geography in PostgreSQL,
 * and changes only source-backed columns for the same source identity.
 *
 * Parameters follow ProductionPlaceWrite in this order:
 * sourceCode, sourcePlaceId, name, categoryCode, countryCode, region, city,
 * district, address, longitude, latitude, timezone, currencyCode, websiteUrl,
 * phoneNumber, sourceUpdatedAt.
 */
export const UPSERT_VALIDATED_PLACE_SQL = `
insert into public.ew_places (
  source,
  source_place_id,
  name,
  category_id,
  country_code,
  region,
  city,
  district,
  address,
  location,
  timezone,
  default_currency,
  website_url,
  phone_number,
  status,
  source_updated_at
)
select
  $1,
  $2,
  $3,
  category.id,
  $5,
  $6,
  $7,
  $8,
  $9,
  extensions.st_setsrid(extensions.st_makepoint($10, $11), 4326)::extensions.geography,
  $12,
  $13,
  $14,
  $15,
  'pending',
  $16
from public.ew_categories as category
where category.code = $4
  and category.is_active
on conflict (source, source_place_id) do update
set
  name = excluded.name,
  category_id = excluded.category_id,
  country_code = excluded.country_code,
  region = excluded.region,
  city = excluded.city,
  district = excluded.district,
  address = excluded.address,
  location = excluded.location,
  timezone = excluded.timezone,
  default_currency = excluded.default_currency,
  website_url = excluded.website_url,
  phone_number = excluded.phone_number,
  source_updated_at = coalesce(excluded.source_updated_at, ew_places.source_updated_at)
where (
  ew_places.source_updated_at is null
  or excluded.source_updated_at is null
  or excluded.source_updated_at >= ew_places.source_updated_at
)
and row(
  ew_places.name,
  ew_places.category_id,
  ew_places.country_code,
  ew_places.region,
  ew_places.city,
  ew_places.district,
  ew_places.address,
  ew_places.location,
  ew_places.timezone,
  ew_places.default_currency,
  ew_places.website_url,
  ew_places.phone_number,
  ew_places.source_updated_at
) is distinct from row(
  excluded.name,
  excluded.category_id,
  excluded.country_code,
  excluded.region,
  excluded.city,
  excluded.district,
  excluded.address,
  excluded.location,
  excluded.timezone,
  excluded.default_currency,
  excluded.website_url,
  excluded.phone_number,
  coalesce(excluded.source_updated_at, ew_places.source_updated_at)
)
returning id, source, source_place_id;
`;
