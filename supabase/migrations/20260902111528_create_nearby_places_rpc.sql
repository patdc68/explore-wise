create or replace function public.ew_nearby_places(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 5000,
  p_category_codes text[] default null,
  p_result_limit integer default 30
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
  distance_meters double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  search_point extensions.geography;
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90 then
    raise exception using
      errcode = '22023',
      message = 'latitude must be between -90 and 90';
  end if;

  if p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception using
      errcode = '22023',
      message = 'longitude must be between -180 and 180';
  end if;

  if p_radius_meters is null or p_radius_meters <= 0 or p_radius_meters > 50000 then
    raise exception using
      errcode = '22023',
      message = 'radius_meters must be between 1 and 50000';
  end if;

  if p_result_limit is null or p_result_limit <= 0 or p_result_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'result_limit must be between 1 and 100';
  end if;

  if p_category_codes is not null and cardinality(p_category_codes) > 20 then
    raise exception using
      errcode = '22023',
      message = 'category_codes must contain at most 20 codes';
  end if;

  if p_category_codes is not null and exists (
    select 1
    from unnest(p_category_codes) as supplied_code(code)
    where code is null or btrim(code) = ''
  ) then
    raise exception using
      errcode = '22023',
      message = 'category_codes cannot contain null or blank codes';
  end if;

  -- ST_MakePoint takes X/longitude before Y/latitude. Geography distances are metres.
  search_point := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  return query
  select
    place.id as place_id,
    place.name,
    category.code as category_code,
    category.name as category_name,
    place.address,
    place.city,
    place.region,
    place.country_code,
    extensions.st_y(place.location::extensions.geometry) as latitude,
    extensions.st_x(place.location::extensions.geometry) as longitude,
    place.website_url,
    place.phone_number,
    extensions.st_distance(place.location, search_point) as distance_meters
  from public.ew_places as place
  join public.ew_categories as category
    on category.id = place.category_id
   and category.is_active
  where place.status = 'active'
    and extensions.st_dwithin(place.location, search_point, p_radius_meters)
    and (
      p_category_codes is null
      or cardinality(p_category_codes) = 0
      or category.code = any(p_category_codes)
    )
  order by extensions.st_distance(place.location, search_point), place.id
  limit p_result_limit;
end;
$$;

comment on function public.ew_nearby_places(
  double precision,
  double precision,
  integer,
  text[],
  integer
) is 'Public nearby-place discovery RPC. Distances are metres. Applies active place/category eligibility and bounded PostGIS geography search.';

revoke all on function public.ew_nearby_places(
  double precision,
  double precision,
  integer,
  text[],
  integer
) from public;

grant execute on function public.ew_nearby_places(
  double precision,
  double precision,
  integer,
  text[],
  integer
) to anon, authenticated;
