# Guided Planner Phase 1: canonical planning contract

Status: contract/specification only. Branch `feature/guided-planner`; baseline
`pre-guided-planner-v1`. No production consumer imports this package yet.

## Existing model audit

| Existing source | Reuse | Supersede at the future input boundary |
| --- | --- | --- |
| `supabase/functions/ask-wise/wise-intent.ts` | Minor-unit money, nullable extraction, explicit validation pattern | Free-text geography/time/preferences, implicit total budget, no occasion/version |
| `apps/mobile/src/services/ask-wise-normalization.ts` | Occasion detection, explicit food/activity focus, stage ordering and inferred-stage distinction | `friends_group` becomes `friends`; `generic` requires clarification; string preferences become structured answers |
| `apps/mobile/src/services/wise-proposal.ts` | Catalog-backed selection and `anchorPlaceId` UUID | One anchor becomes an array; the 300000 display fallback must NEVER become an answered budget; missing party fallback of 1 must not become confirmed input |
| `apps/mobile/src/services/itinerary.ts` | Stage/category codes, selected stops, execution state, totals and unknown-price handling | Input intent becomes separate from assembled itinerary; do not replace its state machine |
| `packages/database/src/pricing.ts` | `BudgetStatus`, evidence provenance, group multipliers and unknown/estimated distinctions | Nothing: input budget basis is distinct from venue `PricingUnit` |
| `use-current-location.ts`, `location-search.ts`, `plan-location.ts` | Label, coordinates, current/search source; explicit unresolved location does not fall back silently | Add structured locality context and explicit geographic boundary |
| `catalog-search.ts` and Plan's named-place resolution | Resolve text to active ExploreWise `place_id` before using it as an anchor | Names are resolution queries, never finalized identity; Google identity stays separate |

The current `just`/`only`/`lang` check suppresses complementary stages; otherwise
one requested stage may gain an inferred optional companion. Focus includes
ramen/pizza/sushi/burger and auditorium, which are more specific than the initial
wizard options. Stage order is also richer than a preference set. A later adapter
must retain these requirements through explicit constraints or ask for clarification;
it must not flatten them silently into soft cafe/restaurant/activity preferences.
All existing types and behavior remain in place.

## Contract and validation

Canonical source: `packages/planning/src/intent.ts`. Exported `PlanningIntent`
is inferred from its runtime validators, avoiding independently maintained wire
and TypeScript shapes. `validatePlanningIntent(unknown)` returns a discriminated
success/result or a path-bearing validation issue. Unknown keys/versions and
invalid enum values are rejected; there is no automatic coercion or upgrade.
Validation reports the first issue; consumers can retry after correcting it.

The existing relevant code uses explicit runtime guards, not Zod. This package
uses small local validators, has no dependencies on mobile, React, Supabase, AI,
or Node APIs, and can be imported as TypeScript by future client/server consumers.
`Intl` validates timezone identifiers. No database migration is needed.

| Field | Meaning / minimum valid input |
| --- | --- |
| `planningIntentVersion` | Required literal `1`; incompatible changes require a new version and explicit migration |
| `occasion` | Required `date`, `friends`, `family`, or `solo` |
| `location` | Required source, visible label, finite lat/lon, nullable locality/city/region/ISO country context, geographic boundary |
| `location.geography` | Required positive radius in meters around the supplied coordinates OR an opaque locality ID resolved by a trusted backend; context labels alone are not boundaries |
| `party` | Required safe integer size 1–50 (current parser compatibility), includes everyone; nullable children metadata outside Family |
| `budget` | Required nonnegative safe-integer `amountMinor`, ISO currency code, `total`/`per_person`, `strict`/`flexible`, unknown-price policy |
| `schedule` | Required positive duration in minutes OR positive local-time window; optional outing date/start time, explicit timezone whenever date/time is supplied |
| `moods`, `food`, `activities` | Answer-state objects; no selection is required |
| `mobility` | Optional answer state; selected `keep_close`, `short_rides_ok`, or `flexible` |
| `anchors` | Required array, empty allowed; catalog UUIDs only |
| `constraints` | Required explicit exclusion arrays (empty allowed) and category scope (`any` by default, `only` for explicit restrictions) |

Required means the **user information** needed for generation, not that every
field requires a wizard screen. The draft initializes empty arrays and unanswered
optional dimensions. `createPlannerDraft` never invents required answers. Family
children state can remain unanswered/skipped; when present, count is required and
cannot exceed total party size. Age bands are optional, describe ages under 18,
and never imply verified child suitability or child discounts. Outside Family,
children must be `null`. Date and Solo party suggestions are editable, not enforced
counts or inferred answers; confirmation of the party question records them.

