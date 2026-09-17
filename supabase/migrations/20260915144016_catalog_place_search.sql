create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.ew_normalize_catalog_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(coalesce(p_value, ''))),
        '[''`â€™]+',
        '',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function public.ew_normalize_catalog_text(text) from public, anon, authenticated;

create index ew_places_active_normalized_name_trgm_idx
  on public.ew_places
  using gin (public.ew_normalize_catalog_text(name) extensions.gin_trgm_ops)
  where status = 'active';

create or replace function public.ew_search_catalog_places(
  p_query text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_locality_hint text default null,
  p_result_limit integer default 20,
  p_budget_minor integer default null,
  p_party_size integer default 1
)
returns table (
  place_id uuid,
  name text,
  category_code text,
  category_name text,
  address text,
  city text,
  region text,
  country_code text,
  latitude double precision,
  longitude double precision,
  website_url text,
  phone_number text,
  distance_meters double precision,
  has_price boolean,
  pricing_basis text,
  pricing_status text,
  pricing_unit text,
  min_amount_minor bigint,
  max_amount_minor bigint,
  currency_code text,
  confidence_level text,
  price_precision text,
  pricing_channel text,
  price_source_label text,
  last_verified_at timestamptz,
  effective_price_source text,
  budget_status text,
  estimated_group_min_minor bigint,
  estimated_group_max_minor bigint,
  name_match_score double precision,
  locality_match_score double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := public.ew_normalize_catalog_text(p_query);
  normalized_locality text := public.ew_normalize_catalog_text(p_locality_hint);
  search_point extensions.geography;
begin
  if normalized_query = '' or char_length(normalized_query) > 160 then
    raise exception using
      errcode = '22023',
      message = 'query must contain between 1 and 160 searchable characters';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception using
      errcode = '22023',
      message = 'latitude and longitude must be supplied together';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception using
      errcode = '22023',
      message = 'latitude must be between -90 and 90';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception using
      errcode = '22023',
      message = 'longitude must be between -180 and 180';
  end if;

  if p_result_limit is null or p_result_limit < 1 or p_result_limit > 30 then
    raise exception using
      errcode = '22023',
      message = 'result_limit must be between 1 and 30';
  end if;

  if p_party_size is null or p_party_size < 1 or p_party_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'party_size must be between 1 and 100';
  end if;

  if p_budget_minor is not null and p_budget_minor < 0 then
    raise exception using
      errcode = '22023',
      message = 'budget_minor must be non-negative';
  end if;

  if p_latitude is not null then
    search_point := extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude),
      4326
    )::extensions.geography;
  end if;

  return query
  with input as (
    select
      normalized_query as query_text,
      nullif(normalized_locality, '') as locality_text
  ), name_candidates as (
    select
      place.*,
      category.code as resolved_category_code,
      category.name as resolved_category_name,
      public.ew_normalize_catalog_text(place.name) as normalized_name,
      public.ew_normalize_catalog_text(
        concat_ws(' ', place.city, place.district, place.region, place.country_code, place.address)
      ) as normalized_location,
      public.ew_normalize_catalog_text(place.city) as normalized_city
    from public.ew_places as place
    left join public.ew_categories as category
      on category.id = place.category_id
     and category.is_active
    cross join input
    where place.status = 'active'
      and (
        public.ew_normalize_catalog_text(place.name) = input.query_text
        or (
          char_length(input.query_text) >= 2
          and public.ew_normalize_catalog_text(place.name) like '%' || input.query_text || '%'
        )
        or (
          char_length(input.query_text) >= 4
          and public.ew_normalize_catalog_text(place.name) operator(extensions.%) input.query_text
          and extensions.similarity(public.ew_normalize_catalog_text(place.name), input.query_text) >= 0.32
        )
      )
  ), scored as (
    select
      candidate.*,
      case
        when candidate.normalized_name = input.query_text then 1.0
        when candidate.normalized_name like input.query_text || '%' then 0.97
        when candidate.normalized_name like '%' || input.query_text || '%' then 0.93
        else greatest(
          extensions.similarity(candidate.normalized_name, input.query_text),
          extensions.word_similarity(input.query_text, candidate.normalized_name) * 0.90
        )
      end::double precision as resolved_name_score,
      case
        when input.locality_text is null then 0.0
        when candidate.normalized_city = input.locality_text then 1.0
        when candidate.normalized_city <> '' and (
          candidate.normalized_city like '%' || input.locality_text || '%'
          or input.locality_text like '%' || candidate.normalized_city || '%'
        ) then 0.95
        when candidate.normalized_location like '%' || input.locality_text || '%' then 0.85
        else greatest(
          extensions.similarity(candidate.normalized_city, input.locality_text),
          extensions.word_similarity(input.locality_text, candidate.normalized_location) * 0.75
        )
      end::double precision as resolved_locality_score,
      case
        when search_point is null then null
        else extensions.st_distance(candidate.location, search_point)
      end as resolved_distance
    from name_candidates as candidate
    cross join input
  ), shortlist as (
    select scored.*
    from scored
    order by
      (
        scored.resolved_name_score
        + case when nullif(normalized_locality, '') is null then 0 else scored.resolved_locality_score * 0.20 end
      ) desc,
      scored.resolved_name_score desc,
      scored.resolved_distance asc nulls last,
      scored.id
    limit p_result_limit
  ), resolved as (
    select
      candidate.*,
      effective_price.id as price_id,
      effective_price.pricing_basis as resolved_basis,
      effective_price.pricing_status as resolved_status,
      effective_price.pricing_unit as resolved_unit,
      effective_price.min_amount_minor as resolved_min,
      effective_price.max_amount_minor as resolved_max,
      effective_price.currency_code as resolved_currency,
      effective_price.confidence_level as resolved_confidence,
      effective_price.price_precision as resolved_precision,
      effective_price.pricing_channel as resolved_channel,
      effective_price.last_verified_at as resolved_verified,
      effective_price.source_scope
    from shortlist as candidate
    left join lateral (
      select priced.*, priced.scope as source_scope
      from (
        select price.*, 'branch'::text as scope, 1 as precedence
        from public.ew_place_prices as price
        where price.place_id = candidate.id
          and price.pricing_basis = 'branch_verified'
        union all
        select price.*, 'place'::text, 2
        from public.ew_place_prices as price
        where price.place_id = candidate.id
          and price.pricing_basis = 'place_reference'
        union all
        select price.*, 'brand'::text, 3
        from public.ew_place_chain_memberships as membership
        join public.ew_place_prices as price
          on price.chain_id = membership.chain_id
        where membership.place_id = candidate.id
          and membership.identity_status = 'CONFIRMED_CHAIN'
          and membership.pricing_profile_applicable
          and price.pricing_basis = 'brand_reference'
      ) as priced
      where priced.last_verified_at >= now() - interval '90 days'
        and (priced.valid_from is null or priced.valid_from <= now())
        and (priced.valid_until is null or priced.valid_until >= now())
      order by priced.precedence, priced.last_verified_at desc, priced.id
      limit 1
    ) as effective_price on true
  ), calculated as (
    select
      resolved.*,
      case
        when resolved.price_id is null then null
        when resolved.resolved_unit in ('per_person', 'admission') then resolved.resolved_min * p_party_size
        else resolved.resolved_min
      end as group_min,
      case
        when resolved.price_id is null then null
        when resolved.resolved_unit in ('per_person', 'admission') then resolved.resolved_max * p_party_size
        else resolved.resolved_max
      end as group_max
    from resolved
  )
  select
    result.id,
    result.name,
    result.resolved_category_code,
    result.resolved_category_name,
    result.address,
    result.city,
    result.region,
    result.country_code,
    extensions.st_y(result.location::extensions.geometry),
    extensions.st_x(result.location::extensions.geometry),
    result.website_url,
    result.phone_number,
    result.resolved_distance,
    result.price_id is not null,
    result.resolved_basis,
    result.resolved_status,
    result.resolved_unit,
    result.resolved_min,
    result.resolved_max,
    result.resolved_currency,
    result.resolved_confidence,
    result.resolved_precision,
    result.resolved_channel,
    case
      when result.price_id is null then 'Price not available yet'
      when result.resolved_status = 'free' then 'Free'
      when result.resolved_basis = 'branch_verified' then 'Verified price'
      when result.resolved_basis = 'brand_reference' then 'Official brand reference'
      else 'Official menu reference'
    end,
    result.resolved_verified,
    result.source_scope,
    case
      when result.price_id is null or p_budget_minor is null then 'unknown'
      when result.group_max <= p_budget_minor then
        case when result.resolved_basis = 'branch_verified' then 'fits' else 'likely_fits' end
      when result.group_min > p_budget_minor then
        case when result.resolved_basis = 'branch_verified' then 'exceeds' else 'likely_exceeds' end
      else 'may_exceed'
    end,
    result.group_min,
    result.group_max,
    result.resolved_name_score,
    result.resolved_locality_score
  from calculated as result
  order by
    (
      result.resolved_name_score
      + case when nullif(normalized_locality, '') is null then 0 else result.resolved_locality_score * 0.20 end
    ) desc,
    result.resolved_name_score desc,
    result.resolved_distance asc nulls last,
    result.id;
end;
$$;

comment on function public.ew_search_catalog_places(
  text,
  double precision,
  double precision,
  text,
  integer,
  integer,
  integer
) is 'Bounded active-catalog place-name search. Name and locality matching are punctuation-, case-, and accent-insensitive; optional price and category data never control existence.';

revoke all on function public.ew_search_catalog_places(
  text,
  double precision,
  double precision,
  text,
  integer,
  integer,
  integer
) from public;

grant execute on function public.ew_search_catalog_places(
  text,
  double precision,
  double precision,
  text,
  integer,
  integer,
  integer
) to anon, authenticated;
