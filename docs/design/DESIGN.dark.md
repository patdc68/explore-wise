---
name: Nocturne Explorer
colors:
  surface: '#0c1421'
  surface-dim: '#0c1421'
  surface-bright: '#323948'
  surface-container-lowest: '#070e1b'
  surface-container-low: '#141c29'
  surface-container: '#18202d'
  surface-container-high: '#222a38'
  surface-container-highest: '#2d3543'
  on-surface: '#dbe2f5'
  on-surface-variant: '#c1cab0'
  inverse-surface: '#dbe2f5'
  inverse-on-surface: '#29313f'
  outline: '#8b947d'
  outline-variant: '#424936'
  surface-tint: '#91db2a'
  primary: '#9ee939'
  on-primary: '#1f3700'
  primary-container: '#84cc16'
  on-primary-container: '#315200'
  inverse-primary: '#416900'
  secondary: '#b7c7ea'
  on-secondary: '#20304d'
  secondary-container: '#3a4967'
  on-secondary-container: '#a9b9db'
  tertiary: '#a5e837'
  on-tertiary: '#213600'
  tertiary-container: '#8acb12'
  on-tertiary-container: '#345100'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acf847'
  primary-fixed-dim: '#91db2a'
  on-primary-fixed: '#102000'
  on-primary-fixed-variant: '#304f00'
  secondary-fixed: '#d7e2ff'
  secondary-fixed-dim: '#b7c7ea'
  on-secondary-fixed: '#091b36'
  on-secondary-fixed-variant: '#374764'
  tertiary-fixed: '#b2f746'
  tertiary-fixed-dim: '#98da27'
  on-tertiary-fixed: '#121f00'
  on-tertiary-fixed-variant: '#334f00'
  background: '#0c1421'
  on-background: '#dbe2f5'
  surface-variant: '#2d3543'
  canvas-base: '#0b1320'
  canvas-elevated: '#0f172a'
  container-low: '#162238'
  container-default: '#1e2e4a'
  container-high: '#263859'
  container-highest: '#33466d'
  border-subtle: '#334155'
  border-strong: '#475569'
  text-primary: '#f8fafc'
  text-body: '#f1f5f9'
  text-muted: '#94a3b8'
  accent-electric: '#a3e635'
  accent-glow: rgba(132, 204, 22, 0.25)
  itinerary-completed: '#365314'
  itinerary-skipped: '#64748b'
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

This design system translates the kinetic energy, tactile structure, and confident precision of urban exploration into a comprehensive, high-contrast dark environment. Tailored for late-night navigators, evening wanderers, and spontaneous travel planners, it transforms nocturnal logistics into an intuitive, visually striking journey.

The aesthetic fuses **Tactile Modernism** with **High-Contrast Digital Precision**. Deep midnight navy canvases establish an expansive atmospheric backdrop, layered with sculpted, elevated deep-slate containers that physically step toward the user. Translucent hairline strokes delineate borders without introducing visual noise, while selective lime green accents slice through the darkness to command attention, indicate active states, and chart forward momentum. The resulting emotional tone is commanding, serene, and razor-sharp.

## Colors

The nocturnal color model relies on dark tonal layering instead of absolute black to preserve contrast, spatial hierarchy, and depth without harsh optical fatigue.

- **Background Canvas (`#0B1320` / `#0F172A`):** Deep oceanic midnight tone functioning as the base level. It absorbs glare while providing a rich foundation for luminous components.
- **Surface Elevation Hierarchy:**
  - `container-low` (`#162238`): Base panels, list background groupings, and inset card trays.
  - `container` (`#1E2E4A`): Standard cards, bottom sheets, search pills, and floating modals.
  - `container-high` (`#263859`): Focused cards, elevated dialogs, and active tactile press surfaces.
  - `container-highest` (`#33466D`): Overlays, tooltips, and interactive micro-actions.
- **Primary & Accent Greens (`#84CC16` / `#A3E635`):** Selective lime greens provide intense contrast against midnight navy surfaces. Reserved strictly for primary action CTAs, route paths, active tabs, and live status beacons.
- **Text & Content Hierarchy:**
  - `text-primary` (`#F8FAFC`): Display headlines, active values, and high-emphasis indicators.
  - `text-body` (`#F1F5F9`): Paragraph prose, primary inputs, and list title items.
  - `text-muted` (`#94A3B8`): Metadata timestamps, transit distances, secondary tags, and inactive labels.
- **Borders & Dividers (`#334155`):** Translucent cool slate outlines that firmly shape modular cards and inputs against dark backgrounds without visual distraction.

## Typography

The typographic system pairs architectural precision with natural, open readability:

- **Headlines & Display (Space Grotesk):** Provides structured, geometric presence with distinct tech-forward terminals and tight letter spacing. Set in high-contrast off-white (`#F8FAFC`) to command visual priority over layered midnight containers.
- **Body & Longform (Plus Jakarta Sans):** Supplies balanced x-height and clear apertures for mobile readability against low-light dark backgrounds. It ensures fatigue-free scanning of trip notes, reviews, and route instructions.
- **Labels, Pills & Metrics (Space Grotesk):** Employs medium and bold weights paired with generous tracking for maximum quick-scan utility across compact navigational pills, ETA counters, and live badge labels.

## Layout & Spacing

The layout is built on a responsive 8-point rhythmic grid designed for one-handed handheld ergonomics:

