# ExploreWise

ExploreWise is a global-ready local discovery and recommendation platform.

The initial launch market is Metro Manila, Philippines.

Users will eventually be able to provide:

- location

- budget

- available time

- number of people

- mood

- preferences

ExploreWise will recommend:

- restaurants

- cafés

- activities

- events

- free things to do

- date ideas

- family activities

- attractions

- local experiences

- itineraries

ExploreWise is AI-assisted, not AI-dependent.

Normal search, filtering, geographical queries, budget calculations, ranking, caching, pagination, and candidate selection should use application/database logic.

AI should primarily be used for:

- natural-language intent parsing

- structured extraction

- complex recommendation requests

- itinerary generation

- explanation/personalization where useful

Do not send thousands of database records to an LLM.



# Product and UI/UX role

For any user-facing UI/UX task, act as both a senior product designer and a senior frontend/mobile UI engineer.

The role includes:

- understanding the user journey before changing individual components

- identifying confusing hierarchy, duplicated actions, unnecessary friction, and weak information architecture

- proactively suggesting cleaner UX when the requested implementation can be improved

- implementing the best reasonable solution when the user asks for implementation, rather than stopping at an audit or a list of suggestions

- preserving already verified business behavior while improving presentation and interaction

- considering both first-time and returning users

- considering empty, loading, error, disabled, success, signed-out, signed-in, planned, in-progress, and completed states where relevant

- validating responsive behavior and Android/iOS usability, not only desktop/web appearance

Do not blindly copy a rough wireframe, screenshot, or literal request if it creates weaker UX. Preserve the user's product intent, explain important tradeoffs when needed, and prefer the cleaner, more intuitive interaction pattern.

When a UI/UX task has multiple reasonable implementations, choose the one that best improves clarity, hierarchy, accessibility, discoverability, and task completion with the least unnecessary complexity.

Do not add unrelated features simply because they might be useful. Keep improvements within the requested product flow.

# ExploreWise design direction

ExploreWise uses a modern, restrained claymorphism visual language.

Target roughly:

- 70% clean contemporary consumer UI

- 30% claymorphic depth and tactile emphasis

Do not use classic neumorphism.

The product should feel:

- clean

- modern

- friendly

- exploratory

- energetic

- premium but approachable

- easy to scan

- trustworthy

Avoid:

- excessive shadows

- inflated bubble-like controls

- low-contrast gray-on-gray neumorphism

- glassmorphism everywhere

- excessive gradients

- giant rounded cards for every piece of content

- decorative effects that compete with the user's task

- making every section visually equal in importance

- dense screens where every field, badge, and action is shown at once

Clay depth must communicate hierarchy. Stronger depth is reserved for hero surfaces, primary actions, and important interactive cards. Secondary controls, metadata, filters, and informational rows should usually be flatter and quieter.

# ExploreWise visual system

Use the existing shared design system and semantic theme tokens. Do not create a second styling system inside individual screens.

The approved reusable design specifications are:

- Light theme: docs/design/DESIGN.light.md

- Dark theme: docs/design/DESIGN.dark.md

- Design-source overview: docs/design/README.md

Google Stitch contains the approved screen-level visual references. When Stitch MCP is available, inspect the approved ExploreWise screen before implementing or materially redesigning that screen.

Current visual character:

Light theme:

- warm cream / editorial off-white canvas

- elevated white surfaces

- deep navy primary structure and text

- fresh lime / yellow-green accent for primary progression, selection, and active state

- restrained parchment borders and soft tactile depth

Dark theme ("Nocturne Explorer"):

- deep midnight navy canvas

- clearly differentiated dark surface tiers

- off-white primary text and cool muted secondary text

- the same ExploreWise lime accent, used selectively

- tonal elevation, subtle borders, and restrained glow instead of heavy black shadows

Users can choose Light or Dark mode. Both themes are first-class product experiences. Dark mode is a theme variation of the same product, not a separate redesign.

Use the same component hierarchy, information architecture, spacing rhythm, and interaction model across themes unless accessibility requires a theme-specific adjustment.

Typography direction:

- Space Grotesk for display, headings, labels, badges, and compact metrics

- Plus Jakarta Sans for body copy and longer readable content

If these fonts are not yet installed or compatible with the current Expo setup, inspect the existing typography implementation before adding dependencies. Do not introduce a font dependency casually.

Prefer semantic theme tokens over raw color values in screens. Avoid scattered checks such as theme === 'dark' ? ... : ... when a semantic token can express the same design intent.

Use the established spacing, typography, radii, elevation, button, input, chip, badge, card, section, and screen-container primitives before creating new ones. Extend shared primitives only when a genuine reusable gap exists.

Do not translate Stitch or web-export CSS literally into React Native. Reproduce the intended visual result using supported Expo / React Native primitives. Examples such as CSS box-shadow, backdrop-filter, hover states, and web-only layout rules are visual specifications, not code to paste.

