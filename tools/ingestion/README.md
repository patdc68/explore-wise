# ExploreWise ingestion tool

This lightweight TypeScript tool validates and normalizes bounded place-source records. Its normal ingestion CLI uses only five clearly marked fictional fixtures and refuses non-dry-run execution. A separate, explicit Foursquare probe performs a read-only catalog check; neither command writes to Supabase.

## Setup

From `tools/ingestion`:

```powershell
npm install
npm run typecheck
npm test
npm run ingest -- --source foursquare_os --region PH-NCR --limit 5 --dry-run
```

To explicitly verify live Foursquare catalog access:

```powershell
npm run probe:foursquare
```

The probe uses an in-memory DuckDB instance, loads `httpfs` and `iceberg`, attaches the documented `places` catalog, and directly runs `SELECT * FROM places.datasets.places_os LIMIT 1`. Its output contains only the DuckDB version, column names/types, and whether a row was returned. It never prints the row or access token.

After that safety gate succeeds, an operator can create a local controlled-sample artifact:

```powershell
npm run sample:foursquare -- --source-id <registered-source-uuid> --limit 50
```

The sample command accepts only 20–50 rows. It filters by configured country, exact source region, configured geographic bounds, and the curated V1 category allowlist. Category IDs are joined to the live `places.datasets.categories_os` hierarchy inside DuckDB; labels are not used as classification keys. The final sample round-robins deterministically across mapped ExploreWise categories and then uses canonical `fsq_place_id`. It normalizes and validates every row and writes the private payload to ignored `.artifacts/`. It does not connect to or write Supabase. Database staging remains an explicit server/operator action; no public client credential is accepted by this package.

`npm run inspect:foursquare` performs a heavier read-only country-level administrative aggregation and prints only the highest-volume and Metro Manila-like combinations. Add `--categories` to save the current live category hierarchy to a private ignored artifact, or `--tables` for catalog discovery diagnostics. `npm run remap:foursquare -- <artifact-path>` reprocesses a saved private artifact after verified category mappings change, without another source request; version 2 artifacts retain the chosen mapping and all category decisions separately from the raw 27-column source payload.

Supported CLI options:

- `--source` (required)
- `--region` (required)
- `--limit` (optional positive integer)
- `--dry-run` (required for this milestone)

Dry-run performs source reading, normalization, validation, duplicate detection, category resolution, and idempotency classification. It does not create an ingestion run, stage rows, or write `ew_places`.

## Future production eligibility

Staging validation and public-production eligibility are intentionally separate. The deterministic source-quality policy lives in `src/eligibility/production-eligibility.ts`: no unresolved flags is eligible; `duplicate` requires review; `closed` and `privatevenue` are excluded from public discovery. Any other unresolved source flag is held for review. A promotion workflow must additionally require a valid staged row and a mapped category; this package does not promote rows or write `ew_places`.

## Environment

Copy `.env.example` to `.env.local` when running the explicit live Foursquare probe:

```text
FOURSQUARE_ACCESS_TOKEN=
```

The real token belongs in `tools/ingestion/.env.local`. That file is ignored by Git. Do not put the token in command output, application logs, `apps/mobile`, `apps/web`, `EXPO_PUBLIC_*`, database rows, or repository configuration.

The live probe, inspection, and sample commands read `FOURSQUARE_ACCESS_TOKEN` only from this package-local `.env.local`. Fixture ingestion, artifact remapping, and the normal test suite do not load it.

## Structure

```text
src/
  cli/              argument parsing and safe fixture-only command
  config/           registered source concepts
  database/         repository boundary and production write contract
  deduplication/    primary identity, idempotency, cross-source candidates
  normalization/    deterministic text, URL, date, code, coordinate helpers
  reporting/        aggregate sample quality and category reports
  sources/          bounded source adapter contract and fictional fixture
  types/            ingestion domain types
  validation/       structured validation and within-run duplicate tracking
tests/               focused Node test-runner tests
```

The global region configuration and category mapping contracts live at repository-level under `data/` so future ingestion/admin tooling can share them.

See `docs/data-ingestion.md` for database security, provenance, staging, deduplication, idempotency, and extension guidance.
