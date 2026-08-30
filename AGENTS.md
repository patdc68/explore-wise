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

Server-only secrets:

SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
OPENAI_API_KEY

Server-only secrets must never be exposed through:

- EXPO_PUBLIC_* variables
- React Native source code
- Next.js public variables
- logs
- committed files
- AGENTS.md
- config.toml

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

Validate user input.

Prefer least-privilege access.

Do not execute destructive SQL without explicit confirmation.

Do not delete database tables, columns, buckets, functions, or user data without explicit approval.

# Git

Do not automatically commit or push changes unless explicitly asked.

Keep migrations under source control.

Prefer small, understandable changes.

Do not modify unrelated files.

# Existing application

The Expo application under apps/mobile already works.

Do not recreate it.

Before changing Expo dependencies, inspect:

apps/mobile/package.json
app.json / app.config.*
Expo SDK version
React Native version
Expo Router version

Maintain compatibility with the currently installed SDK.

# Development priorities

Current priority order:

1. Project foundation
2. Supabase/PostGIS schema
3. Metro Manila data ingestion
4. Basic place discovery
5. Budget and distance filtering
6. Recommendation engine
7. Events and activities
8. Ask Wise natural-language interface
9. AI itinerary generation
10. Community contributions
11. Merchant functionality
12. Monetization

Do not prematurely implement later phases.

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
