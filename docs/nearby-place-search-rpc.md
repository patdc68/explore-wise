# Nearby-place discovery RPC

`public.ew_nearby_places` is the bounded, public discovery endpoint for geographic place search. It is the intended foundation for the future location-first mobile flow; it does not add ranking, budgets, preferences, or AI behavior.

## Contract

```text
ew_nearby_places(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 5000,
  p_category_codes text[] default null,
  p_result_limit integer default 30
)
```

Coordinates use WGS 84. `longitude` is passed as the X coordinate and `latitude` as Y. `radius_meters` is measured using PostGIS `geography`, so `distance_meters` is also in metres.

| Parameter | Rules |
| --- | --- |
| `p_latitude` | Required; inclusive range `-90` to `90`. |
| `p_longitude` | Required; inclusive range `-180` to `180`. |
| `p_radius_meters` | Optional; defaults to `5000`; inclusive range `1` to `50000`. |
| `p_category_codes` | Optional persisted ExploreWise category codes; omit or pass an empty array for all active categories. At most 20 nonblank codes. |
| `p_result_limit` | Optional; defaults to `30`; inclusive range `1` to `100`. |

The response is ordered by `distance_meters ASC, place_id ASC` and returns only:

```text
place_id, name, category_code, category_name, address, city, region,
country_code, latitude, longitude, website_url, phone_number, distance_meters
```

No ingestion, staging, raw source, review, price, hours, ratings, photo, or description fields are returned.

## Eligibility and access

The RPC uses `SECURITY INVOKER`. It returns only rows that satisfy both the existing public policies and the explicit discovery predicates: `ew_places.status = 'active'` and `ew_categories.is_active = true`. It is executable by the existing public discovery roles, `anon` and `authenticated`, and is not executable by `PUBLIC`.

`ST_DWithin(ew_places.location, search_point, radius_meters)` is the spatial filter. The existing `ew_places_location_gix` GiST index supports it; `ST_Distance` is calculated only for candidates that pass the radius filter and is used for response and deterministic ordering.
