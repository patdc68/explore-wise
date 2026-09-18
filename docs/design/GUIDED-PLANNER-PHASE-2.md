# Guided Planner Phase 2 — mobile UI

Implemented on `feature/guided-planner`. Physical acceptance remains pending.

## Experience and scope

Explore presents “Where shall we go today?” and **Build my plan** after location
context. Ask Wise retains its existing component, text input, quick prompts,
submit handler, and Plan handoff. Existing discovery and itinerary behavior is
unchanged.

`/guided-planner` is a root-stack route with its own safe areas and persistent
bottom action. It uses one in-memory `PlannerDraft` for the mounted session;
there is no restart persistence. Back moves between questions; Close and leaving
the first question confirm before discarding meaningful answers. Review edits
preserve unrelated answers. Native swipe dismissal is disabled; the explicit
Back/Close controls and Android back handle the flow.

The flow uses Phase 1 `questionsForDraft`, vocabulary, answer states, suggested
party sizes, immutable answer updates, and validators:

1. Occasion: prominent Date / Friends / Family / Just me cards.
2. Location: select the existing Explore location, request GPS, or explicitly
   search and select coordinates through the device geocoder already used by Plan.
3. Party: Date defaults to 2 and stays editable; Friends/Family offer presets and
   custom counts; Solo uses 1 and omits the extra question.
4. Family: children count and conditional multi-select age bands, both skippable.
5. Budget: PHP presets/custom minor-unit input; total/per-person and derived group
   total; strict/flexible and explicit handling of unknown prices. No overage promise.
6. Time: 150/240/480-minute durations or an editable overnight window, with optional
   date/start and an explicitly displayed device timezone.
7. Mood, food, activities: canonical multi-select values and distinct no-preference,
   surprise-me, and skipped answers. The spec permits all listed values; no extra
   selection limit or cuisine taxonomy is invented.
8. Optional catalog anchors: add, remove, or change by searching and selecting
   another result. Multiple anchors are retained; duplicates are prevented.
9. Mobility, editable review, then local completion.

Brief conversational copy appears within the mood and anchor steps; there are no
blocking interstitial screens. Step transitions fade for 160 ms and respect reduced
motion. Invalid required answers disable Continue; review marks corrections and
disables the final CTA until the shared validators accept the answers.

## Location and catalog boundaries

The generic Explore area-search provider is unconfigured. The planner reuses
`expo-location.geocodeAsync`, as existing Plan does, with Android permission handling.
There is no new provider, locality history, invented locality preset, AI inference,
or Google Places search. Results require explicit selection. Coordinates use a
visible 5 km radius. Unknown structured locality metadata stays null rather than
being inferred from a display label.

Anchor search calls existing `searchCatalogPlaces` across the whole catalog, with
20 bounded results and no nearby-list, category, price, or Google identity filtering.
It stores the catalog UUID, `must_visit`, and `order: { kind: 'any' }`. Display names
remain session-only metadata outside the intent. Search handles loading, empty,
failure/retry, and stale responses; changing a query invalidates old results.

## Local preview and Phase 3 boundary

`validatePlannerPreview` runs Phase 1 `validatePlannerDraft` and
`validatePlanningIntent`, plus checks that visible questions have explicit answers
or skip states. `completePlannerPreview` stores the validated `PlanningIntent` in
`session.preview` for inspection in the debugger and shows a clearly local success
screen. Development UI displays only version and anchor count; coordinates and
personal preferences are not written to logs.

**This preview is not production generation authorization.** Phase 1
`finalizePlannerDraft` additionally requires trusted anchor compatibility reviews.
Phase 2 deliberately does not fabricate those reviews, clear anchors, or weaken
the shared finalizer. Tests prove an anchored draft can reach structural preview
while the production finalizer still rejects it. Compatibility remains unverified.

Phase 3 must perform fresh trusted catalog/geography/budget/time checks, use the
captured revision when recording reviews, and call `finalizePlannerDraft` before
the real planning handoff. The server must independently validate the intent and
anchors. No recommendation backend, ranking, Ask Wise adapter, proposal flow,
database migration, deployment, or Google identity change is included here.

## Design and native integration

