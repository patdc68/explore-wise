# Guided Planner Phase 3B.4

Phase 3B.4 activates the deterministic V1 generator behind the existing
`generate-plan` Edge boundary. It composes a bounded proposal from the
authoritative `PlanningIntent`, the Phase 3B.3 retrieval service, and existing
shared itinerary contracts. No AI, Google matching, routing API, or mobile
integration is involved.

## Composition policy

- Duration maps to 1, 2, 3, 4, or 5 target stops using the centralized policy
  (60–119, 120–239, 240–359, 360–539, and 540–720 minutes).
- Valid `MUST_VISIT` anchors reserve stages first, are ordered by bounded
  straight-line distance with EW UUID tie-breaking, and must be included once.
- `PREFERRED` anchors are attached to compatible stages when possible and are
  reported as omitted when soft constraints or capacity prevent inclusion.
- Supported food/activity/category evidence is composed deterministically,
  with food/activity alternation and conservative family diversity. Unsupported
  preference values remain unapplied.
- Surprise/spontaneous attempts use the validated ordinal as a deterministic
  family/candidate rotation. The same request, evidence, and ordinal produce
  the same result.

## Hard constraints and budget

Every selected stop comes from the bounded retrieval service, which enforces
the immutable original geography, sequential radius, active catalog, category
scope, exclusions, anchor eligibility, and exact EW UUID uniqueness. The
composition layer updates the sequential origin after every selected stop.

Price evidence is accumulated in minor units and only when its currency matches
the intent. Strict plans reject cumulative known maxima that cross the cap or
range evidence that is not safely affordable. Flexible plans have no numeric
overage allowance; fitting evidence ranks first, while unresolved or definite
over-cap spending is disclosed or clarified. Unknown/mismatched prices are
never treated as zero and produce an unverified affordability summary when
allowed.

## Outcomes and accounting

The generator returns the existing `GeneratePlanResponseV1` outcomes:
`proposal`, `partial_plan`, `clarification_needed`, `no_plan`, or a typed
retryable/internal error. Partial plans contain only hard-valid selected stops;
missing optional stages are listed explicitly. Missing required anchors,
strict-budget conflicts, and other changeable hard conflicts use clarification;
valid hard scopes with no eligible catalog evidence use no-plan.

The boundary owns one request-local database budget of 20 calls. Category and
anchor preflight calls consume it before generation, and the retrieval service
receives the remaining allowance through the same budget hook. Final aggregate
telemetry reports the shared count and never exposes intent, coordinates, IDs,
names, or user identity.

## Deferred work

Phase 3B.5+ may add mobile handoff/integration, richer itinerary presentation,
and later explicitly approved capabilities. This phase does not deploy the
function, persist itineraries, alter Ask Wise, or change production schema.
