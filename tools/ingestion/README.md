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

Supported CLI options:

- `--source` (required)
- `--region` (required)
- `--limit` (optional positive integer)
- `--dry-run` (required for this milestone)

Dry-run performs source reading, normalization, validation, duplicate detection, category resolution, and idempotency classification. It does not create an ingestion run, stage rows, or write `ew_places`.

## Environment

Copy `.env.example` to `.env.local` when running the explicit live Foursquare probe:

```text
FOURSQUARE_ACCESS_TOKEN=
```

The real token belongs in `tools/ingestion/.env.local`. That file is ignored by Git. Do not put the token in command output, application logs, `apps/mobile`, `apps/web`, `EXPO_PUBLIC_*`, database rows, or repository configuration.

The probe reads `FOURSQUARE_ACCESS_TOKEN` only from this package-local `.env.local`. Fixture ingestion and the normal test suite do not load it.

## Structure

```text
src/
  cli/              argument parsing and safe fixture-only command
  config/           registered source concepts
  database/         repository boundary and production write contract
  deduplication/    primary identity, idempotency, cross-source candidates
  normalization/    deterministic text, URL, date, code, coordinate helpers
  sources/          bounded source adapter contract and fictional fixture
  types/            ingestion domain types
  validation/       structured validation and within-run duplicate tracking
tests/               focused Node test-runner tests
```

The global region configuration and category mapping contracts live at repository-level under `data/` so future ingestion/admin tooling can share them.

See `docs/data-ingestion.md` for database security, provenance, staging, deduplication, idempotency, and extension guidance.
