alter table public.ew_places
  add column google_place_id text,
  add column google_match_status text not null default 'not_checked',
  add column google_match_confidence numeric(5, 4),
  add column google_match_checked_at timestamptz,
  add column google_place_id_refreshed_at timestamptz,
  add column google_match_algorithm_version text,
  add constraint ew_places_google_place_id_not_blank_check
    check (google_place_id is null or btrim(google_place_id) <> ''),
  add constraint ew_places_google_match_status_check
    check (google_match_status in ('not_checked', 'matched', 'ambiguous', 'unmatched', 'needs_review', 'error')),
  add constraint ew_places_google_match_confidence_check
    check (google_match_confidence is null or google_match_confidence between 0 and 1),
  add constraint ew_places_google_match_algorithm_version_not_blank_check
    check (google_match_algorithm_version is null or btrim(google_match_algorithm_version) <> ''),
  add constraint ew_places_google_matched_identity_check
    check ((google_match_status = 'matched') = (google_place_id is not null));

comment on column public.ew_places.google_place_id is
  'Trusted Google Places identity. Populated only for a matched result; Google place details are not persisted.';
comment on column public.ew_places.google_match_status is
  'ExploreWise matching outcome. Only matched rows may use google_place_id for navigation.';
comment on column public.ew_places.google_match_confidence is
  'ExploreWise-generated confidence for the selected matching candidate, from 0 to 1.';
comment on column public.ew_places.google_match_checked_at is
  'Time the controlled server-side matcher last checked this place.';
comment on column public.ew_places.google_place_id_refreshed_at is
  'Time the trusted Google Place ID was last confirmed by the controlled matcher.';
comment on column public.ew_places.google_match_algorithm_version is
  'Deterministic ExploreWise matcher version used for the latest check.';

create index ew_places_google_match_status_id_idx
  on public.ew_places (google_match_status, id);
