import { getSupabaseClient } from '@/lib/supabase';
import type { GoogleMatchStatus } from './google-maps';
import {
  GOOGLE_IDENTITY_REQUEST_LIMIT,
  warmVisibleGooglePlaceIdentitiesWith,
  type EnsureGoogleIdentities,
  type GoogleIdentityCandidate,
  type GoogleIdentityResult,
} from './google-place-identity-core';

export * from './google-place-identity-core';

const statuses = new Set<GoogleMatchStatus>(['not_checked', 'matched', 'ambiguous', 'unmatched', 'needs_review', 'error']);
const identityCache = new Map<string, GoogleIdentityResult>();
const inFlight = new Map<string, Promise<GoogleIdentityResult | null>>();
const retryAfter = new Map<string, number>();
const BACKGROUND_FAILURE_COOLDOWN_MS = 60_000;

function normalizeIdentityResult(value: unknown): GoogleIdentityResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const status = result.google_match_status;
  if (typeof result.place_id !== 'string' || (status !== null && (typeof status !== 'string' || !statuses.has(status as GoogleMatchStatus)))) return null;
  return {
    place_id: result.place_id,
    google_place_id: typeof result.google_place_id === 'string' ? result.google_place_id : null,
    google_match_status: status as GoogleMatchStatus | null,
    google_match_confidence: typeof result.google_match_confidence === 'number' ? result.google_match_confidence : null,
    google_match_checked_at: typeof result.google_match_checked_at === 'string' ? result.google_match_checked_at : null,
    google_match_algorithm_version: typeof result.google_match_algorithm_version === 'string' ? result.google_match_algorithm_version : null,
    google_api_calls: typeof result.google_api_calls === 'number' ? result.google_api_calls : 0,
  };
}

async function requestGoogleIdentities(placeIds: readonly string[]): Promise<readonly GoogleIdentityResult[]> {
  const { data, error } = await getSupabaseClient().functions.invoke('ensure-google-place-identity', {
    body: { place_ids: placeIds },
  });
  if (error) throw error;
  const results = data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
    ? (data as { results: unknown[] }).results.map(normalizeIdentityResult).filter((result): result is GoogleIdentityResult => result !== null)
    : [];
  return results;
}

export async function ensureGooglePlaceIdentities(placeIds: readonly string[]): Promise<readonly GoogleIdentityResult[]> {
  const unique = [...new Set(placeIds)].slice(0, GOOGLE_IDENTITY_REQUEST_LIMIT);
  const now = Date.now();
  const missing = unique.filter((id) => !identityCache.has(id) && !inFlight.has(id) && (retryAfter.get(id) ?? 0) <= now);
  if (missing.length > 0) {
    const batch = requestGoogleIdentities(missing).catch((error) => {
      for (const id of missing) retryAfter.set(id, Date.now() + BACKGROUND_FAILURE_COOLDOWN_MS);
      throw error;
    });
    for (const id of missing) {
      const pending = batch.then((results) => results.find((result) => result.place_id === id) ?? null).then((result) => {
        if (result?.google_match_status && result.google_match_status !== 'not_checked') {
          identityCache.set(id, result);
          retryAfter.delete(id);
        } else retryAfter.set(id, Date.now() + BACKGROUND_FAILURE_COOLDOWN_MS);
        return result;
      }).finally(() => inFlight.delete(id));
      inFlight.set(id, pending);
    }
  }
  const results = await Promise.all(unique.map((id) => Promise.resolve(identityCache.get(id) ?? inFlight.get(id) ?? null)));
  return results.filter((result): result is GoogleIdentityResult => result !== null);
}

export async function warmVisibleGooglePlaceIdentities(
  places: readonly GoogleIdentityCandidate[],
  onResults?: (results: readonly GoogleIdentityResult[]) => void,
  ensure: EnsureGoogleIdentities = ensureGooglePlaceIdentities,
): Promise<readonly GoogleIdentityResult[]> {
  return warmVisibleGooglePlaceIdentitiesWith(places, ensure, onResults);
}
