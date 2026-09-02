-- Supports referential checks and future snapshot-based promotion lookups
-- without indexing legacy NULL values.
create index ew_place_import_staging_mapped_category_code_idx
  on public.ew_place_import_staging (mapped_category_code)
  where mapped_category_code is not null;