Location coordinates are the planning origin. A locality boundary must be
resolvable before generation; an unsupported locality ID cannot silently become
a radius search. Radius searches constrain every chosen place relative to this
origin, while existing sequential stop distances remain separate. Mobility does
not widen an explicit geographic boundary. ISO code format is checked locally;
market/currency support is checked at the future service boundary, with no FX
conversion or Philippines-only defaults.

Schedule windows have `endDayOffset: 0 | 1` for same/next-day end. Duration includes
travel and stops; no date means an undated plan, no start means a floating start.
Local wall time does not prove venue opening hours. Future scheduling must resolve
DST gaps/ambiguities explicitly in the supplied IANA timezone, and use reliable
visit/travel data before claiming the itinerary fits. No availability is fabricated.

## Hard constraints, soft preferences, and budgets

`CONSTRAINT_STRENGTH` encodes the distinction. Active catalog membership,
geography, must-visit anchors, party count for price calculations, explicit
place/category exclusions, explicit-only category scope, strict known budget
boundaries, and available time are hard. Category codes retain existing catalog
meaning; a future adapter must resolve/validate them against the catalog taxonomy.
No new category taxonomy is introduced here.

Occasion, moods, normal food/activity selections, preferred anchors, mobility,
and flexible budget are soft. Weak preference coverage can reduce a match score
or introduce alternatives; it must not alone produce no itinerary. Surprise can
encourage diversity only within hard constraints. No mood, family occasion, or
preference establishes a factual venue attribute. Exclusions are not safety or
allergen guarantees. Hard conflicts require clarification, never silent relaxation.

Budget amounts refer to the entire outing's **place spending**, not each stop.
Travel/transport costs are outside this amount until supported by reliable data
and must not be advertised as included. `total` is the party cap; `per_person`
is multiplied once by total party size, with safe-integer overflow rejected.
Venue prices still follow existing per-person/per-group/admission rules, avoiding
double multiplication. Currency exponent belongs to currency formatting, not the
contract: PHP major-unit text becomes centavos once, JPY need not multiply by 100.

- **Strict:** known spend exceeding the cap is ineligible for ordinary selection.
  A range crossing the cap is not proven within budget; require a lower-cost
  alternative or explicit clarification before promising compliance.
- **Flexible:** initial future policy allows candidates up to 10% above the total
  cap (`FLEXIBLE_BUDGET_OVERAGE_BASIS_POINTS = 1000`, round allowance down to minor
  units). Prefer within-budget options, disclose the amount of any overage, and
  never label an overage as within budget. Zero budget has zero allowance.
- **Unknown prices:** `allow_with_disclosure` allows uncertain candidates, even
  under strict mode, but the complete itinerary is then unverified for affordability.
  `exclude` rejects unknown-price candidates. Unknown is never zero/free. An
  unknown-price must-visit anchor with `exclude` is a conflict to resolve.

These are a specification and policy constant, not changes to price evaluation,
catalog retrieval, or ranking. Existing pricing evidence/statuses remain authoritative.

## Answer semantics and occasion branching

Selected preferences are nonempty unique sets of canonical values. Unselected
states carry no values:

| State | Wizard meaning | Future planning meaning |
| --- | --- | --- |
| `unanswered` | Not answered/decided | No bias, preserve uncertainty; optional fields do not block generation |
| `no_preference` | Deliberate neutral answer | No bias or novelty request |
| `surprise_me` | Deliberate exploration request | Introduce diversity/novelty in this dimension within constraints |
| `skipped` | Intentionally bypassed | No bias; retain the distinction for resume/back navigation |

Surprise is a mode, not a food/activity value mixed with chosen options. Mobility
does not offer surprise; selected `flexible` allows longer travel preference,
whereas no preference supplies no travel bias. Child age metadata never offers
surprise/no preference because ages are facts. Required questions cannot be
skipped. Empty anchors mean no requested anchor; Phase 1 does not distinguish an
unvisited optional anchor search from a search dismissed without selecting a place.

`questions.ts` supplies order, requiredness, conditions, answer options, and
occasion emphasis. All occasions share required Occasion → Location → Party →
Budget → Schedule. Family branches appear immediately after Party. Optional
Moods → Food → Activities → Anchors → Mobility follow. Before occasion is answered,
only Occasion is eligible. Other questions are eligible for back navigation once
occasion is set; their order is the suggested forward progression, not an enforced
navigation lock. Answered questions remain editable; intentionally skipped questions
remain available on back navigation. Hidden branches are bypassed automatically.

| Occasion | Suggested party | Optional/branch behavior |
| --- | --- | --- |
| Date | 2, editable | Emphasize moods, food, activities; children branch hidden |
| Friends | User supplies size | Emphasize party, food, activities; fun/food-trip suggestions; nightlife remains an explicit activity choice |
| Family | User supplies size | Ask optional children presence; only `present` reveals optional age bands; none/skipped/unanswered hide ages |
| Solo | 1, editable | Emphasize moods/activities; relaxing→chill, exploring→spontaneous/sightseeing, self-care→chill/wellness, adventure→adventurous |

