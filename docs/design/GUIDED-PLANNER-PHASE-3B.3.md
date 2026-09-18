# Guided Planner — Phase 3B.3

Phase 3B.3 adds the bounded, deterministic candidate-retrieval layer behind
the Phase 3B.2 `generate-plan` boundary. It does not compose an itinerary,
call an AI service, invoke the mobile app, or change the public deferred
generator response.

## Retrieval contract

Each retrieval request carries two origins:

- the immutable planning origin and hard radius from `PlanningIntent`;
- the sequential origin (the planning origin for the first stage, or the
  previously selected stop for a later stage).

Candidates must satisfy both the preferred sequential radius and the original
hard geography. A single expansion may retry at the hard radius when the
bounded preferred-radius evidence is insufficient. Expansion is reported in
metadata and never bypasses geography, category scope, exclusions, or price
eligibility.

The existing read-only `ew_nearby_places_priced` RPC remains the source of
active catalog and current/reference price evidence. The repository maps its
bounded rows into the shared planning domain and performs currency-aware
eligibility locally. No whole-catalog lookup or migration is introduced.

## Bounded pools and constraints

- broad category pool: at most 50 rows;
- budget-evidence slice: at most 12 rows, queried only when needed;
- supported-preference slice: at most 16 rows, queried only when needed;
- merged candidates are deduplicated by EW place UUID and capped at 50;
- at most 20 repository/database calls per retrieval request.

Active places, active categories, coordinates, hard category scope, excluded
place UUIDs, excluded category codes, original geography, and strict known
budget eligibility are hard filters. A candidate with a different currency,
missing price, invalid range, or stale/unavailable evidence is unknown rather
than free or automatically affordable. Strict mode rejects known ranges that
cross or exceed the cap; flexible mode has no hidden 10% tolerance.

Per-person budgets are normalized to total minor units once using the shared
budget helpers. Final cumulative itinerary affordability remains a Phase 3B.4
responsibility.

## Mobility and preference evidence

Sequential-radius policy is centralized in `packages/planning/src/policy.ts`:
keep-close 2,000 m, short rides 5,000 m, flexible 10,000 m, and neutral 5,000
m, each bounded by the hard geography radius.

Only conservative catalog evidence is applied. Cafe, restaurant, dessert,
museum/culture, outdoor/park, movie, and outdoorsy category signals are
supported; food-trip intent is reserved for composition. Partial taxonomy
signals are marked conservative;
romantic, chill, casual, local-food, drinks, shopping, nightlife, wellness,
and spontaneous (composition-time diversity) remain `unapplied` rather than
being inferred from names.

Validated `must_visit` anchors are reserved eligible candidates and preferred
anchors are soft evidence. Anchor identity remains the EW UUID. Chain metadata
is looked up only for the already bounded candidate IDs and is informational;
chain diversity is not a hard exclusion.

## Deferred to Phase 3B.4

Stage composition, final stop ordering, cumulative budget feasibility,
clarification/no-plan presentation, generator activation, mobile invocation,
deployment, and itinerary persistence remain deferred. The public
`generate-plan` function therefore continues returning the intentional
deferred/unavailable generator response.
