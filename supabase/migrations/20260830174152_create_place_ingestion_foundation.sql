-- Provenance-preserving place ingestion foundation.
create table public.ew_data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  source_type text not null,
  website_url text,
  license_name text,
  license_url text,
  attribution_text text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_data_sources_code_format_check
    check (code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint ew_data_sources_name_not_blank_check
    check (btrim(name) <> ''),
  constraint ew_data_sources_source_type_check
    check (source_type in ('open_data', 'api', 'merchant', 'admin', 'community', 'internal')),
  constraint ew_data_sources_website_url_not_blank_check
    check (website_url is null or btrim(website_url) <> ''),
  constraint ew_data_sources_license_name_not_blank_check
    check (license_name is null or btrim(license_name) <> ''),
  constraint ew_data_sources_license_url_not_blank_check
    check (license_url is null or btrim(license_url) <> ''),
  constraint ew_data_sources_attribution_text_not_blank_check
    check (attribution_text is null or btrim(attribution_text) <> '')
);

create table public.ew_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ew_data_sources (id) on delete restrict,
  region_code text,
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_received integer not null default 0,
  records_valid integer not null default 0,
  records_rejected integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_unchanged integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint ew_ingestion_runs_id_source_key unique (id, source_id),
  constraint ew_ingestion_runs_region_code_format_check
    check (region_code is null or region_code ~ '^[A-Z0-9]{2,}(?:-[A-Z0-9]{1,})*$'),
  constraint ew_ingestion_runs_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'partial')),
  constraint ew_ingestion_runs_completed_at_check
    check (completed_at is null or completed_at >= started_at),
  constraint ew_ingestion_runs_records_received_check check (records_received >= 0),
  constraint ew_ingestion_runs_records_valid_check check (records_valid >= 0),
  constraint ew_ingestion_runs_records_rejected_check check (records_rejected >= 0),
  constraint ew_ingestion_runs_records_inserted_check check (records_inserted >= 0),
  constraint ew_ingestion_runs_records_updated_check check (records_updated >= 0),
  constraint ew_ingestion_runs_records_unchanged_check check (records_unchanged >= 0),
  constraint ew_ingestion_runs_error_count_check check (error_count >= 0),
  constraint ew_ingestion_runs_received_totals_check
    check (records_valid + records_rejected <= records_received),
  constraint ew_ingestion_runs_valid_totals_check
    check (records_inserted + records_updated + records_unchanged <= records_valid),
  constraint ew_ingestion_runs_metadata_object_check
    check (metadata is null or jsonb_typeof(metadata) = 'object')
);

create table public.ew_place_import_staging (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null,
  source_id uuid not null references public.ew_data_sources (id) on delete restrict,
  source_place_id text,
  source_payload jsonb,
  source_updated_at timestamptz,
  name text,
  category_source_code text,
  country_code text,
  region text,
  city text,
  district text,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  timezone text,
  currency_code text,
  website_url text,
  phone_number text,
  validation_status text not null default 'pending',
  validation_errors jsonb,
  normalized_name text,
  dedupe_key text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ew_place_import_staging_run_source_fkey
    foreign key (ingestion_run_id, source_id)
    references public.ew_ingestion_runs (id, source_id)
    on delete cascade,
  constraint ew_place_import_staging_run_source_identity_key
    unique (ingestion_run_id, source_id, source_place_id),
  constraint ew_place_import_staging_source_place_id_not_blank_check
    check (source_place_id is null or btrim(source_place_id) <> ''),
  constraint ew_place_import_staging_name_not_blank_check
    check (name is null or btrim(name) <> ''),
  constraint ew_place_import_staging_country_code_format_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint ew_place_import_staging_currency_code_format_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint ew_place_import_staging_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint ew_place_import_staging_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint ew_place_import_staging_validation_status_check
    check (validation_status in ('pending', 'valid', 'invalid', 'review', 'processed')),
  constraint ew_place_import_staging_validation_errors_array_check
    check (validation_errors is null or jsonb_typeof(validation_errors) = 'array'),
  constraint ew_place_import_staging_valid_record_check
    check (
      validation_status <> 'valid'
      or (
        source_place_id is not null
        and name is not null
        and country_code is not null
        and latitude is not null
        and longitude is not null
        and normalized_name is not null
        and dedupe_key is not null
        and (validation_errors is null or validation_errors = '[]'::jsonb)
      )
    )
);

create index ew_ingestion_runs_source_started_at_idx
  on public.ew_ingestion_runs (source_id, started_at desc);

create index ew_ingestion_runs_status_idx
  on public.ew_ingestion_runs (status);

create index ew_place_import_staging_run_status_idx
  on public.ew_place_import_staging (ingestion_run_id, validation_status);

create index ew_place_import_staging_source_identity_idx
  on public.ew_place_import_staging (source_id, source_place_id);

create index ew_place_import_staging_dedupe_key_idx
  on public.ew_place_import_staging (dedupe_key)
  where dedupe_key is not null;

create trigger ew_data_sources_set_updated_at
before update on public.ew_data_sources
for each row execute function public.ew_set_updated_at();

alter table public.ew_data_sources enable row level security;
alter table public.ew_ingestion_runs enable row level security;
alter table public.ew_place_import_staging enable row level security;

revoke all on table
  public.ew_data_sources,
  public.ew_ingestion_runs,
  public.ew_place_import_staging
from anon, authenticated;

grant select, insert, update, delete on table
  public.ew_data_sources,
  public.ew_ingestion_runs,
  public.ew_place_import_staging
to service_role;

revoke truncate, references, trigger on table
  public.ew_data_sources,
  public.ew_ingestion_runs,
  public.ew_place_import_staging
from service_role;

insert into public.ew_data_sources (
  code,
  name,
  source_type,
  website_url,
  license_name,
  license_url,
  attribution_text
)
values (
  'foursquare_os',
  'Foursquare Open Source Places',
  'open_data',
  null,
  null,
  null,
  null
)
on conflict (code) do nothing;
