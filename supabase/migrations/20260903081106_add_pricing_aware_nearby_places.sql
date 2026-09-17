-- Additive Phase 1 effective-price resolution. The function intentionally returns no stale evidence and does not alter the existing nearby RPC.
create or replace function public.ew_nearby_places_priced(
  p_latitude double precision, p_longitude double precision, p_radius_meters integer default 5000, p_category_codes text[] default null, p_result_limit integer default 30, p_budget_minor integer default null, p_party_size integer default 1
) returns table (
  place_id uuid, name text, category_code text, category_name text, address text, city text, region text, country_code text, latitude double precision, longitude double precision, website_url text, phone_number text, distance_meters double precision, has_price boolean, pricing_basis text, pricing_status text, pricing_unit text, min_amount_minor integer, max_amount_minor integer, currency_code text, confidence_level text, price_precision text, pricing_channel text, price_source_label text, last_verified_at timestamptz, effective_price_source text, budget_status text, estimated_group_min_minor integer, estimated_group_max_minor integer
) language plpgsql stable security definer set search_path = '' as $$
declare search_point extensions.geography;
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90 then raise exception using errcode = '22023', message = 'latitude must be between -90 and 90'; end if;
  if p_longitude is null or p_longitude < -180 or p_longitude > 180 then raise exception using errcode = '22023', message = 'longitude must be between -180 and 180'; end if;
  if p_radius_meters is null or p_radius_meters <= 0 or p_radius_meters > 50000 then raise exception using errcode = '22023', message = 'radius_meters must be between 1 and 50000'; end if;
  if p_result_limit is null or p_result_limit <= 0 or p_result_limit > 100 then raise exception using errcode = '22023', message = 'result_limit must be between 1 and 100'; end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 100 then raise exception using errcode = '22023', message = 'party_size must be between 1 and 100'; end if;
  if p_budget_minor is not null and p_budget_minor < 0 then raise exception using errcode = '22023', message = 'budget_minor must be non-negative'; end if;
  search_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  return query
  with eligible as (
    select p.*, c.code as resolved_category_code, c.name as resolved_category_name, extensions.st_distance(p.location, search_point) as resolved_distance
    from public.ew_places p join public.ew_categories c on c.id=p.category_id and c.is_active
    where p.status='active' and extensions.st_dwithin(p.location, search_point, p_radius_meters)
      and (p_category_codes is null or cardinality(p_category_codes)=0 or c.code=any(p_category_codes))
  ), resolved as (
    select e.*, ep.id as price_id, ep.pricing_basis as resolved_basis, ep.pricing_status as resolved_status, ep.pricing_unit as resolved_unit, ep.min_amount_minor as resolved_min, ep.max_amount_minor as resolved_max, ep.currency_code as resolved_currency, ep.confidence_level as resolved_confidence, ep.price_precision as resolved_precision, ep.pricing_channel as resolved_channel, ep.last_verified_at as resolved_verified, source_scope
    from eligible e left join lateral (
      select q.*, q.scope as source_scope from (
        select pp.*, 'branch'::text as scope, 1 as precedence from public.ew_place_prices pp where pp.place_id=e.id and pp.pricing_basis='branch_verified'
        union all select pp.*, 'place'::text, 2 from public.ew_place_prices pp where pp.place_id=e.id and pp.pricing_basis='place_reference'
        union all select pp.*, 'brand'::text, 3 from public.ew_place_chain_memberships m join public.ew_place_prices pp on pp.chain_id=m.chain_id where m.place_id=e.id and m.identity_status='CONFIRMED_CHAIN' and m.pricing_profile_applicable and pp.pricing_basis='brand_reference'
      ) q where q.last_verified_at >= now() - interval '90 days' and (q.valid_from is null or q.valid_from <= now()) and (q.valid_until is null or q.valid_until >= now()) order by q.precedence, q.last_verified_at desc, q.id limit 1
    ) ep on true
  ), budgeted as (
    select r.*, case when price_id is null then null when resolved_unit in ('per_person','admission') then resolved_min*p_party_size else resolved_min end as group_min, case when price_id is null then null when resolved_unit in ('per_person','admission') then resolved_max*p_party_size else resolved_max end as group_max from resolved r
  ), classified as (
    select b.*, case when price_id is null or p_budget_minor is null then 'unknown' when group_max <= p_budget_minor then case when resolved_basis='branch_verified' then 'fits' else 'likely_fits' end when group_min > p_budget_minor then case when resolved_basis='branch_verified' then 'exceeds' else 'likely_exceeds' end else 'may_exceed' end as resolved_budget_status from budgeted b
  )
  select place_id, name, resolved_category_code, resolved_category_name, address, city, region, country_code, extensions.st_y(location::extensions.geometry), extensions.st_x(location::extensions.geometry), website_url, phone_number, resolved_distance, price_id is not null, resolved_basis, resolved_status, resolved_unit, resolved_min, resolved_max, resolved_currency, resolved_confidence, resolved_precision, resolved_channel, case when price_id is null then 'Price not available yet' when resolved_status='free' then 'Free' when resolved_basis='branch_verified' then 'Verified price' when resolved_basis='brand_reference' then 'Official brand reference' else 'Official menu reference' end, resolved_verified, source_scope, resolved_budget_status, group_min, group_max
  from classified
  order by case when p_budget_minor is null then 0 when resolved_budget_status in ('fits','likely_fits') then 1 when resolved_budget_status='may_exceed' then 2 when resolved_budget_status='unknown' then 3 else 4 end, resolved_distance, place_id limit p_result_limit;
end; $$;
revoke all on function public.ew_nearby_places_priced(double precision, double precision, integer, text[], integer, integer, integer) from public;
grant execute on function public.ew_nearby_places_priced(double precision, double precision, integer, text[], integer, integer, integer) to anon, authenticated;
