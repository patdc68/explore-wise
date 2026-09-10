# ExploreWise place ingestion

## Scope

The ingestion foundation accepts normalized place records from multiple licensed or first-party sources without making ExploreWise dependent on any one provider. Metro Manila (`PH-NCR`) is the first configured target, but country, currency, timezone, and regional values are record/configuration data rather than database defaults.

The explicit Foursquare connectivity probe may call the read-only Iceberg catalog, but it does not persist returned records or write to Supabase. Fixture ingestion remains offline.

## Pipeline

1. A source adapter reads bounded source records and preserves the opaque source place ID and original payload.
2. Deterministic helpers normalize derived fields while retaining the original source name.
3. Validation emits structured error codes. Invalid and review records may be retained in staging, but cannot enter `ew_places`.
4. A verified taxonomy rule resolves an external category to an existing `ew_categories.code` and an `include`, `exclude`, or `review` ingestion decision. Unknown categories remain review-only.
5. Primary identity and within-run duplicate checks use `(source, source_place_id)`.
6. Potential cross-source duplicates are classified for manual review using normalized name, geographic distance, address, and category signals. They are never auto-merged.
7. Idempotency compares normalized source-backed fields with the current same-source place. The result is `inserted`, `updated`, or `unchanged`; stale timestamped source records are unchanged.
8. Only a validated production-write object may be converted to an `ew_places` upsert. Coordinates become `extensions.geography(Point, 4326)` inside PostgreSQL.

## Database model and provenance

`ew_data_sources` is the source registry. It is source-neutral and currently seeds only:

- code: `foursquare_os`
- name: `Foursquare Open Source Places`
- type: `open_data`

Optional website, licence, and attribution fields remain null until verified metadata is deliberately added.

`ew_ingestion_runs` records source, optional region, lifecycle status, counts, timestamps, and object-shaped metadata. `records_received` is the number of processed source records; `records_valid` counts only `valid` staging records; `records_rejected` counts only `invalid` staging records. Review rows never increment `records_rejected`; finalization records `staging_valid`, `staging_review`, `staging_rejected`, and `staging_inserted` in metadata. Status is constrained to `pending`, `running`, `completed`, `failed`, or `partial`; all counts must be non-negative.

`ew_place_import_staging` retains run/source linkage, opaque source identity, raw payload, original source name, source update timestamp, normalized fields, validation state, structured errors, and the deterministic dedupe key. Its composite foreign key guarantees that a staging row's source matches its ingestion run. A unique constraint on `(ingestion_run_id, source_id, source_place_id)` detects duplicate source records within one run.

Staging permits missing or invalid incoming values so a rejection can be recorded. A row marked `valid` is subject to an additional database check requiring identity, name, country, coordinates, normalized name, dedupe key, and no validation errors.

Production provenance uses the existing `ew_places.source` and `ew_places.source_place_id` columns and their existing unique constraint. The importer must verify the source code against `ew_data_sources` before writing.

## Normalization and validation

Normalization is deterministic and intentionally conservative:

- Unicode and repeated whitespace are normalized.
- The original source name is kept in `name`; `normalized_name` is a lower-cased, punctuation-separated comparison value.
- Source IDs are opaque and are not case-folded, reformatted, or trimmed.
- Country and currency codes are trimmed and upper-cased only when they match two- and three-letter ASCII shapes.
- Latitude and longitude must be finite numbers in `[-90, 90]` and `[-180, 180]`.
- Optional city, district, region, address, and phone values receive whitespace normalization only.
- URLs must parse as HTTP or HTTPS; fragments are removed.
- A source-provided update time is retained as an ISO timestamp.

Required validation covers ingestion-run linkage, registered source, source place ID, name, country-code shape, coordinates, URLs when supplied, source timestamps when supplied, duplicate run identity, and verified category mapping. Source-marked closed records and serious unresolved source flags such as `duplicate`, `delete`, or `doesnt_exist` are review-only rather than valid or silently discarded. Failures are stored as objects with `code`, `field`, `message`, and an optional rejected value.

## Category mapping

Mappings live under `data/category-mappings/`. The Foursquare registry is a small V1 product policy containing canonical category IDs, an ExploreWise category when included, an ingestion decision, descendant matching, and deterministic precedence. It was verified against the live `places.datasets.categories_os` hierarchy. Labels are documentation only and never the classification key.