All occasions allow the same canonical mood/food/activity vocabulary. Suggestions
never restrict allowed values or auto-select preferences. The optional Solo
`productive` presentation alias maps only to chill/cafe; it cannot promise Wi-Fi,
power, quiet, or work suitability. Avoid promising those capabilities in future copy.

## Draft lifecycle and anchors

`PlannerDraft` has its own `plannerDraftVersion: 1`, partial typed answers,
current question, monotonic revision, and anchor review results. Use:

1. `createPlannerDraft` → partial answers.
2. `answerQuestion` / `navigateDraft` → immutable edits/back navigation.
3. Trusted catalog compatibility check → `recordAnchorReview` with captured revision.
4. `finalizePlannerDraft` → validated `PlanningIntent` or field issue.

Family→other clears children metadata; returning to Family initializes unanswered
metadata. Changing children to none/skipped discards the inapplicable age branch.
Party-size edits making children count invalid block finalization until corrected.
Editing occasion/children while on a now-hidden branch moves the cursor to Party
or Children. Other answers remain intact, including an edited party count.

Location edits retain **all** anchors and invalidate their review. Party, budget,
schedule, occasion, exclusions, and anchor edits also invalidate review. Pure
preference edits preserve completed reviews; in-flight results for older revisions
are ignored. `resumePlannerDraft` rejects malformed/unsupported persisted input
and clears stored anchor reviews so catalog evidence must be refreshed.

Each anchor is `{ placeId, intent: 'must_visit' | 'preferred', order: { kind: 'any' } }`.
Multiple anchors are supported (boundary safety limit 50), duplicate UUIDs rejected,
and UUID case normalized. V1 does not enforce an order. A future version can add
discriminated order variants without replacing the anchor structure; V1 readers
must reject those variants until explicitly upgraded. An incompatible preferred
anchor also requires review resolution/removal; it cannot be silently forgotten.

Structural validation cannot establish catalog existence, active status, geographic
compatibility, currency/price compatibility, or time feasibility. Draft review flags
are UI workflow state, **not authorization or server evidence**. The future backend
must recheck all anchors and constraints against trusted current data, even if a
client bypasses draft finalization or tampers with reviews. No I/O is performed here.

## Future Ask Wise adapter (not implemented)

| Current output/context | Canonical destination / missing information |
| --- | --- |
| Parsed location text + resolved selection | `location` label/coordinates/source; obtain locality context and explicit radius/locality boundary; unresolved location remains a draft issue |
| `budget_minor` / `budgetMinor` | Already minor units; never multiply again. Only raw PHP major-unit text needs ×100. Clarify basis, strictness, unknown-price policy and missing currency |
| `partySize` | `party.size`; clarify missing value; never copy proposal defaults as user intent |
| `outingContext` | date/family/solo direct; friends_group→friends; generic needs occasion answer |
| `timeContext` | Resolve relative dates against a supplied clock/timezone, ask for missing duration/window; never infer from runtime clock in this pure package |
| Cafe/restaurant/dessert/fast_food focus | Canonical food selection; preserve explicit-only strength separately |
| Museum/outdoor/cinema/landmark | art_museum/outdoor_park/movie/sightseeing; recreation is broader than games_arcade, so clarify rather than assume |
| Explicit nightlife | Activity nightlife or food drinks only when supported by the actual request |
| Named resolved catalog record | UUID anchor, usually must_visit; unresolved/ambiguous names stay draft resolution issues |
| `just`/`only`, exclusions | Explicit category scope and resolved exclusion IDs/codes, not negative soft preferences |

Specific cuisines, auditorium, arbitrary text exclusions, and requested stage
ordering are not losslessly covered by the initial wizard vocabulary. The later
adapter must expose unresolved requirements and block finalization until clarified
or a versioned typed extension is added. It must retain source text in its own
extraction workflow for clarification, not stuff unknown values into this contract.
This preserves existing Ask Wise behavior now and identifies the adapter work
needed before Ask Wise can safely use the new shared boundary.

## Verification and non-goals

From repository root:

```text
node --experimental-strip-types --test packages/planning/tests/*.test.mts
apps/mobile/node_modules/.bin/tsc.cmd -p packages/planning/tsconfig.json
```

Tests are deterministic and require no network, database, Google, or AI. Mobile
regression tests, typecheck, lint and `git diff --check` remain separate checks.

Phase 1 does not build UI, inspect/change screen compositions, wire persistence,
build an adapter, alter Ask Wise, rank/retrieve candidates, change pricing or
Google identity/navigation, modify proposal/customization/execution/favorites/
contributions, migrate a database, or deploy. Phase 2 can build against this
contract/question spec while retaining current production planning until an
explicit adapter/backend integration task is implemented and verified.
