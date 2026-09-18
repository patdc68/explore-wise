# Guided Planner Phase 3B.5

Phase 3B.5 connects the mobile Guided Planner Review state to the already
implemented `generate-plan` contract. The Edge Function is intentionally not
deployed by this phase.

## Review to Proposal

`Let Wise plan it` captures the current `PlannerDraft.revision`, validates the
answers into canonical `PlanningIntent` v1, and sends only a
`GeneratePlanRequestV1` (`requestVersion`, `intent`, `draftRevision`, and
optional attempt metadata). The draft and UI labels are never sent as backend
authority.

The request is made by `src/services/guided-plan-generation.ts` through the
existing Supabase client. `functions.invoke('generate-plan', { body, signal,
timeout })` supplies the project API-key context and optional Auth session; the
mobile app adds no Authorization header and contains no server credential.

The Review screen shows a truthful loading state, prevents duplicate submits,
supports cancellation, and keeps all answers in memory. A successful
`proposal` or `partial_plan` response is validated, its server anchor reviews
are applied for the matching revision, and the result is placed in the shared
in-memory Planning Handoff. The existing Plan tab consumes that handoff and
renders the existing Proposal UI; no second Proposal screen is introduced.

## Outcomes and errors

- `proposal` opens the existing Proposal screen.
- `partial_plan` opens the Proposal screen with missing stages and warnings
  retained and a truthful partial-plan notice.
- `clarification_needed` stays in Review, keeps every answer, and maps known
  issue codes to actionable sections.
- `no_plan` keeps the draft and offers recovery without relaxing constraints.
- typed retryable/non-retryable errors remain distinct; only retryable errors
  expose Retry.
- malformed responses, timeouts, offline failures, HTTP failures, and aborts
  are transport errors, never a fabricated local plan.

Server warnings are preserved in Proposal. Unknown or mismatched prices remain
unverified, currency is carried from the canonical response, unapplied
preferences are disclosed without claiming they ranked places, and mobility
expansion is described without travel-time or routing claims.

## Revision and anchor safety

Response application requires the request to still be active and the draft
revision to match. A stale response is ignored, cannot apply anchor reviews,
cannot overwrite newer answers, and cannot navigate to Proposal. A back action
aborts the request where supported and always returns safely to Review.

Must-visit anchors remain locked in Customize. Preferred anchors are soft: an
incompatible preferred review can be disclosed while a valid hard-anchor set
still finalizes. The server remains authoritative for both decisions.

## Proposal, Customize, and persistence

The small Guided Proposal adapter preserves server stage order, ExploreWise
place UUIDs, price ranges, unknown-price state, currency, warnings, missing
stages, anchor outcomes, preferences, and attempt/history metadata.

Guided Customize applies bounded client guardrails in addition to the server
contract: original and sequential hard geography, category scope,
exclusions, cumulative strict/flexible budget semantics, unknown-price policy,
and exact place identity. Ask Wise continues to use its existing local mobile
proposal builder and Customize path unchanged.

Finalization continues through the existing `finalizeItinerary()` and
execution store (`AsyncStorage` → Planned → Live → Completed). Optional
`currencyCode` persists, while legacy snapshots without it remain readable.

## Testability and deployment boundary

The invocation is injectable, so tests use deterministic response fixtures for
all semantic outcomes, transport failures, malformed payloads, retries,
cancellation, duplicate-submit protection, revision staleness, and hard
constraint editing. The hosted Edge Function is not invoked or deployed in
3B.5. Hosted deployment and physical validation are deferred to Phase 3B.6.
