-- Re-apply the qualified v2 implementation with ew_places.id exposed as the
-- function's place_id return column. This is intentionally self-contained:
-- Supabase migrations cannot include another migration file.
create or replace function public.ew_nearby_places_priced(p_latitude double precision,p_longitude double precision,p_radius_meters integer default 5000,p_category_codes text[] default null,p_result_limit integer default 30,p_budget_minor integer default null,p_party_size integer default 1)
returns table(place_id uuid,name text,category_code text,category_name text,address text,city text,region text,country_code text,latitude double precision,longitude double precision,website_url text,phone_number text,distance_meters double precision,has_price boolean,pricing_basis text,pricing_status text,pricing_unit text,min_amount_minor integer,max_amount_minor integer,currency_code text,confidence_level text,price_precision text,pricing_channel text,price_source_label text,last_verified_at timestamptz,effective_price_source text,budget_status text,estimated_group_min_minor integer,estimated_group_max_minor integer)
language plpgsql stable security definer set search_path='' as $$
declare search_point extensions.geography;
begin
 if p_latitude is null or p_latitude<-90 or p_latitude>90 then raise exception using errcode='22023',message='latitude must be between -90 and 90'; end if;
 if p_longitude is null or p_longitude<-180 or p_longitude>180 then raise exception using errcode='22023',message='longitude must be between -180 and 180'; end if;
 if p_radius_meters is null or p_radius_meters<=0 or p_radius_meters>50000 then raise exception using errcode='22023',message='radius_meters must be between 1 and 50000'; end if;
 if p_result_limit is null or p_result_limit<=0 or p_result_limit>100 then raise exception using errcode='22023',message='result_limit must be between 1 and 100'; end if;
 if p_party_size is null or p_party_size<1 or p_party_size>100 then raise exception using errcode='22023',message='party_size must be between 1 and 100'; end if;
 if p_budget_minor is not null and p_budget_minor<0 then raise exception using errcode='22023',message='budget_minor must be non-negative'; end if;
 search_point:=extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography;
 return query with candidates as (
  select p.*,cat.code cat_code,cat.name cat_name,extensions.st_distance(p.location,search_point) dist
  from public.ew_places p join public.ew_categories cat on cat.id=p.category_id and cat.is_active
  where p.status='active' and extensions.st_dwithin(p.location,search_point,p_radius_meters) and (p_category_codes is null or cardinality(p_category_codes)=0 or cat.code=any(p_category_codes))
 ), resolved as (
  select x.*,v.id price_id,v.pricing_basis basis,v.pricing_status status,v.pricing_unit unit,v.min_amount_minor min_amount,v.max_amount_minor max_amount,v.currency_code currency,v.confidence_level confidence,v.price_precision resolved_precision,v.pricing_channel channel,v.last_verified_at verified,v.scope
  from candidates x left join lateral (
   select z.*,z.scope from (
    select pp.*,'branch'::text scope,1 precedence from public.ew_place_prices pp where pp.place_id=x.id and pp.pricing_basis='branch_verified'
    union all select pp.*,'place'::text,2 from public.ew_place_prices pp where pp.place_id=x.id and pp.pricing_basis='place_reference'
    union all select pp.*,'brand'::text,3 from public.ew_place_chain_memberships m join public.ew_place_prices pp on pp.chain_id=m.chain_id where m.place_id=x.id and m.identity_status='CONFIRMED_CHAIN' and m.pricing_profile_applicable and pp.pricing_basis='brand_reference'
   ) z where z.last_verified_at>=now()-interval '90 days' and (z.valid_from is null or z.valid_from<=now()) and (z.valid_until is null or z.valid_until>=now()) order by z.precedence,z.last_verified_at desc,z.id limit 1
  ) v on true
 ), calculated as (
  select r.*,case when price_id is null then null when unit in('per_person','admission')then min_amount*p_party_size else min_amount end group_min,case when price_id is null then null when unit in('per_person','admission')then max_amount*p_party_size else max_amount end group_max from resolved r
 ), ranked as (
  select k.*,case when price_id is null or p_budget_minor is null then 'unknown' when group_max<=p_budget_minor then case when basis='branch_verified' then 'fits' else 'likely_fits' end when group_min>p_budget_minor then case when basis='branch_verified' then 'exceeds' else 'likely_exceeds' end else 'may_exceed' end budget from calculated k
 )
 select r.id,r.name,r.cat_code,r.cat_name,r.address,r.city,r.region,r.country_code,extensions.st_y(r.location::extensions.geometry),extensions.st_x(r.location::extensions.geometry),r.website_url,r.phone_number,r.dist,r.price_id is not null,r.basis,r.status,r.unit,r.min_amount,r.max_amount,r.currency,r.confidence,r.resolved_precision,r.channel,case when r.price_id is null then 'Price not available yet' when r.status='free' then 'Free' when r.basis='branch_verified' then 'Verified price' when r.basis='brand_reference' then 'Official brand reference' else 'Official menu reference' end,r.verified,r.scope,r.budget,r.group_min,r.group_max
 from ranked r order by case when p_budget_minor is null then 0 when r.budget in('fits','likely_fits')then 1 when r.budget='may_exceed'then 2 when r.budget='unknown'then 3 else 4 end,r.dist,r.id limit p_result_limit;
end; $$;
