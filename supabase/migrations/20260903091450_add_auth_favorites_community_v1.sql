-- Phase 1 accounts, persistent favorites, and community visit evidence.
-- Community reports are deliberately separate from ew_place_prices; the price
-- resolution and budget RPCs continue to use official/reference evidence only.

create or replace function public.ew_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ew_profiles (id, display_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.ew_handle_new_user() from public, anon, authenticated;

drop trigger if exists ew_auth_user_profile_bootstrap on auth.users;
create trigger ew_auth_user_profile_bootstrap
  after insert on auth.users
  for each row execute function public.ew_handle_new_user();

grant insert on table public.ew_profiles to authenticated;

create policy ew_profiles_insert_own
on public.ew_profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create table public.ew_place_visit_reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.ew_places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint,
  total_spend_minor bigint,
  party_size integer,
  currency_code text not null default 'PHP',
  spend_per_person_minor bigint generated always as (
    case
      when total_spend_minor is not null and party_size is not null then total_spend_minor / party_size
      else null
    end
  ) stored,
  visit_type text,
  visit_date date not null,
  short_note text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_place_visit_reports_rating_check check (rating is null or rating between 1 and 5),
  constraint ew_place_visit_reports_total_spend_check check (total_spend_minor is null or total_spend_minor >= 0),
  constraint ew_place_visit_reports_party_size_check check (party_size is null or party_size > 0),
  constraint ew_place_visit_reports_spend_party_pair_check check (
    (total_spend_minor is null and party_size is null)
    or (total_spend_minor is not null and party_size is not null)
  ),
  constraint ew_place_visit_reports_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint ew_place_visit_reports_visit_type_check check (
    visit_type is null or visit_type in ('dine_in', 'pickup', 'delivery', 'activity', 'admission', 'other')
  ),
  constraint ew_place_visit_reports_status_check check (status in ('active', 'withdrawn', 'rejected')),
  constraint ew_place_visit_reports_note_length_check check (short_note is null or char_length(short_note) <= 500)
);

create index ew_place_visit_reports_place_status_date_idx
  on public.ew_place_visit_reports (place_id, status, visit_date desc);

create index ew_place_visit_reports_user_id_idx
  on public.ew_place_visit_reports (user_id);

create unique index ew_place_visit_reports_one_active_visit_per_day_idx
  on public.ew_place_visit_reports (place_id, user_id, visit_date)
  where status = 'active';

create or replace function public.ew_validate_place_visit_report()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.visit_date > current_date + 1 then
    raise exception using errcode = '22023', message = 'visit_date cannot be in the future';
  end if;
  return new;
end;
$$;

revoke all on function public.ew_validate_place_visit_report() from public, anon, authenticated;
grant execute on function public.ew_validate_place_visit_report() to service_role;

create trigger ew_place_visit_reports_validate
before insert or update on public.ew_place_visit_reports
for each row execute function public.ew_validate_place_visit_report();

create trigger ew_place_visit_reports_set_updated_at
before update on public.ew_place_visit_reports
for each row execute function public.ew_set_updated_at();

alter table public.ew_place_visit_reports enable row level security;
revoke all on table public.ew_place_visit_reports from anon, authenticated;
grant select, insert, update, delete on table public.ew_place_visit_reports to authenticated;
grant select, insert, update, delete on table public.ew_place_visit_reports to service_role;

create policy ew_place_visit_reports_read_own
on public.ew_place_visit_reports
for select to authenticated
using ((select auth.uid()) = user_id);

create policy ew_place_visit_reports_insert_own
on public.ew_place_visit_reports
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.ew_places where id = place_id and status = 'active')
);

create policy ew_place_visit_reports_update_own
on public.ew_place_visit_reports
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy ew_place_visit_reports_delete_own
on public.ew_place_visit_reports
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Centralized freshness setting for community spend aggregation. Rating
-- aggregates intentionally retain all active ratings; spending uses recent evidence.
create or replace function public.ew_community_spend_freshness_days()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 180 $$;

revoke all on function public.ew_community_spend_freshness_days() from public, anon, authenticated;

create or replace function public.ew_place_community_aggregates(p_place_ids uuid[])
returns table (
  place_id uuid,
  rating_count bigint,
  average_rating numeric,
  spend_report_count bigint,
  median_spend_per_person_minor bigint,
  latest_report_at timestamptz,
  community_spend_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select distinct input_place_id as place_id
    from unnest(coalesce(p_place_ids, array[]::uuid[])) as input_place_id
    join public.ew_places p on p.id = input_place_id and p.status = 'active'
    limit 100
  ), ratings as (
    select r.place_id, count(*)::bigint as rating_count,
      round(avg(r.rating)::numeric, 1) as average_rating
    from public.ew_place_visit_reports r
    join requested q on q.place_id = r.place_id
    where r.status = 'active' and r.rating is not null
    group by r.place_id
  ), recent_spend as (
    select r.place_id, r.spend_per_person_minor, r.created_at
    from public.ew_place_visit_reports r
    join requested q on q.place_id = r.place_id
    where r.status = 'active'
      and r.total_spend_minor is not null
      and r.party_size is not null
      and r.spend_per_person_minor is not null
      and r.visit_date >= current_date - public.ew_community_spend_freshness_days()
  ), spending as (
    select place_id, count(*)::bigint as spend_report_count,
      round(percentile_cont(0.5) within group (order by spend_per_person_minor))::bigint as median_spend_per_person_minor,
      max(created_at) as latest_report_at
    from recent_spend
    group by place_id
  )
  select q.place_id,
    coalesce(r.rating_count, 0), r.average_rating,
    coalesce(s.spend_report_count, 0), s.median_spend_per_person_minor,
    s.latest_report_at,
    coalesce(s.spend_report_count, 0) >= 5
  from requested q
  left join ratings r on r.place_id = q.place_id
  left join spending s on s.place_id = q.place_id;
$$;

revoke all on function public.ew_place_community_aggregates(uuid[]) from public;
grant execute on function public.ew_place_community_aggregates(uuid[]) to anon, authenticated;
