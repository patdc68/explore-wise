create table public.ew_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.ew_categories (id) on delete restrict,
  code text not null unique,
  name text not null,
  description text,
  icon_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_categories_code_format_check
    check (code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint ew_categories_name_not_blank_check
    check (btrim(name) <> ''),
  constraint ew_categories_sort_order_check
    check (sort_order >= 0)
);

create table public.ew_places (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_place_id text not null,
  name text not null,
  description text,
  category_id uuid references public.ew_categories (id) on delete set null,
  country_code text not null,
  region text,
  city text,
  district text,
  address text,
  location extensions.geography(Point, 4326) not null,
  timezone text not null,
  default_currency text not null,
  website_url text,
  phone_number text,
  status text not null default 'pending',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_places_source_identity_key
    unique (source, source_place_id),
  constraint ew_places_source_not_blank_check
    check (btrim(source) <> ''),
  constraint ew_places_source_place_id_not_blank_check
    check (btrim(source_place_id) <> ''),
  constraint ew_places_name_not_blank_check
    check (btrim(name) <> ''),
  constraint ew_places_country_code_format_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint ew_places_timezone_not_blank_check
    check (btrim(timezone) <> ''),
  constraint ew_places_default_currency_format_check
    check (default_currency ~ '^[A-Z]{3}$'),
  constraint ew_places_status_check
    check (status in ('active', 'inactive', 'closed', 'pending'))
);

create table public.ew_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_tags_code_format_check
    check (code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint ew_tags_name_not_blank_check
    check (btrim(name) <> '')
);

create table public.ew_place_tags (
  place_id uuid not null references public.ew_places (id) on delete cascade,
  tag_id uuid not null references public.ew_tags (id) on delete cascade,
  confidence_score numeric(5, 4) not null default 1,
  source text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (place_id, tag_id),
  constraint ew_place_tags_confidence_score_check
    check (confidence_score between 0 and 1),
  constraint ew_place_tags_source_not_blank_check
    check (btrim(source) <> '')
);

create table public.ew_place_prices (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.ew_places (id) on delete cascade,
  currency_code text not null,
  min_amount_minor bigint,
  max_amount_minor bigint,
  average_per_person_minor bigint,
  sample_count integer not null default 0,
  confidence_score numeric(5, 4),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_place_prices_place_currency_key
    unique (place_id, currency_code),
  constraint ew_place_prices_currency_code_format_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint ew_place_prices_min_amount_check
    check (min_amount_minor is null or min_amount_minor >= 0),
  constraint ew_place_prices_max_amount_check
    check (max_amount_minor is null or max_amount_minor >= 0),
  constraint ew_place_prices_average_amount_check
    check (average_per_person_minor is null or average_per_person_minor >= 0),
  constraint ew_place_prices_amount_range_check
    check (
      min_amount_minor is null
      or max_amount_minor is null
      or min_amount_minor <= max_amount_minor
    ),
  constraint ew_place_prices_sample_count_check
    check (sample_count >= 0),
  constraint ew_place_prices_confidence_score_check
    check (confidence_score is null or confidence_score between 0 and 1)
);

create table public.ew_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text,
  country_code text,
  currency_code text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_profiles_display_name_not_blank_check
    check (display_name is null or btrim(display_name) <> ''),
  constraint ew_profiles_locale_not_blank_check
    check (locale is null or btrim(locale) <> ''),
  constraint ew_profiles_country_code_format_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint ew_profiles_currency_code_format_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint ew_profiles_timezone_not_blank_check
    check (timezone is null or btrim(timezone) <> '')
);

create table public.ew_user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preference_type text not null,
  preference_value text not null,
  weight numeric(5, 4) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_user_preferences_identity_key
    unique (user_id, preference_type, preference_value),
  constraint ew_user_preferences_type_not_blank_check
    check (btrim(preference_type) <> ''),
  constraint ew_user_preferences_value_not_blank_check
    check (btrim(preference_value) <> ''),
  constraint ew_user_preferences_weight_check
    check (weight between -1 and 1)
);

create table public.ew_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id uuid not null references public.ew_places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index ew_categories_parent_id_idx
  on public.ew_categories (parent_id);

