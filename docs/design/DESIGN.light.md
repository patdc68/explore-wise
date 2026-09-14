---
name: ExploreWise Design System
colors:
  surface: '#fbf9f3'
  surface-dim: '#dcdad4'
  surface-bright: '#fbf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee8'
  surface-container-high: '#eae8e2'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#424936'
  inverse-surface: '#30312d'
  inverse-on-surface: '#f2f1eb'
  outline: '#727a64'
  outline-variant: '#c1cab0'
  surface-tint: '#416900'
  primary: '#416900'
  on-primary: '#ffffff'
  primary-container: '#84cc16'
  on-primary-container: '#315200'
  inverse-primary: '#91db2a'
  secondary: '#555e75'
  on-secondary: '#ffffff'
  secondary-container: '#d9e2fd'
  on-secondary-container: '#5b647b'
  tertiary: '#506600'
  on-tertiary: '#ffffff'
  tertiary-container: '#9fc700'
  on-tertiary-container: '#3e4f00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#acf847'
  primary-fixed-dim: '#91db2a'
  on-primary-fixed: '#102000'
  on-primary-fixed-variant: '#304f00'
  secondary-fixed: '#d9e2fd'
  secondary-fixed-dim: '#bdc6e0'
  on-secondary-fixed: '#121b2f'
  on-secondary-fixed-variant: '#3d475c'
  tertiary-fixed: '#c3f400'
  tertiary-fixed-dim: '#abd600'
  on-tertiary-fixed: '#161e00'
  on-tertiary-fixed-variant: '#3c4d00'
  background: '#fbf9f3'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  margin: 1.25rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system embodies the spirit of curated urban exploration and intuitive travel orchestrating. It balances the timeless tactility of a physical guidebook with the precision of a high-performance modern digital tool. The system serves curious travelers, weekend urbanists, and meticulous day-planners who seek serendipity without logistical chaos.

The aesthetic fuses **Tactile Skeuomorphism / Modern Soft Clay** with **Editorial Modernism**. The tactile layers provide grounded, physically reassuring surfaces—softly extruded pill elements, inner ambient light glows, and defined edges—while crisp geometric grotesque typography and purposeful electric lime accents provide high-energy, forward-moving navigational clarity. The emotional takeaway is assured composure, kinetic momentum, and sensory warmth.

## Colors

The palette establishes an organic, luminous foundation energized by high-contrast focal points.

- **Primary Action & Progress (`#84CC16` / `#A6E22E`):** Vibrant deep-contrast lime used for primary action buttons, focused selections, live progress tracking, and active timeline indicators. Ensures strict WCAG AAA compliance when paired against dark text, and AA when functioning as active structural fills.
- **Secondary & Structural Foundation (`#0D172A` / `#0F1D36`):** Deep oceanic navy serving as the foundational text ink, primary navigational frames, dark modal sheets, and deep canvas contrast.
- **Tertiary & High-Energy Glow (`#CCFF00`):** Electric hyper-lime reserved strictly for luminous status badges ("Current Stop"), pill glows, dynamic map route highlights, and micro-interaction sparks.
- **Canvas & Surface Neutral (`#FAF8F2` / `#F5F1E8`):** Warm, natural off-white cream that prevents eye fatigue in direct daylight, evoking premium editorial stock.
- **Elevated White (`#FFFFFF`):** Reserved for elevated surface cards, tactile controls, and bottom navigation sheets.
- **Crisp Structural Border (`#E5E0D4`):** Soft, tinted parchment hairline borders anchoring tactile cards to the cream backdrop.
- **Semantic Itinerary States:**
  - *Upcoming:* Subdued Navy tint (`#334155`) with neutral cream pill backing (`#EFECE4`).
  - *Current Stop:* Electric Lime (`#CCFF00`) with Deep Navy ink (`#0D172A`) and subtle outer radiance.
  - *Completed:* Muted Olive green (`#4D7C0F` / `#65A30D`) with translucent olive tint fill (`rgba(132, 204, 22, 0.12)`).
  - *Skipped:* Faint bone slate (`#94A3B8`) accompanied by a slashed stroke pattern and low-contrast borders.

## Typography

The typographic hierarchy bridges structured information density and spontaneous personality.

- **Headlines & Display (Space Grotesk):** Provides technological precision balanced with human quirks (such as its distinct curved terminals and angular punctuation). It structures itineraries like architectural logs and anchors map sheet headers. Letter-spacing remains tight to maintain impact across compact mobile viewports.
- **Body Text (Plus Jakarta Sans):** Introduces friendly, open apertures and high x-height for effortless legibility while on the move in fluctuating outdoor sunlight. It softens the technical tone of the headlines.
- **Labels, Badges & Metadata (Space Grotesk):** Rendered in medium to bold weights with slight positive tracking for quick scannability on small-scale elements (time-stamps, tags, category pills, transit badges).

## Layout & Spacing

The layout is built for fluid touch ergonomics on single-hand mobile interactions, governed by an 8-point rhythmic scale.

- **Mobile Viewports (under 640px):** Single-column fluid stream with outer `margin-mobile` of 1rem (`16px`) and interior module gaps of `space-md` (`16px`). Bottom-sheet drawers maintain safe bottom-inset buffers (`min(24px, env(safe-area-inset-bottom))`) to clear system indicators.
- **Tablet / Large Mobile Viewports (640px to 1024px):** Dual-pane split: 40% left panel for vertical itinerary stops, 60% right pane for the interactive visual map and route timeline. Section margins scale to `1.5rem`.
- **Vertical Spacing Rhythm:** Stop cards in an active day-plan are spaced using `space-md` (16px), with travel-time/transit connective thread lines occupying `space-lg` (24px) vertical tracks.

