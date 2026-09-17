-- Preserve the ExploreWise category decision made during ingestion. Historical
-- staging rows intentionally remain NULL and are never inferred or rewritten.
alter table public.ew_place_import_staging
  add column mapped_category_code text;

alter table public.ew_place_import_staging
  add constraint ew_place_import_staging_mapped_category_code_fkey
  foreign key (mapped_category_code)
  references public.ew_categories (code)
  on update restrict
  on delete restrict;
