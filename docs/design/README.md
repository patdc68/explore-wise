# ExploreWise Design Sources

ExploreWise has two approved theme specifications exported from Google Stitch.

## Light theme

`DESIGN.light.md`

Use for:

- Light theme color tokens
- warm cream canvas
- elevated white surfaces
- light-theme borders
- light-theme clay/elevation treatment

## Dark theme

`DESIGN.dark.md`

Use for:

- Dark theme color tokens
- midnight/navy canvas
- dark surface hierarchy
- dark borders
- dark-theme elevation and contrast

## Shared design language

Both specifications share the same overall ExploreWise design language:

- Space Grotesk for headings and labels
- Plus Jakarta Sans for body text
- compact mobile spacing
- pill controls
- restrained tactile/clay depth
- lime primary actions
- itinerary state hierarchy
- floating bottom navigation

## Source-of-truth priority

1. Existing ExploreWise application
   - behavior
   - business rules
   - navigation
   - state
   - persistence
   - factual data

2. Approved Google Stitch screens
   - visual composition
   - hierarchy
   - layout
   - interaction presentation

3. `DESIGN.light.md` and `DESIGN.dark.md`
   - reusable styling and theme specifications

Do not fabricate product functionality or factual place data solely because it
appears in a design mockup.

Do not translate web-specific CSS literally when implementing React Native.
Reproduce the intended visual result using supported React Native / Expo
primitives.