# Place presentation enrichment — Phase 3C.2A

This phase adds demand-driven Google photo presentation for Proposal and
Customize / View More. It is deliberately independent from planning decisions.

## Server flow

```text
ExploreWise UUID
  → stored matched Google Place ID
  → get-place-presentation (read-only)
  → current Place Details request (photos field only)
  → current Place Photo request (skipHttpRedirect=true)
  → validated presentation response
```

The Edge Function accepts at most three active ExploreWise UUIDs. It reads the
stored identity, uses one current photo per place, and isolates failures per
place. The Google Places key is server-only and is sent in `X-Goog-Api-Key`.
The photo resource name is used only inside the request and is never returned.

## Mobile flow

`place-presentation.ts` accepts only currently visible places. It reuses the
existing demand-driven identity resolver for `not_checked` records, invokes the
new function for matched records, validates the response, and supplies local
category artwork for every failure state.

There is no completed-result cross-screen cache, AsyncStorage entry, image
prefetch, itinerary snapshot field, or planner-state mutation. Google images
are rendered with Expo Image `cachePolicy="none"`.

## Persistence and policy

The existing Google Place ID and ExploreWise identity metadata remain the only
Google identity data persisted. Photo URIs, photo resource names, dimensions,
author metadata, source links, and photo bytes remain active-view data only.
They are not written to PostgreSQL, Supabase Storage, AsyncStorage, analytics,
or logs.

Every Google result requires a current HTTPS image URI and `googleMapsUri`.
Cards display Google Maps attribution and expose a Photo info sheet with author
credits, the Google Maps source link, and the reporting link when supplied.
Incomplete metadata falls back to category artwork.

## Map-provider gate

Google Places content is not shown on a surface that contains a non-Google map.
Android Proposal is allowed because the configured native provider is Google
Maps. iOS Proposal currently uses the platform default map and therefore uses
category artwork. Customize / View More has no map and can show Google photos.
The decision is centralized in `place-presentation-policy.ts`; this phase does
not migrate iOS to Google Maps.

## Fallback behavior

Category artwork is rendered immediately. Identity pending, unmatched identity,
no photo, malformed metadata, API errors, quota responses, timeout, offline,
and policy-blocked surfaces all remain usable through the fallback. A visible
image may trigger one fresh presentation request after an image load failure;
the second failure stays on artwork.

## Cost controls

- Maximum three place IDs per request.
- Maximum two concurrent Google place operations per request.
- One photo per place.
- Only Proposal stops and currently visible Customize / View More cards are enriched; the Customize shortlist tracks its scroll viewport and keeps the request window bounded to three.
- No below-fold prefetch, gallery, crawler, background photo warming, or catalog bulk enrichment.
- Existing identity matching remains demand-driven and is not repeated for terminal records.

## Enabled screens

Phase 3C.2A enables Proposal and Customize / View More. Place Detail,
Planned, and Live enrichment remain deferred to later phases. Favorites and
Profile are not changed.

## Testing and deployment

Shared contract, Google transport, Edge service, mobile orchestration,
attribution, fallback, cache policy, stale-response, and screen regression
tests are required. Live Google calls are not used in deterministic tests.

Deployment is intentionally deferred. This phase does not change the database,
planner contracts, generate-plan, Ask Wise generation, secrets, or production
state.
