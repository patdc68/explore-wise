import { createClient } from 'npm:@supabase/supabase-js@2.113.0';
import { validatePlacePresentationRequest, validatePlacePresentationResponse } from '../../../packages/place-presentation/src/contracts.ts';
import { GooglePlacesPresentationClient } from './google.ts';
import { SupabasePresentationRepository } from './repository.ts';
import { PlacePresentationService } from './service.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  // Keep this aligned with the installed supabase-js/functions-js client so
  // browser preflight does not fail when the SDK sends its client metadata.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const MAX_BODY_BYTES = 32_768;
const REQUESTS_PER_MINUTE_PER_CLIENT = 30;
const requestWindows = new Map<string, { count: number; resetAt: number }>();
let service: PlacePresentationService | undefined;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...cors, 'Content-Type': 'application/json', ...headers } });
}

function errorResponse(code: string, status: number, retryable = false): Response {
  return json({ error: { code, retryable } }, status);
}

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
        for (const value of Object.values(parsed as Record<string, unknown>)) if (typeof value === 'string' && value.trim()) keys.add(value.trim());
      }
    } catch { /* A missing configured key is handled as unavailable. */ }
  }
  return [...keys];
}

function hasValidClientKey(request: Request): boolean {
  const supplied = request.headers.get('apikey')?.trim();
  return Boolean(supplied && configuredClientKeys().includes(supplied));
}

function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')?.trim()
    ?? 'unknown';
}

function isRateLimited(request: Request, now = Date.now()): boolean {
  const key = clientKey(request);
  const current = requestWindows.get(key);
  if (!current || now >= current.resetAt) {
    requestWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > REQUESTS_PER_MINUTE_PER_CLIENT;
}

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error('body_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('body_too_large');
  try { return JSON.parse(text); } catch { throw new Error('invalid_json'); }
}

function requestId(): string {
  try { return crypto.randomUUID(); } catch { return `presentation-${Date.now()}`; }
}

function serverService(): PlacePresentationService {
  if (service) return service;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')?.trim();
  let databaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!databaseKey && secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as unknown;
      const configured = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).default : undefined;
      if (typeof configured === 'string' && configured.trim()) databaseKey = configured.trim();
    } catch { /* The missing-key check below provides the safe failure mode. */ }
  }
  if (!supabaseUrl || !databaseKey || !googleApiKey || configuredClientKeys().length === 0) throw new Error('Place presentation is not configured.');
  const client = createClient(supabaseUrl, databaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  service = new PlacePresentationService(new SupabasePresentationRepository(client), new GooglePlacesPresentationClient(googleApiKey));
  return service;
}

Deno.serve(async (request) => {
  const id = requestId();
  const started = Date.now();
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405);
  if (!hasValidClientKey(request)) return errorResponse('unauthorized', 401);
  if (isRateLimited(request)) return errorResponse('rate_limited', 429, true);
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return errorResponse('invalid_content_type', 415);
  let body: unknown;
  try { body = await readBody(request); } catch (error) { return errorResponse(error instanceof Error && error.message === 'body_too_large' ? 'body_too_large' : 'invalid_json', 400); }
  const parsedRequest = validatePlacePresentationRequest(body);
  if (!parsedRequest.success) return errorResponse(parsedRequest.code, 400);
  try {
    const result = await serverService().present(parsedRequest.data);
    const validated = validatePlacePresentationResponse(result.response);
    if (!validated.success) return errorResponse('internal_error', 503, true);
    console.log(JSON.stringify({ event: 'get_place_presentation', request_id: id, requested_count: parsedRequest.data.ewPlaceIds.length, google_success_count: result.googleSuccessCount, fallback_count: result.response.presentations.length - result.googleSuccessCount, fallback_reasons: result.fallbackCounts, google_call_count: result.googleCallCount, latency_ms: Date.now() - started }));
    return json(validated.data);
  } catch {
    console.log(JSON.stringify({ event: 'get_place_presentation', request_id: id, requested_count: parsedRequest.data.ewPlaceIds.length, google_success_count: 0, fallback_count: parsedRequest.data.ewPlaceIds.length, google_call_count: 0, latency_ms: Date.now() - started, outcome: 'unavailable' }));
    return errorResponse('presentation_unavailable', 503, true);
  }
});