- **Mobile Viewports (< 640px):** Single-column vertical stream bounded by a `margin-mobile` of 1rem (`16px`). Elements within itinerary blocks stack using `space-md` (`16px`) gaps, leaving a persistent clearance padding of 88px at the canvas base to float above the navigation capsule.
- **Tablet & Split-Screen Viewports (640px - 1024px):** Adopts a 12-column fluid framework with 16px gutters and 24px margins. Transitions to a two-column operational layout: 45% sticky itinerary column and 55% route map canvas.
- **Section Margins:** Section groupings, route transitions, and card separations preserve rhythm via `space-lg` (24px) or `space-xl` (36px).

## Elevation & Depth

In dark mode, physical depth is conveyed through tonal stepping, subtle luminescence, and inner rim lighting rather than dark shadows:

1. **Surface Tiers:**
   - **Canvas Ground (Level 0):** Flat `#0B1320` base.
   - **Base Containers (Level 1):** `#162238` with `1px solid #334155`.
   - **Elevated Interactive Surfaces (Level 2):** `#1E2E4A` with a dual boundary: `1px solid rgba(255, 255, 255, 0.08)` along the top edge, an inner highlight `inset 0 1px 0 rgba(255, 255, 255, 0.1)`, and an ambient back-drop shadow `0 8px 24px rgba(0, 0, 0, 0.45)`.
   - **Top Modals & Floating Bars (Level 3):** `#1E2E4A` combined with a soft outer accent aura: `0 12px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px #334155`.
2. **Tactile Interaction:**
   - On tap or press, interactive buttons depress physically by `translateY(1.5px)` with an intensified internal top border, simulating a mechanical keypress.
3. **Accent Glows:**
   - Live itinerary markers and current waypoint pins emanate an atmospheric radial lime halo (`box-shadow: 0 0 20px rgba(132, 204, 22, 0.25)`).

## Shapes

The design system uses a pill-shaped and deeply rounded tactile curvature language (`roundedness: 3`).

- **Pill Elements (`rounded-full` / `9999px`):** Buttons, interactive filter chips, badges, floating bottom navigation bars, search inputs, and step counters utilize full continuous curvature.
- **Container Curvature:** Cards, sheets, and popovers maintain generous rounding (`rounded-lg: 2rem` on bottom sheets, `rounded-md: 1.5rem` on cards) to evoke smooth pebbles and tactile hardware components.
- **Nested Ratio Consistency:** Inner elements scale down symmetrically: a 24px card container nests 12px thumbnail media and 8px inner indicator badges.

## Components

### Buttons
- **Primary CTA:** Minimum 48px height. Fill is vibrant lime `#84CC16`, text is midnight navy `#0B1320` (`label-lg`). Styled with a subtle upper specular highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.4)`) and an ambient lime drop shadow (`0 4px 16px rgba(132, 204, 22, 0.3)`). Active state shifts down 1.5px with dampened shadow.
- **Secondary (Navy Clay):** Surface `#1E2E4A`, border `1px solid #334155`, text `#F8FAFC`. Provides a tactile surface for secondary utilities and navigation.
- **Ghost / Outline:** Transparent fill, `1px solid #334155`, text `#94A3B8`, brightening to `#F8FAFC` on hover.

### Destination & Itinerary Cards
- Surface `#1E2E4A` framed by `1px solid #334155`, 20px interior padding, and 24px corner radius.
- Includes a dedicated header with title in `text-primary` (`headline-sm`), sequential numeric badge, tag metadata row, and an action slot for waypoint options.
- Focus or expanded state gains an accent border `1.5px solid #84CC16` with a soft lime ambient glow.

### Itinerary Timeline Sequence States
- **Upcoming Stop:** Container `#162238`, border `1px solid #334155`. Index indicator shows muted slate text `#94A3B8` over `#1E2E4A` pill background.
- **Current / Live Stop:** Surface `#1E2E4A`, rimmed with an active `2px solid #84CC16` outline. Features a floating electric lime pill badge (`#A3E635` with `#0B1320` text) labeled "CURRENT STOP" and a pulsing vertical timeline thread.
- **Completed Stop:** Surface `#0F172A` with reduced 0.65 opacity. Strikethrough metadata, paired with a subdued deep olive-green badge (`#365314` fill, `#A3E635` checkmark icon).
- **Skipped Stop:** Ghost frame with dashed border (`1.5px dashed #475569`), background transparent, typography muted to `#64748B`.

### Form Inputs & Search Bars
- 48px pill height (`rounded-full`), surface `#162238`, border `1px solid #334155`, and text `#F1F5F9`.
- **Placeholder:** `#94A3B8`.
- **Focus State:** Hairline border transforms to `1.5px solid #84CC16` accompanied by an ambient lime focus ring (`0 0 0 3px rgba(132, 204, 22, 0.2)`).

### Filter Chips & Tags
- Height 34px, pill-shaped (`rounded-full`), 14px horizontal padding.
- **Inactive:** `#162238` fill, `1px solid #334155`, text `#94A3B8`.
- **Active:** `#84CC16` fill, `#0B1320` bold text (`label-md`), accompanied by a mini check or category icon.

### Checkboxes & Radio Controls
- 20px rounded geometry with `1px solid #475569` in unselected state.
- **Selected:** Filled with `#84CC16`, housing an off-white or dark navy vector checkmark/dot.

### Floating Bottom Navigation Bar
- 64px height pill capsule (`rounded-full`), suspended 16px above the device safe-area inset.
- Built from deep container fill `#1E2E4A` with `1px solid #334155`, backed by backdrop blur (`backdrop-filter: blur(16px)`).
- **Active Tab:** Encases icon in an active pill cushion of `#84CC16` with `#0B1320` icon glyph, while inactive destinations rest as clean line art in `#94A3B8`.