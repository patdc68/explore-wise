# Visual fidelity correction — 2026-09-13

Inspected all eleven requested screens through Stitch MCP in project
`10725685166837161364`, downloaded their actual screenshots and HTML into the OS
temporary directory, and viewed the rendered references. No Stitch designs were
modified and no downloaded reference assets are added to the repository.

This is a presentation change to the existing app. Physical Android acceptance is
pending: the checks below execute production presentation with host-view stubs;
they are not screenshots, native text measurements, or on-device verification.

## Reference comparison

Each row records five principal differences identified against the actual reference
and the corresponding correction. Light/Dark use identical component geometry.

| Screen | Five differences and corrections |
| --- | --- |
| Explore — `e7482c0641ba43c18587f78749ec647e`, `f0abef5d4f6a4b96a3c689f1882bcc83` | 1. Tall location card → selector pill plus quiet locate action. 2. Stacked Ask form → inline input/submit module. 3. Wrapped prompt grid → horizontal quick prompts. 4. Tall rectangular artwork and reserved right column → 96px square media, category/identity, full-width metadata region below. 5. Large planning card → quiet compact supporting row. |
| Proposal — `3dd7308556854cdebd2824493c27355d`, `c0da261ce5c4440f9d0bbc2804fe6b9b` | 1. Repeated introductory headings → one screen heading. 2. Request inside another card → flat request context. 3. Three equal budget metrics → two main metrics plus quiet remaining row. 4. Large map → existing compact native map. 5. Number/media/title crowded inside each card → separate numbered rail, right-side thumbnail and inset stop content. |
| Customize — `82a9e071d47c46d0bf0b2e6b5ee1f4d5` | 1. Generic title → current stop number. 2. Horizontal hero-card carousel → vertical candidate rows. 3. Wide banner artwork → 64px square thumbnails. 4. Full-width select CTA on every card → compact trailing select action. 5. Repeated selected badge → current-selection label and disabled Selected action. Existing filters remain on More Options, with flatter lime selection. |
| Planned — `1ba081d9464242a19d3a7d2f7791c46b`, `6692943e218a43608b804ed4c8192e6a` | 1. Loose context rows → grouped party/origin block. 2. Oversized map → compact native map. 3. 48px thumbnail → 64px media. 4. Price section beneath entire card → price evidence alongside identity in a flatter 16px-radius timeline item. 5. Footer adjoining rectangular tabs → measured persistent CTA with clearance above floating capsule. |
| Live — `c6c5b32e806d45488fe6f7dabd7efae7`, `7572350cc0c749c69228cc6cf9343b7b` | 1. Large progress heading → smaller context above the hero. 2. Inline current-status text → standalone lime status pill. 3. Small thumbnail → 96px current-stop media. 4. Ordinary outlined card → hero surface with dedicated padding and action group. 5. Text-only earlier stops → compact media recap rows, retaining quiet state labels and secondary map. |
| Completed — `b3207c09825a42ea9d6871db244a38ab` | 1. Left-aligned card heading → centered celebration. 2. Small check → 80px navy/lime celebration emblem. 3. Generic information-card boundary → open canvas and concise completion summary. 4. Text-only stop recap → image-led completed/skipped rows. 5. Contributions after map → prominent optional contribution section before the secondary map. |
| Place Detail — `3a501d43f44b4a60a1d4c11f24475285` | 1. Media and identity in a single raised card → separate rounded visual and editorial identity. 2. Excess identity padding → narrow factual essentials block. 3. About text inside another card → open text section. 4. Price heading outside its module → integrated Price transparency module. 5. Repeated community metric cards → flat reported-evidence rows within that module. |

Favorites now uses open media rows with independent trailing hearts. Profile uses
an unboxed account identity and quieter compact preference/navigation rows.

## Shared geometry and fonts

- Hero: existing 30px radius; standard surface: 24px; compact row and media: 16px;
  metadata, controls and navigation use pill geometry.
- Navigation: 64px capsule, 16px horizontal inset and 16px above device safe area.
  Lime is confined to a 40×28px icon cushion, within a tab target of at least 44px.
  Scroll content reserves device bottom inset + 96px. Planned CTA reserves its own
  measured height above that space. Keyboard hiding remains enabled.
- Added `@expo-google-fonts/space-grotesk` 0.4.1 and
  `@expo-google-fonts/plus-jakarta-sans` 0.4.2. Both supply bundled font assets;
  the existing `expo-font` loads them once at the root. No native SDK upgrades.
  Space Grotesk 500/600/700 supports semantic headings, labels and metrics;
  Plus Jakarta Sans 400 supports body copy. The native splash covers loading;
  a load error permits the app to open with native fallback. Scaling remains on.
