# Guided Planner Phase 3B.2 — generate-plan server boundary

Phase 3B.2 adds the read-only HTTP and trust boundary for the future
deterministic planner. It does not retrieve candidates, compose stages, rank
places, build proposals, connect the mobile Guided Planner, or deploy an Edge
Function.

## Boundary

`supabase/functions/generate-plan/index.ts` is a thin `Deno.serve` adapter. The
handler accepts only `POST` JSON requests (with CORS `OPTIONS` support), reads
at most 16 KiB, validates UTF-8/JSON, and validates the canonical
`GeneratePlanRequestV1` and `PlanningIntent v1` without coercion. It enforces
the shared party, radius, anchor, category, schedule, attempt, and body
policies before any database call.

The function keeps `verify_jwt = false` because anonymous planning is part of
the approved architecture. It still requires a configured Supabase
publishable/anon API key at the handler boundary. An optional bearer token is
verified with the server-only Supabase client when present; invalid or absent
sessions remain anonymous and do not require account creation.

## Authoritative validation and repository

Radius/coordinate geography is supported. Locality-only geography has no
authoritative resolver and returns `clarification_needed`; labels never define
geographic authority.

The repository performs bounded, deterministic, read-only projections of
`ew_categories` and `ew_places`. Anchor UUIDs are EW catalog identities. The
repository does not use Google Place IDs, trigger Google matching, return raw
source fields, or retrieve candidate pools. Active place/category status,
coordinates, exclusion/category scope, and hard-radius membership are checked
before the generator seam is called. Anchor reviews preserve `draftRevision`
when supplied.

Price evidence is not fetched in this boundary-only phase. Shared minor-unit,
currency, multiplication, unknown-price, and no-flexible-overage semantics
remain authoritative; candidate affordability belongs to Phase 3B.3.

## Generator seam and outcomes

`handler.ts` accepts an injected `PlannerGenerator`. The default Phase 3B.2
generator returns a safe structured `internal_error` because candidate
retrieval and itinerary composition are intentionally deferred. A future
phase can inject deterministic generation without changing HTTP, validation,
repository, authentication, or logging boundaries.

Boundary failures use stable `GeneratePlanResponseV1` envelopes: validation
errors, `clarification_needed` for unsupported geography or anchor conflicts,
retryable database errors, and rate limits. Internal exception text and stack
traces are never returned.

## Abuse and privacy

The function uses method/content-type/body/count bounds, read-only idempotent
work, and an isolate-local best-effort limiter. This limiter is not durable
distributed anonymous rate limiting; a gateway or other infrastructure remains
future work.

Structured logs contain only request/response versions, request ID, auth class,
aggregate anchor/database counts, validation stage, outcome/failure code,
latency, and retryability. Raw intent, coordinates, labels, place UUIDs,
anchor UUIDs, and preferences are never logged.

## Intentionally deferred

- Edge/Deno bundling smoke is pending a locally available Deno or Supabase CLI.
- candidate retrieval and price-evidence execution (Phase 3B.3)
- stage composition, ranking, diversity, and proposal construction (Phase 3B.4)
- mobile Review → generation → Proposal integration (Phase 3B.5)
- durable anonymous rate limiting and any schema migration