The V1 include rules cover restaurants; cafes and coffee shops; bakeries; desserts; food courts and cafeterias; selected participatory recreation; cinemas and performing/amusement venues; parks, gardens, and selected nature places; museums, galleries, heritage places, zoos, and aquariums. Business/professional services, health/medicine, generic retail, community/government, travel/transportation, bars, and night clubs are excluded. Events and unselected categories remain review-only.

For a multi-category place, all source category IDs and labels remain in the raw payload. The catalog joins each ID to the live hierarchy, applies the lowest configured precedence, and chooses one included primary ExploreWise category deterministically. Secondary include/exclude/review classifications remain report metadata for future tagging. An included category is not replaced by an unrelated secondary category.

To add a production mapping:

1. Verify the external taxonomy identifier/name from the source.
2. Verify the destination code exists and is active in `ew_categories`.
3. Add the mapping with focused tests and provenance in the change description.
4. Never use a generic fallback category or AI mapping.

## Deduplication and idempotency

The authoritative identity is source code plus the exact opaque source place ID. Re-running the same identity does not create another `ew_places` row.

For the same identity:

- no current row means `inserted`;
- changed normalized source-backed fields means `updated`;
- identical fields means `unchanged`;
- an older `source_updated_at` means `unchanged` as a stale record.

The production SQL also uses `ON CONFLICT (source, source_place_id)`, a distinct-field predicate, and a stale timestamp guard. It updates only source-backed place columns. It does not update descriptions, tags, prices, hours, promotion data, or place status, and it cannot overwrite another source's row. Cross-source candidates remain separate and are returned for later review.

## Production write rules

`tools/ingestion/src/database/production-place-write.ts` is the single conversion/write contract. It requires a valid staging record and a verified active category mapping, and constructs coordinates through parameterized PostGIS SQL. New imported places have `pending` status.

The contract never invents descriptions, prices, opening hours, tags, or other facts. A future repository must use a server-side database credential and a transaction, and must update run counters only after the corresponding staging/production operation succeeds. Higher-confidence admin or merchant data requires a separate explicit merge strategy; cross-source rows are not merged here.

## Security

RLS is enabled on all three ingestion tables. There are no `anon` or `authenticated` policies, and all their table privileges are revoked. `service_role` receives normal row DML only; truncate, references, and trigger privileges are revoked. PostgreSQL administrators retain operational access. Raw source payloads and run controls are therefore server/admin-only.

The Foursquare token is developer/server tooling only. Its local location is `tools/ingestion/.env.local`, which Git ignores. The example file contains only `FOURSQUARE_ACCESS_TOKEN=`. Never expose the token through Expo, Next.js public variables, logs, database rows, or committed files.

The live probe uses the modern `@duckdb/node-api` client with an in-memory database. It installs/loads only `httpfs` and `iceberg`, creates a temporary in-memory Iceberg secret, attaches the documented `places` REST catalog, and queries `places.datasets.places_os` directly. Catalog discovery through `information_schema` is not used as an availability gate. Live access is never part of the normal test suite.

The controlled Metro Manila sample query combines `country = 'PH'`, exact source `region = 'Metro Manila'`, and the bounds in the shared `PH-NCR` region configuration. It explodes category IDs in DuckDB, joins `categories_os`, retains only places matching curated include rules, chooses a primary mapping by precedence, and round-robins deterministically across ExploreWise category codes before ordering by canonical `fsq_place_id`. Irrelevant rows are filtered in Iceberg rather than downloaded to Node. The bounds are attributed in configuration to OpenStreetMap administrative relation 147488. This combination is required because live PH inspection found geographically incorrect outliers under otherwise plausible region labels. Source-marked closed rows are always review records, never valid candidates. All 27 source columns, including category arrays, quality flags, `geom`, and `bbox`, remain in the private staging payload.

## Regions and sources

Metro Manila is defined in `data/regions/metro-manila.ts` as `PH-NCR`, `PH`, `Metro Manila`, `Asia/Manila`, `PHP`, and attributed geographic bounds. These values are not defaults on `ew_places`.

To add a region, add a configuration containing a stable region code, ISO country code, display name, IANA timezone, and ISO currency. Register it with the CLI/source selection layer and add validation tests. If a region crosses timezones or currencies, model smaller targets rather than forcing a misleading default.

To add a source, create a source-registry migration/seed with verified legal metadata, implement a bounded adapter, add a category mapping module, add fixtures and contract tests, and register the adapter in tooling. Source adapters must not log credentials or raw sensitive payloads.