create index ew_places_category_id_idx
  on public.ew_places (category_id);

create index ew_places_country_city_status_idx
  on public.ew_places (country_code, city, status);

create index ew_places_status_idx
  on public.ew_places (status);

create index ew_places_active_discovery_idx
  on public.ew_places (country_code, city, category_id)
  where status = 'active';

create index ew_places_location_gix
  on public.ew_places using gist (location);

create index ew_place_tags_tag_id_idx
  on public.ew_place_tags (tag_id);

create index ew_favorites_place_id_idx
  on public.ew_favorites (place_id);

create or replace function public.ew_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.ew_set_updated_at() from public, anon, authenticated;
grant execute on function public.ew_set_updated_at() to service_role;

create trigger ew_categories_set_updated_at
before update on public.ew_categories
for each row execute function public.ew_set_updated_at();

create trigger ew_places_set_updated_at
before update on public.ew_places
for each row execute function public.ew_set_updated_at();

create trigger ew_tags_set_updated_at
before update on public.ew_tags
for each row execute function public.ew_set_updated_at();

create trigger ew_place_prices_set_updated_at
before update on public.ew_place_prices
for each row execute function public.ew_set_updated_at();

create trigger ew_profiles_set_updated_at
before update on public.ew_profiles
for each row execute function public.ew_set_updated_at();

create trigger ew_user_preferences_set_updated_at
before update on public.ew_user_preferences
for each row execute function public.ew_set_updated_at();

alter table public.ew_categories enable row level security;
alter table public.ew_places enable row level security;
alter table public.ew_tags enable row level security;
alter table public.ew_place_tags enable row level security;
alter table public.ew_place_prices enable row level security;
alter table public.ew_profiles enable row level security;
alter table public.ew_user_preferences enable row level security;
alter table public.ew_favorites enable row level security;

revoke all on table
  public.ew_categories,
  public.ew_places,
  public.ew_tags,
  public.ew_place_tags,
  public.ew_place_prices,
  public.ew_profiles,
  public.ew_user_preferences,
  public.ew_favorites
from anon, authenticated;

grant select on table
  public.ew_categories,
  public.ew_places,
  public.ew_tags,
  public.ew_place_tags,
  public.ew_place_prices
to anon, authenticated;

grant select, update on table public.ew_profiles to authenticated;
grant select, insert, update, delete on table public.ew_user_preferences to authenticated;
grant select, insert, delete on table public.ew_favorites to authenticated;

grant select, insert, update, delete on table
  public.ew_categories,
  public.ew_places,
  public.ew_tags,
  public.ew_place_tags,
  public.ew_place_prices,
  public.ew_profiles,
  public.ew_user_preferences,
  public.ew_favorites
to service_role;

create policy ew_categories_public_read
on public.ew_categories
for select
to anon, authenticated
using (is_active);

create policy ew_places_public_read
on public.ew_places
for select
to anon, authenticated
using (status = 'active');

create policy ew_tags_public_read
on public.ew_tags
for select
to anon, authenticated
using (true);

create policy ew_place_tags_public_read
on public.ew_place_tags
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.ew_places
    where ew_places.id = ew_place_tags.place_id
      and ew_places.status = 'active'
  )
);

create policy ew_place_prices_public_read
on public.ew_place_prices
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.ew_places
    where ew_places.id = ew_place_prices.place_id
      and ew_places.status = 'active'
  )
);

create policy ew_profiles_read_own
on public.ew_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy ew_profiles_update_own
on public.ew_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy ew_user_preferences_read_own
on public.ew_user_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy ew_user_preferences_insert_own
on public.ew_user_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy ew_user_preferences_update_own
on public.ew_user_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy ew_user_preferences_delete_own
on public.ew_user_preferences
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy ew_favorites_read_own
on public.ew_favorites
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy ew_favorites_insert_own
on public.ew_favorites
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.ew_places
    where ew_places.id = ew_favorites.place_id
      and ew_places.status = 'active'
  )
);

create policy ew_favorites_delete_own
on public.ew_favorites
for delete
to authenticated
using ((select auth.uid()) = user_id);
