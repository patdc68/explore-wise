# Guided Planner Phase 3B.1 — shared planning seam

Phase 3B.1 prepares one deterministic planning seam without connecting Guided
Planner or Ask Wise to a generation endpoint.

## Shared package

`packages/planning/src/` now contains:

- `contracts.ts`: `GeneratePlanRequestV1`, discriminated
  `GeneratePlanResponseV1`, planner issues/warnings, anchor review and
  inclusion results, preference application metadata, budget summaries, and
  runtime request/response validation plus canonical serialization.
- `policy.ts`: one source of truth for request bounds, five-stage generation,
  50-place pools, duration stop counts, mobility radii, body size, attempt
  history (zero-based ordinal `0..4`, up to six prior combinations per
  attempt), and database-call metadata. Flexible budget overage remains
  disabled.
- `domain.ts`: dependency-free itinerary/place shapes with optional
  `currencyCode` on itinerary state.
- `engine.ts`: dependency-injected catalog, category, anchor, candidate,
  price-evidence, chain, and runtime interfaces. It imports no Supabase,
  Deno, React Native, Expo, AsyncStorage, Google, or AI code.
- `budget.ts`, `dedupe.ts`, `ranking.ts`, and `composition.ts`: pure budget,
  price-truth, exact-place identity, history, stable ordering, diversity, and
  category-family helpers.

The package has no runtime dependencies and uses explicit relative `.ts`
imports, matching the current Metro watch-folder setup and the import style
available to a future Deno function. Edge bundling still belongs to 3B.2;
no Edge Function was added in this phase.

## Compatibility strategy

Ask Wise still uses its existing mobile orchestration and output types. Its
budget-status classification, selected-price totals, exact-place filtering,
history-key construction, activity round-robin, and food/activity stable
tie-breaking now delegate to shared pure helpers. Existing mobile types remain
the compatibility boundary, so Proposal, Customize, Try another, finalization,
and execution behavior are unchanged.

`ItineraryState.currencyCode` is optional. The AsyncStorage decoder accepts
legacy snapshots without currency and validates the new optional three-letter
value; no saved data is rewritten.

## Deferred to 3B.2+

- `generate-plan` Edge Function and server authentication/rate limiting
- authoritative catalog/geography/anchor validation against Supabase
- bounded structured candidate retrieval and hard/soft constraint execution
- deterministic Guided Planner composition and response construction
- mobile Review → generation → Proposal integration
- physical Edge/mobile regression validation