## Elevation & Depth

Visual depth is achieved through tactile soft-clay modeling, layering warm paper tones with inner luminescence and directional drop shadows rather than blurred black ink.

1. **Surface Layering:**
   - **Canvas Ground (Base):** Matte `#FAF8F2`.
   - **Level 1 (Cards & Modules):** Pure warm white `#FFFFFF` paired with an outline of `1px solid #E5E0D4` and a dual shadow: `0 4px 12px -2px rgba(13, 23, 42, 0.04), 0 1px 3px 0 rgba(13, 23, 42, 0.02)`.
   - **Level 2 (Active/Selected Cards & Current Stop):** Extruded clay treatment: `box-shadow: 0 8px 24px -4px rgba(13, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9), inset 0 -2px 4px 0 rgba(13, 23, 42, 0.04)`.
   - **Level 3 (Floating Controls, Bottom Sheet & Nav Bar):** `0 12px 32px -4px rgba(13, 23, 42, 0.12), 0 4px 8px -2px rgba(13, 23, 42, 0.04)`.
2. **Tactile Button Press:** Interactive elements depress physically on tap (`:active`) via `transform: translateY(2px)` accompanied by reduced drop shadow and an intensified inner glow.

## Shapes

The design system adopts a strong Pill and Clay-Curvature language (`roundedness: 3`).

- **Pill Primitives:** Buttons, filter tags, status markers, bottom navigation indicators, and time badges strictly adhere to continuous full pill radii (`9999px` or `rounded-full`).
- **Container Surfaces (Cards, Dialogs, Bottom Sheets):** Sized with large, generous radii (`2rem` / `32px` on bottom sheets; `1.5rem` / `24px` on destination cards) to soften dense data tables and technical maps into approachable, travel-journal interfaces.
- **Nested Radii Hierarchy:** Child chips and interactive nested items maintain concentric curvature relative to their parent surfaces (e.g., 24px card outer radius, 12px nested badge radius).

## Components

### Buttons
- **Primary Action (Tactile Lime):** Sized to 48px minimum height. Background fill is `#84CC16` with text in `#0D172A` (`label-lg`). Includes a top inner soft bevel (`inset 0 1px 1px rgba(255, 255, 255, 0.4)`) and an offset grounding shadow (`0 4px 12px rgba(132, 204, 22, 0.35)`). Active state depresses 2px with reduced shadow.
- **Secondary (Deep Navy Clay):** Background fill `#0D172A`, text `#FAF8F2`, with subtle white outline glow. For secondary utility and bookmarking.
- **Tertiary / Ghost:** Transparent surface, crisp border `1px solid #E5E0D4`, text `#0D172A`.

### Filter Chips & Tags
- Pill-shaped (`border-radius: 9999px`), 36px height, 14px horizontal padding.
- **Unselected:** Warm off-white `#FFFFFF`, `1px solid #E5E0D4`, text `#334155`.
- **Selected:** High-contrast lime `#CCFF00` or `#84CC16`, text `#0D172A`, reinforced with a soft clay inner glow and checkmark icon.

### Form Inputs & Search Fields
- 48px height, rounded pill geometry (`rounded-full`), `#FFFFFF` surface fill, and `#E5E0D4` border.
- **Focus State:** `1.5px solid #84CC16` with an ambient lime glow ring (`box-shadow: 0 0 0 3px rgba(132, 204, 22, 0.2)`). Leading icon slots anchor search, calendar, or location pins in `#0D172A`.

### Destination & Itinerary Cards
- Pure `#FFFFFF` surface, 20px padding, 24px border radius.
- Structural hairline stroke `1px solid #E5E0D4`.
- Incorporates thumbnail media with 16px corner rounding, metadata pill row (duration, walking distance, cost), and explicit drag handles for reordering itinerary sequence.

### Itinerary Timeline Stop States
- **Upcoming Stop:** Border `1px solid #E5E0D4`, background `#FFFFFF`. Timeline step circle shows numeric index in `#334155` over light cream fill `#F5F1E8`.
- **Current Stop:** Background `#FFFFFF` enveloped in an energetic accent border (`2px solid #84CC16`), with a floating pill badge using electric hyper-lime `#CCFF00` labeled "LIVE" or "NEXT UP". Connecting track pulses subtly.
- **Completed Stop:** Background `#FAF8F2`, opacity reduced to 0.75, header struck-through or subdued, marked by an olive checkmark pill (`#4D7C0F`).
- **Skipped Stop:** Faint dashed perimeter (`1.5px dashed #CBD5E1`), background transparent/tinted, with a muted diagonal strikethrough badge.

### Persistent Bottom Navigation Bar
- Floats 16px above the device safe area. Height of 64px, constructed as a soft white clay capsule (`rounded-full`) with a subtle `#E5E0D4` perimeter and elevated depth shadow.
- Four core destinations: **Explore**, **Plan**, **Favorites**, **Profile**.
- **Active State:** Features a pill-shaped electric lime badge (`#CCFF00` or `#84CC16`) enveloping the active SVG icon glyph with `#0D172A` fill, accompanied by a small active indicator dot underneath. Inactive icons remain clean line-art in `#64748B`.