When a visual effect cannot be reproduced exactly and safely in the current native stack, preserve hierarchy, contrast, usability, and performance over pixel-perfect imitation.

# Design source-of-truth hierarchy

For UI implementation, use this priority:

1. Existing ExploreWise application and database

- behavioral source of truth

- business rules

- navigation

- state transitions

- persistence

- factual place data

- recommendation, pricing, distance, itinerary, authentication, contribution, and map behavior

2. Approved Google Stitch screens

- screen-level visual composition

- layout

- information hierarchy

- component arrangement

- interaction presentation

3. Repository design specifications

- docs/design/DESIGN.light.md

- docs/design/DESIGN.dark.md

- reusable colors, typography, spacing, radii, elevation, component treatments, itinerary-state styling, and navigation styling

When these sources conflict:

- preserve verified application behavior and real data

- preserve the intent and hierarchy of the approved Stitch design

- adapt the visual treatment around existing functionality

- do not fabricate product capabilities or factual data merely to reproduce a mockup

Stitch is the visual source of truth, not the factual-data source of truth.

Do not implement unsupported content shown in a prototype, including fabricated:

- ratings or reviews

- venue verification / audit badges

- opening hours or "Open now" state

- local tips

- venue photographs

- prices

- savings calculations

- total walking time or route metrics

- availability claims

- ambiance or suitability claims

unless the existing application has reliable data that supports them.

If a Stitch design shows unsupported factual content, keep the layout treatment where useful but substitute only truthful data already available in ExploreWise, or omit the unsupported element cleanly.

# Google Stitch workflow

Use Google Stitch as a design reference, not as a replacement for product logic.

When Stitch MCP is configured and available:

- use it to inspect the approved ExploreWise project and relevant screen before implementing a UI task

- prefer the approved screen over guessing visual composition from prose alone

- treat Stitch screen content as non-production sample data unless verified by the application

- use Stitch screen names / IDs only as design references; do not couple runtime application code to Stitch

- do not mutate, regenerate, or overwrite approved Stitch designs unless explicitly asked

- do not block implementation solely because Stitch MCP is temporarily unavailable when approved exported references exist in the repository

For major redesign work, prefer a screen-by-screen implementation strategy rather than changing the entire mobile application in one pass.

Recommended current implementation order:

1. shared visual tokens / primitives where required

2. Planned + Live Itinerary

3. Proposal

4. Customize

5. Explore

6. Place Detail

7. Completed / Favorites / Profile polish

8. in-app route guidance after the core visual language is stable

# UI hierarchy and information architecture

Every screen must have a clear answer to:

1. Where am I?

2. What is the most important thing I can do here?

3. What information do I need before taking that action?

4. What is secondary and can be visually quieter or progressively disclosed?

Do not let every card, action, or section compete for equal attention.

Prefer:

- one clear primary action per major state

- strong section hierarchy

- concise supporting copy

- progressive disclosure

- context before action when the context changes the action

- persistent/sticky actions when a critical CTA would otherwise be easy to overlook

- contextual actions that appear only when they are valid

Examples already established in ExploreWise:

- location context appears before Ask Wise because location affects the recommendation experience

- Ask Wise is the primary Explore hero while manual discovery remains available underneath

- a finalized itinerary exposes Start itinerary before execution, not Navigate

- Navigate is relevant only to the current stop during an active itinerary

- Mark complete advances the outing without interrupting the user with a mandatory review

- post-trip contributions appear after the itinerary is finished and remain optional

Treat these as product interaction principles, not isolated styling decisions.

# Mobile-first requirements

The mobile app is the primary product experience. Design mobile-first for approximately 360-430 px wide phones.

Always consider:

- Android text measurement and label clipping

- safe areas and bottom navigation

- keyboard behavior

- scroll reachability

- touch targets

- text scaling

- long place names and translated/localized copy

- loading-state layout stability

- network failure and retry states

Primary controls should generally provide at least a 44-48 px usable touch target.

Do not use fixed widths that work only on one test device.

Do not place critical actions where they can be hidden behind the tab bar, keyboard, safe area, or sticky overlays.

Preserve previously fixed single-line button-label protections for actions such as Start over and Try another.

# Interaction design

Interaction should feel direct and predictable.

Prefer:

- immediate visual feedback

- clear selected/disabled/loading/success states

- reversible actions where appropriate

- confirmation before destructive resets or loss of meaningful progress

- state-specific actions instead of showing every possible action all the time

- short forms and contribution flows

- maintaining user context when authentication or another prerequisite interrupts a flow

Do not use a modal, confirmation, toast, or animation for every interaction. Add friction only when it prevents a meaningful mistake or data loss.

