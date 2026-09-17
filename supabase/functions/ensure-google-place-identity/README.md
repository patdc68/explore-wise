# Demand-driven Google Place identity

`ensure-google-place-identity` accepts one to five active ExploreWise place UUIDs. It returns stored terminal identities without calling Google and matches only eligible `not_checked` records (or `error` records after the conservative retry interval).

Before deployment, configure `GOOGLE_PLACES_API_KEY` and `SUPABASE_PUBLISHABLE_KEY` as Supabase function secrets. The Google Places Web Service key is server-only and must never use an `EXPO_PUBLIC_` name. `SUPABASE_URL` and the server database credential are supplied by Supabase; the function accepts `SUPABASE_SECRET_KEYS.default` and falls back to the platform-provided legacy service-role variable.

The function intentionally has gateway JWT verification disabled so signed-out discovery can warm identities. It validates the configured publishable key itself, limits each request to five UUIDs and three concurrent Google calls, rate-limits per forwarded client address, reads only active places, and exposes no general database operation.

No Google candidate payload, photo, review, rating, or hours response is persisted.
