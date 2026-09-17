import { createClient } from 'npm:@supabase/supabase-js@2.113.0';
import { GooglePlacesTextSearchClient } from '../_shared/google-place-identity/client.ts';
import { matchExploreWisePlace } from '../_shared/google-place-identity/matcher.ts';
import { SupabaseGoogleIdentityRepository } from './repository.ts';
import {
  GoogleIdentityInputError,
  GoogleIdentityService,
  validateGoogleIdentityRequest,
} from './service.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const errorResponse = (code: string, status: number, retryable = false) => json({ error: { code, retryable } }, status);

const requestWindows = new Map<string, { count: number; resetAt: number }>();
const REQUESTS_PER_MINUTE_PER_CLIENT = 30;
let service: GoogleIdentityService | undefined;

function configuredClientKeys(): readonly string[] {
  const keys = new Set<string>();
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim();
  if (publishable) keys.add(publishable);
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (legacy) keys.add(legacy);
  const configured = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const value of Object.values(parsed as Record<string, unknown>)) {
          if (typeof value === 'string' && value.trim()) keys.add(value.trim());
        }
      }
    } catch { /* Invalid platform configuration is handled as an unavailable endpoint. */ }
  }
  return [...keys];
}

function hasValidClientKey(request: Request): boolean {
  const supplied = request.headers.get('apikey')?.trim();
  return Boolean(supplied && configuredClientKeys().includes(supplied));
}

function isRateLimited(request: Request, now = Date.now()): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')?.trim()
    ?? 'unknown';
  const current = requestWindows.get(client);
  if (!current || now >= current.resetAt) {
    requestWindows.set(client, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > REQUESTS_PER_MINUTE_PER_CLIENT;
}

function serverService(): GoogleIdentityService {
  if (service) return service;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  let databaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!databaseKey && secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const configured = (parsed as Record<string, unknown>).default;
        if (typeof configured === 'string') databaseKey = configured.trim();
      }
    } catch { /* The missing-key check below provides the safe failure mode. */ }
  }
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')?.trim();
  if (!supabaseUrl || !databaseKey || !googleApiKey || configuredClientKeys().length === 0) {
    throw new Error('Demand-driven Google identity is not configured.');
  }
  const repository = new SupabaseGoogleIdentityRepository(createClient(supabaseUrl, databaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
  const google = new GooglePlacesTextSearchClient(googleApiKey);
  service = new GoogleIdentityService(repository, (place) => matchExploreWisePlace(place, google));
  return service;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405);
  if (!hasValidClientKey(request)) return errorResponse('unauthorized', 401);
  if (isRateLimited(request)) return errorResponse('rate_limited', 429, true);
  const body = await request.json().catch(() => null);
  let placeIds: readonly string[];
  try {
    placeIds = validateGoogleIdentityRequest(body);
  } catch (error) {
    return errorResponse(error instanceof GoogleIdentityInputError ? error.code : 'invalid_body', 400);
  }
  try {
    const results = await serverService().ensure(placeIds);
    return json({ results });
  } catch {
    console.log(JSON.stringify({ event: 'ensure_google_place_identity', success: false }));
    return errorResponse('identity_unavailable', 503, true);
  }
});