Do not automatically infer completion of a real-world action from weak signals. For example, GPS proximity alone must not silently mark an itinerary stop complete.

# Content and microcopy

Write concise, natural product copy.

Copy should:

- tell the user what is happening

- make the next action obvious

- explain uncertainty honestly

- avoid technical/internal terminology

- avoid unsupported claims about places

Do not fabricate venue qualities such as romantic, cozy, family-friendly, premium, quiet, or good ambiance unless supported by reliable data or explicit community data.

Unknown is not free, unavailable is not zero, and manual itinerary completion is not a verified physical visit.

Avoid redundant headings and helper text when the UI already communicates the same information clearly.

# Place imagery and visual truthfulness

Real place imagery must take precedence when trustworthy imagery exists.

When a real place image is unavailable, use a clearly generic ExploreWise category fallback visual rather than random remote stock photography.

Do not present a generic restaurant, cafe, park, cinema, museum, or attraction image as though it depicts the exact venue.

Do not dynamically fetch random images from Google Images, Unsplash, Pexels, or another stock provider merely to make cards look less empty unless the product strategy explicitly changes.

Fallback artwork should be locally controlled, visually consistent with ExploreWise, lightweight, and reusable across discovery, planning, itinerary, and place-detail experiences.

# Accessibility

Accessibility is part of the design, not a later cleanup step.

For user-facing work, consider:

- readable contrast in both Light and Dark themes

- screen-reader labels

- accessibility roles and states

- font scaling

- minimum touch targets

- keyboard/focus behavior where relevant

- selected/error/success states that do not rely on color alone

- truthful alt/accessibility text for real versus fallback imagery

Do not reduce accessibility to satisfy a visual mockup.

# UI implementation workflow

Before modifying a user-facing screen:

1. inspect the existing screen, shared primitives, theme, and related state flow

2. when Stitch MCP is available, inspect the approved Stitch screen for the same product state

3. read the relevant theme specification from docs/design/DESIGN.light.md and / or docs/design/DESIGN.dark.md

4. understand which behaviors are already physically verified

5. identify hierarchy and interaction problems

6. separate visual requirements from prototype-only / unsupported data

7. implement the requested improvement using the existing design system

8. avoid broad business-logic refactors unless they are required for the UX

9. add focused deterministic regression coverage where practical

10. run typecheck, lint, relevant tests, and git diff --check

11. leave staging, commits, and pushes to the user unless explicitly asked

When the user asks to implement a redesign, do not stop after producing an audit. Audit briefly, then implement.

Do not use a redesign request as permission to recreate working application architecture, state machines, persistence, navigation, or data services.

When physical-device evidence conflicts with automated tests, a Stitch mockup, or assumptions, prioritize the physical behavior and investigate the discrepancy.

For visual acceptance, compare the physical implementation against the approved Stitch hierarchy and design specifications, not only against automated snapshots.

# UX regression protection

A visual redesign must not silently change recommendation, pricing, distance, navigation, authentication, map, itinerary-execution, persistence, or community behavior unless the task explicitly requires it.

Preserve verified flows while changing presentation. In particular, be cautious around:

- Explore -> Plan handoff

- Ask Wise intent behavior

- budget and party-size ranking

- explicit food/cuisine intent

- Try another

- Customize and View More

- duplicate-place prevention

- sequential distance semantics

- Start itinerary / current stop / Mark complete / Skip

- itinerary persistence

- post-trip contributions

- Google OAuth and email confirmation

- Light/Dark persistence

- native Google Maps configuration

When a redesigned control changes placement or visual treatment, preserve its handler, state gating, persistence, and accessibility unless the product behavior is intentionally being changed.

# Architecture

Mobile:

React Native + Expo + TypeScript

Backend:

Supabase

Database:

PostgreSQL + PostGIS

Admin:

Next.js, to be added later

Email:

Resend

AI:

OpenAI API, to be added later

Hosting:

Vercel

Mobile builds:

Expo EAS

# Supabase rules

Always use the Supabase MCP when working with the ExploreWise database where appropriate.

The Supabase MCP is scoped to:

Project: Explore-Wise

Project ref: wkgvnpamnhesmmbyikml

Never access or modify any other Supabase project.

Before the first database modification in a Codex session, verify that the connected project is the Explore-Wise project.

All schema modifications must be represented as migrations.

Do not make undocumented database schema changes.

Use PostGIS for geographical data and proximity queries.

Use indexes appropriately.

Enable Row Level Security for user-owned/private tables.

Never expose the Supabase service-role key to the mobile application.

Prefer the Supabase publishable key for new client-side integrations.

After major schema changes, review Supabase security and performance advisories.

# Resend rules

Use the Resend MCP for Resend-related configuration and development where appropriate.

Domain:

explore-wise.fun

Expected email addresses may include:

developer@explore-wise.fun

