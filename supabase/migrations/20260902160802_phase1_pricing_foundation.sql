-- Phase 1 pricing foundation. This migration introduces explicit, auditable
-- pricing evidence; it deliberately does not populate production place prices.

create table public.ew_chains (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_chains_code_format_check
    check (code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint ew_chains_name_not_blank_check
    check (btrim(name) <> ''),
  constraint ew_chains_country_code_format_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

create table public.ew_place_chain_memberships (
  place_id uuid primary key references public.ew_places (id) on delete cascade,
  chain_id uuid not null references public.ew_chains (id) on delete restrict,
  link_source text not null,
  source_reference_url text,
  source_reference_metadata jsonb not null default '{}'::jsonb,
  pricing_profile_applicable boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_place_chain_memberships_link_source_check
    check (link_source in ('official_website', 'merchant', 'licensed_provider', 'manual_review')),
  constraint ew_place_chain_memberships_reference_url_not_blank_check
    check (source_reference_url is null or btrim(source_reference_url) <> ''),
  constraint ew_place_chain_memberships_metadata_object_check
    check (jsonb_typeof(source_reference_metadata) = 'object')
);

alter table public.ew_place_prices
  drop constraint ew_place_prices_place_currency_key,
  alter column place_id drop not null,
  add column chain_id uuid references public.ew_chains (id) on delete cascade,
  add column pricing_status text not null default 'paid',
  add column pricing_unit text not null default 'per_person',
  add column pricing_source text not null default 'explorewise_estimate',
  add column price_precision text not null default 'estimated',
  add column confidence_level text not null default 'LOW',
  add column source_reference_url text,
  add column source_reference_id text,
  add column source_reference_metadata jsonb not null default '{}'::jsonb,
  add column valid_from timestamptz,
  add column valid_until timestamptz;

alter table public.ew_place_prices
  add constraint ew_place_prices_target_check
    check (num_nonnulls(place_id, chain_id) = 1),
  add constraint ew_place_prices_pricing_status_check
    check (pricing_status in ('free', 'paid')),
  add constraint ew_place_prices_pricing_unit_check
    check (pricing_unit in ('per_person', 'per_group', 'admission', 'fixed', 'free')),
  add constraint ew_place_prices_pricing_source_check
    check (pricing_source in ('official_menu', 'official_website', 'merchant', 'licensed_provider', 'chain_profile', 'explorewise_estimate')),
  add constraint ew_place_prices_price_precision_check
    check (price_precision in ('exact', 'derived', 'estimated')),
  add constraint ew_place_prices_confidence_level_check
    check (confidence_level in ('VERIFIED', 'HIGH', 'MEDIUM', 'LOW')),
  add constraint ew_place_prices_reference_url_not_blank_check
    check (source_reference_url is null or btrim(source_reference_url) <> ''),
  add constraint ew_place_prices_reference_id_not_blank_check
    check (source_reference_id is null or btrim(source_reference_id) <> ''),
  add constraint ew_place_prices_metadata_object_check
    check (jsonb_typeof(source_reference_metadata) = 'object'),
  add constraint ew_place_prices_validity_range_check
    check (valid_from is null or valid_until is null or valid_from <= valid_until),
  add constraint ew_place_prices_price_payload_check
    check (
      (pricing_status = 'free'
        and pricing_unit = 'free'
        and min_amount_minor = 0
        and max_amount_minor = 0)
      or
      (pricing_status = 'paid'
        and pricing_unit in ('per_person', 'per_group', 'admission', 'fixed')
        and min_amount_minor is not null
        and max_amount_minor is not null
        and min_amount_minor > 0
        and min_amount_minor <= max_amount_minor)
    ),
  add constraint ew_place_prices_verified_confidence_check
    check (
      confidence_level <> 'VERIFIED'
      or (price_precision = 'exact'
        and pricing_source in ('official_menu', 'official_website', 'merchant', 'licensed_provider'))
    );

comment on column public.ew_place_prices.average_per_person_minor is
  'Deprecated legacy field. Phase 1 budget logic uses min_amount_minor, max_amount_minor, and pricing_unit.';
comment on column public.ew_place_prices.confidence_score is
  'Deprecated legacy numeric field. Phase 1 budget logic uses confidence_level.';
comment on column public.ew_place_chain_memberships.pricing_profile_applicable is
  'Chain prices are eligible only when this explicitly verified flag is true.';

create index ew_place_chain_memberships_chain_id_idx
  on public.ew_place_chain_memberships (chain_id);

create index ew_place_prices_place_budget_lookup_idx
  on public.ew_place_prices (place_id, currency_code, pricing_unit, last_verified_at desc)
  where place_id is not null;

create index ew_place_prices_chain_budget_lookup_idx
  on public.ew_place_prices (chain_id, currency_code, pricing_unit, last_verified_at desc)
  where chain_id is not null;

create trigger ew_chains_set_updated_at
before update on public.ew_chains
for each row execute function public.ew_set_updated_at();

create trigger ew_place_chain_memberships_set_updated_at
before update on public.ew_place_chain_memberships
for each row execute function public.ew_set_updated_at();

alter table public.ew_chains enable row level security;
alter table public.ew_place_chain_memberships enable row level security;

revoke all on table public.ew_chains, public.ew_place_chain_memberships
from anon, authenticated;

grant select, insert, update, delete on table public.ew_chains, public.ew_place_chain_memberships
to service_role;