- Existing theme-aware elevation remains the single depth system. Quiet rows are
  flat; hero depth is selective. Dark mode continues to use tonal separation.

## Grey settings control investigation

No settings/gear control exists in the ExploreWise screen source. The installed
SDK's `expo-dev-menu` Android implementation draws a 52dp circular gear, removes
its saturation and reduces opacity when idle, and opens `DevMenuAction.Open`.
That matches the reported appearance, but the physical control has not been
confirmed. Its developer-tools preference controls the floating button (`showFab`).
Hide it through the developer menu for visual acceptance, or use a preview build.
No dependency source, native developer-menu behavior, or app handler was patched.

## Preserved boundaries

The session-start source snapshot was compared to the resulting source. No files
under `services/` or `providers/`, and no map-provider implementation, were changed.
All queries, ranking, candidate pools, exclusions, prices, provenance, distances,
auth, favorites, execution transitions, persistence and contribution eligibility
remain in the existing implementation. JSX calls the existing handlers. Customize
changes comparison presentation from swiping cards to viewing vertical rows;
selection and highlight callbacks remain, while carousel-only scroll state is gone.

No place photos, ratings, hours, verification claims, tips, arrival signals, route
metrics, saved amounts or new venue properties were invented. Existing generic
category artwork remains explicitly described as artwork. Plan estimates are not
presented as actual trip spending; skipped stops remain distinct from completed.

## Validation and physical re-test

Passed: `npx.cmd tsc --noEmit`; ESLint for all 19 changed source files;
73 focused presentation tests; all 285 mobile tests using
`node --experimental-strip-types --test tests/*.test.mts`; and `git diff --check`.
Package manifests and the task diff were reviewed. The Git index is empty.
New navigation checks cover both themes,
360/390/412/430px widths, and 0/24/48px bottom safe-area insets. Existing runtime
presentation tests still exercise location actions, exact prompts, favorites,
price provenance, Start/Navigate/Complete/Skip, restoration and contributions.

On Android, re-test each requested width in Light and Dark with default and 1.5×
text, both gesture and three-button navigation where available:

1. Cold start: fonts resolve without trapping the splash. Hide the Expo gear.
2. Explore: choose location, type a long prompt, select each quick prompt, open the
   keyboard, save/open a place, and scroll to the last radius control.
3. Proposal/Customize: inspect price uncertainty, long titles, compact maps,
   selected rows, More Options/filter/paging, Back and Done Customizing. Ensure
   the selected row remains clear after returning from More Options.
4. Planned: reach the final stop while Start remains visible above the capsule.
5. Live: start from a scrolled plan; navigate, complete, skip, reload mid-trip.
   Verify the current stop owns the screen and no action overlaps navigation.
6. Completed: confirm completed/skipped counts, optional contribution eligibility,
   shared state, map and Back to Explore. No mandatory review interrupts progress.
7. Detail/Favorites/Profile: long names, absent price data, independent favorite
   buttons, signed-out gates, appearance persistence and all existing links.

Remaining intentional differences: truthful fallback artwork instead of sample
photos; no unsupported Stitch factual chips; native maps instead of prototype map
images; no CSS inset shadows/backdrop blur; existing contribution form remains a
separate route. Stitch's light references sometimes use a navy active nav cushion;
this pass uses the requested restrained lime treatment consistently across themes.
No physical screenshot comparison or pixel-fidelity claim has been made.

## Files changed in this pass

Paths below are relative to `apps/mobile/`, except this report:

- `package.json`, `package-lock.json`
- `src/app/_layout.tsx`
- `src/app/(tabs)/_layout.tsx`, `index.tsx`, `plan.tsx`, `favorites.tsx`, `profile.tsx`
- `src/app/place/[id].tsx`, `src/app/plan/alternatives.tsx`
- `src/components/appearance-setting.tsx`, `ask-wise-card.tsx`, `wise-proposal-card.tsx`
- `src/components/discovery/place-card.tsx`, `place-visual.tsx`
- `src/components/itinerary/itinerary-ui.tsx`, `itinerary-progress.tsx`, `itinerary-contributions.tsx`
- `src/components/ui/clay.tsx`, `src/constants/theme.ts`, `src/hooks/use-floating-tab-inset.ts`
- `tests/alternatives.test.mts`, `customize-ui.test.mts`, `explore-presentation.test.mts`,
  `itinerary-execution-ui.test.mts`, `phase1-device-regressions.test.mts`,
  `place-visual.test.mts`, `visual-fidelity.test.mts`
- `docs/design/VISUAL-FIDELITY-PASS.md` (repository root)

Other uncommitted changes already existed at session start and were preserved.
