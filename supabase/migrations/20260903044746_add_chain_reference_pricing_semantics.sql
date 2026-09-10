-- Pending application. Models evidence scope independently from provenance.
-- A brand can have two locations or two thousand; place references need no
-- brand membership. This migration deliberately contains no data.

alter table public.ew_place_chain_memberships
  add column identity_status text not null default 'CONFIRMED_CHAIN';

alter table public.ew_place_chain_memberships
  add constraint ew_place_chain_memberships_identity_status_check
    check (identity_status in ('CONFIRMED_CHAIN', 'UNRESOLVED', 'REJECTED')),
  add constraint ew_place_chain_memberships_profile_requires_confirmed_chain_check
    check (not pricing_profile_applicable or identity_status = 'CONFIRMED_CHAIN');

comment on column public.ew_place_chain_memberships.identity_status is
  'Only CONFIRMED_CHAIN memberships may inherit a brand_reference price.';
comment on table public.ew_chains is
  'Historical name retained for the brand/merchant grouping used by reference pricing. It may represent a merchant with any number of locations.';
comment on table public.ew_place_chain_memberships is
  'Historical name retained for confirmed place-to-brand memberships; membership is required only for brand_reference pricing.';

alter table public.ew_place_prices
  add column pricing_basis text not null default 'branch_verified',
  add column pricing_channel text not null default 'unknown',
  add column derivation_version text;

alter table public.ew_place_prices
  add constraint ew_place_prices_pricing_basis_check
    check (pricing_basis in ('branch_verified', 'brand_reference', 'place_reference')),
  add constraint ew_place_prices_pricing_channel_check
    check (pricing_channel in ('dine_in', 'pickup', 'official_delivery', 'unspecified_official', 'unknown')),
  add constraint ew_place_prices_derivation_version_not_blank_check
    check (derivation_version is null or btrim(derivation_version) <> ''),
  add constraint ew_place_prices_basis_target_check
    check (
      (pricing_basis = 'branch_verified' and place_id is not null and chain_id is null)
      or (pricing_basis = 'brand_reference' and chain_id is not null and place_id is null)
      or (pricing_basis = 'place_reference' and place_id is not null and chain_id is null)
    ),
  add constraint ew_place_prices_reference_evidence_check
    check (
      pricing_basis = 'branch_verified'
      or (
        pricing_source in ('official_menu', 'official_website', 'merchant')
        and price_precision = 'derived'
        and confidence_level = 'HIGH'
        and derivation_version is not null
        and pricing_channel <> 'unknown'
        and source_reference_url is not null
      )
    ),
  add constraint ew_place_prices_branch_verified_evidence_check
    check (
      pricing_basis <> 'branch_verified'
      or (
        pricing_source in ('official_menu', 'official_website', 'merchant', 'licensed_provider')
        and price_precision = 'exact'
        and confidence_level = 'VERIFIED'
      )
    );

comment on column public.ew_place_prices.pricing_basis is
  'branch_verified is exact evidence for one place; brand_reference is reusable official brand pricing; place_reference is derived from one place''s official menu.';
comment on column public.ew_place_prices.pricing_channel is
  'Merchant-reported ordering context. official_delivery must never be presented as dine-in.';
comment on column public.ew_place_prices.derivation_version is
  'Required for derived references so the deterministic normal-order rule is auditable.';

create index ew_place_chain_memberships_resolvable_profile_idx
  on public.ew_place_chain_memberships (chain_id, place_id)
  where identity_status = 'CONFIRMED_CHAIN' and pricing_profile_applicable;
