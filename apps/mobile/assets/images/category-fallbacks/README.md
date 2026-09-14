# ExploreWise category artwork

These 11 original, locally authored SVG illustrations are **temporary category artwork**,
not venue photography or verified place attributes. No stock images, external image
services, AI image calls, or third-party artwork were used. Every family has an asset;
all can be replaced with final art after visual review.

Each SVG uses a 640 x 360 viewBox (16:9), warm paper/sage/clay colors, abstract landscape
shapes and a category symbol. The complete set is approximately 14 KB. Both themes use
the same artwork. Files contain no scripts, fonts, embedded photos or remote references.

| Existing category | Asset family |
| --- | --- |
| food, food.restaurant | restaurant |
| food.cafe | cafe |
| food.bakery | bakery |
| food.dessert | dessert |
| activity, activity.recreation | recreation |
| entertainment | entertainment |
| entertainment.cinema | cinema |
| outdoor, outdoor.park | outdoor |
| attraction | attraction |
| attraction.museum, attraction.culture | culture |
| Missing, malformed or unknown | generic |

`src/services/place-visual.ts` is the single category map and resolver. It normalizes
codes, prefers exact matches, then tries the nearest mapped parent. Unknown roots
use generic discovery artwork. Place names are labels only, never image identities.

`src/components/discovery/place-visual.tsx` renders the result with the installed
`expo-image`, a stable 16:9 frame and a local failure state. Category artwork stays
underneath the remote image while it loads. The accessibility label switches to
`Photo of <name>` only after the photo is displayed. On failure, the remote layer is
removed. Changing place ID or URL starts a fresh request; failure never writes data.

## Current image model (inspected 2026-09-11)

The ExploreWise project `wkgvnpamnhesmmbyikml` was inspected read-only via Supabase MCP.
`public.ew_places` has **no image/photo field**. No public image/photo columns or tables
were found. The generated database types, nearby RPC return types and `PlaceDetail`
also expose no photo URL. Missing photography is therefore absence from the model,
not an empty-string/null convention in an existing image column. `website_url` is a
venue website and must never be repurposed as an image.

There was no venue-image URL validator or consumer in discovery/detail. Existing
image components render application branding. Place Detail has no image hero and
is intentionally left for its dedicated redesign.

`realImageUrl` is an optional **presentation input**, not a new place/database field.
No retrieval, database types, schema or categories were changed. Today, Explore cards
all use fallback art. When a provenance-backed photo source is added, pass its URL to
`PlaceCard` / `PlaceVisual`; a valid photo takes precedence over category/generic art.
The resolver validates HTTPS URL syntax and rejects credentials, whitespace, control
characters and local/unsafe schemes. Syntax validation does not establish provenance
or content: the caller must only supply a verified venue-photo source. No website,
name, stock provider or guessed URL is used to manufacture photography.

## Replacing artwork

Replace the relevant SVG file while keeping the filename and 16:9 framing. If using
another bundled format, update only its static require in `place-visual.ts`. Keep art
decorative, lightweight, consistent and non-photorealistic. Planner and detail screens
can adopt `PlaceVisual` later without copying the taxonomy or failure behavior; map
their category to `category_code` and pass the stable place ID.

## Device review

Check Explore on 360-430 px Android/iOS phones in Light and Dark, with text scaling,
long names and unknown/known prices. Check image clipping, scroll density, independent
48 px Favorite control and TalkBack/VoiceOver labels. Test a verified photo, offline
load failure and changed URL using development fixtures. Automated component tests
stub native image rendering, so physical image decoding and touch/screen-reader
behavior still need device validation.
