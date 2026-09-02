import type { FoursquareStagingDatabaseRow } from "./foursquare-sample.js";

export const foursquareStagingColumns = "ingestion_run_id,source_id,source_place_id,source_payload,source_updated_at,name,category_source_code,mapped_category_code,country_code,region,city,district,address,latitude,longitude,timezone,currency_code,website_url,phone_number,validation_status,validation_errors,normalized_name,dedupe_key";

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowSql(row: FoursquareStagingDatabaseRow): string {
  const values = [row.ingestion_run_id, row.source_id, row.source_place_id, row.source_payload === null ? null : JSON.stringify(row.source_payload), row.source_updated_at, row.name, row.category_source_code, row.mapped_category_code, row.country_code, row.region, row.city, row.district, row.address, row.latitude, row.longitude, row.timezone, row.currency_code, row.website_url, row.phone_number, row.validation_status, JSON.stringify(row.validation_errors), row.normalized_name, row.dedupe_key].map(sqlValue);
  values[3] = values[3] === "null" ? "null" : `${values[3]}::jsonb`;
  values[20] = `${values[20]}::jsonb`;
  return `(${values.join(",")})`;
}

export function foursquareStagingInsertSql(rows: readonly FoursquareStagingDatabaseRow[]): string {
  return `insert into public.ew_place_import_staging (${foursquareStagingColumns}) values\n${rows.map(rowSql).join(",\n")}\non conflict (ingestion_run_id, source_id, source_place_id) do nothing;\n`;
}