Reference: approved Stitch project `10725685166837161364`, Explore screen
`e7482c0641ba43c18587f78749ec647e` and its Dark counterpart
`f0abef5d4f6a4b96a3c689f1882bcc83`, plus `DESIGN.light.md` / `DESIGN.dark.md`.
The project has no approved Guided Planner screen; the new composition extends
the existing visual language. Approved designs were not modified.

Shared Clay components and semantic tokens supply cream/navy/lime surfaces,
Space Grotesk / Plus Jakarta Sans, responsive spacing, and restrained depth.
Selected options use both a checkmark and accessibility state. Long place and
area names wrap; custom inputs and search live in a keyboard-aware scrolling shell.
The root route avoids floating-tab overlap without changing tab navigation.

Metro now explicitly watches `packages/planning`: this repository has no root
workspace manifest, so its first shared runtime import needed a file-map entry.
No dependencies or lockfiles changed. Expo defaults are retained.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[device geocoding](https://docs.expo.dev/versions/v57.0.0/sdk/location/),
[Metro and workspace detection](https://docs.expo.dev/guides/monorepos/).

## Deterministic verification

Tests execute production state transitions and component callbacks with stubbed
native hosts, device APIs, and catalog networking; they are not device renders.
Coverage includes both themes, all occasions, Family branches, dependent cleanup,
back/review editing, invalid review blocking, exact custom money conversion,
overnight schedules, preference modes, catalog search/add/remove, stale search
responses, discard confirmation, Explore entry, and the existing Ask Wise handoff.

Required checks: planning package tests, mobile TypeScript, full mobile tests,
mobile lint, and `git diff --check`. An additional offline Android export checks
Metro/runtime package resolution; generated output is ignored under `apps/mobile/dist`.

Results: 25 planning tests and 340 mobile tests passed; mobile TypeScript, lint,
`git diff --check`, and offline Android JavaScript export passed. The export used
`--no-bytecode` to check bundling; it is not an installed APK or a device test.

## Android physical-device matrix

Use a development build with the existing catalog configuration. Check 360, 390,
and 430 logical-pixel widths (412 where available), Light/Dark, normal/large font
scaling, and gesture/three-button navigation. Native acceptance is pending.

| Scenario | Expected result |
| --- | --- |
| Explore entry | Location precedes Build my plan; planner opens; Ask Wise still submits exact free text to existing Plan flow. |
| Date | Default 2, editable; complete every step, review, local preview. |
| Friends | Presets and custom count retained when moving back and forward. |
| Family with children | Count included in party total; ages only shown when children present; multiple ages and Skip work. |
| Family without children | No age question; No children / Skip remain distinct. |
| Solo | Size 1; party and children questions omitted. |
| Back and edits | Hardware/UI back preserve answers; review returns after edits; Family → Solo clears children; Solo → Family requests missing dependents; Close asks before discard. |
| Budget keyboard | Enter 1234.56, zero, blank and invalid input; switch total/per-person; totals stay correct; field and CTA remain reachable. |
| Location | Reuse Explore/GPS; deny permission and retry; search a specific area and select coordinates; no unselected text is accepted as location. |
| Time | Duration and overnight choices; valid/invalid date and time; same/next-day toggle; displayed timezone is correct. |
| Preferences | Multi-select, deselect, No preference, Surprise me and Skip preserve distinct review states. |
| Catalog anchor | Search a catalog venue outside current nearby results; add, remove, replace, add another; long names wrap; offline retry and empty results are clear. |
| Review | All sections visible/editable; unrelated answers survive; invalid edits mark Needs attention and disable final CTA. |
| Mock generation | Let Wise plan it reaches local preview with no venues or recommendation call; review remains available; leaving succeeds. |
| Theme/layout/accessibility | Both themes legible at all widths; no clipped labels/overlapping footer; keyboard/search scroll reachable; TalkBack announces selected states; reduced motion avoids fades. |
| Session lifecycle | Background/foreground preserves the mounted draft; leaving discards after confirmation; app restart does not restore it. |

Also smoke-test iOS safe areas, keyboard avoidance, explicit Back/Close and native
geocoding when an iOS device is available.