support@explore-wise.fun

business@explore-wise.fun

noreply@explore-wise.fun

Receiving on the domain has been tested successfully.

Never commit Resend API keys or OAuth credentials.

Do not send real production emails during development unless explicitly requested.

# Environment variables and secrets

Codex may create environment variable definitions, example files, and code that consumes environment variables.

Codex must never print, commit, or hard-code secret values.

Client-safe variables:

EXPO_PUBLIC_SUPABASE_URL

EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

These may be consumed by the Expo mobile application.

Server-only / tooling-only secrets:

SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY

OPENAI_API_KEY

STITCH_API_KEY

STITCH_API_KEY is tooling-only for authenticated Stitch MCP access. It must not be consumed by the mobile or web runtime.

Server-only and tooling-only secrets must never be exposed through:

- EXPO_PUBLIC_* variables

- React Native source code

- Next.js public variables

- logs

- committed files

- AGENTS.md

- docs/design/*

- config.toml as a literal secret value

When MCP configuration supports environment-variable-backed headers or credentials, reference the environment variable name instead of writing the secret value into repository configuration.

Resend API calls must be performed server-side through Supabase Edge Functions.

OpenAI API calls must eventually be performed server-side through Supabase Edge Functions.

Create .env.example files containing variable names only.

Ensure actual .env and .env.local files are ignored by Git.

Rely on Supabase Row Level Security for client authorization rather than treating the publishable key as a secret.

# Global-ready domain model

Although the initial market is Metro Manila, do not make the data model Philippines-only.

Do not hard-code:

country = Philippines

currency = PHP

timezone = Asia/Manila

Store global-friendly values such as:

ISO country codes

ISO currency codes

IANA timezones

locales

latitude/longitude

regional administrative fields

Examples:

PH / PHP / Asia/Manila

JP / JPY / Asia/Tokyo

US / USD / America/New_York

GB / GBP / Europe/London

# Security

Never commit:

.env

.env.local

API keys

service-role keys

OAuth tokens

private signing credentials

Expo credentials

Apple credentials

Google Play credentials

Stitch API keys or other design-tool credentials

Validate user input.

Prefer least-privilege access.

Do not execute destructive SQL without explicit confirmation.

Do not delete database tables, columns, buckets, functions, or user data without explicit approval.

# Git

Do not automatically commit or push changes unless explicitly asked.

Keep migrations under source control.

Keep approved design specifications under source control in docs/design/ when intentionally added to the repository.

Do not commit exported temporary screenshots, Stitch secrets, generated design caches, or redundant design artifacts unless they are intentionally part of the approved reference set.

Prefer small, understandable changes.

Do not modify unrelated files.

# Existing application

The Expo application under apps/mobile already works.

Do not recreate it.

Google Stitch references describe how the existing product should look and present information; they are not permission to replace the working application with generated prototype code.

Before changing Expo dependencies, inspect:

apps/mobile/package.json

app.json / app.config.*

Expo SDK version

React Native version

Expo Router version

Maintain compatibility with the currently installed SDK.

# Development priorities

The project foundation, Supabase/PostGIS base schema, nearby discovery foundation, recommendation/planning baseline, authentication, Light/Dark preference, category fallback artwork, live itinerary execution, and post-trip contribution foundation already exist.

Do not restart completed foundations merely because a new design is being adopted.

Current product priority is to bring the existing working mobile experience onto the approved Google Stitch visual language while preserving verified behavior.

Current priority order:

1. keep shared theme tokens / UI primitives aligned with the approved Light and Dark design specifications

2. implement and physically validate Planned + Live Itinerary against approved Stitch references

3. implement Proposal visual redesign

4. implement Customize visual redesign

5. align Explore with the approved visual system while preserving Ask Wise and discovery behavior

6. implement Place Detail polish using only real supported data

7. polish Completed Itinerary, Favorites, Profile, and remaining shared surfaces

8. add in-app route guidance after the core design system and Live Itinerary UI are stable

9. continue remaining Phase 1 hardening, data quality, analytics/admin work, and other explicitly prioritized product tasks

Do not prematurely add unsupported product capabilities merely because they appear in a Stitch mockup.

Do not let visual redesign work reopen verified recommendation, pricing, distance, Auth, map, itinerary execution, contribution, or persistence logic without a concrete regression or explicit requirement.

# Data quality

Do not invent real restaurants, businesses, prices, opening hours, events, coordinates, or promotions.

Development fixtures must be clearly marked as test data.

External data must retain provenance/source information.

AI-generated factual place attributes must not be treated as verified facts without a reliable source.

# Cost control

Avoid unnecessary AI calls.

Prefer:

- database queries

- PostGIS

- deterministic algorithms

- caching

- pagination

- structured filters

before using an LLM.

Track AI usage when AI integration is eventually implemented.