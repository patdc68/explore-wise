import type { GoogleMatchStatus } from './google-maps.ts';

export const GOOGLE_IDENTITY_VISIBLE_LIMIT = 3;
export const GOOGLE_IDENTITY_REQUEST_LIMIT = 5;

export type GoogleIdentityResult = Readonly<{
  place_id: string;
  google_place_id: string | null;
  google_match_status: GoogleMatchStatus | null;
  google_match_confidence: number | null;
  google_match_checked_at: string | null;
  google_match_algorithm_version: string | null;
  google_api_calls: number;
}>;

export type GoogleIdentityCandidate = Readonly<{
  place_id: string;
  google_match_status?: GoogleMatchStatus;
}>;

export type EnsureGoogleIdentities = (placeIds: readonly string[]) => Promise<readonly GoogleIdentityResult[]>;

export function visibleNotCheckedPlaceIds(places: readonly GoogleIdentityCandidate[], limit = GOOGLE_IDENTITY_VISIBLE_LIMIT): readonly string[] {
  return [...new Set(places.slice(0, limit).filter((place) => place.google_match_status === 'not_checked').map((place) => place.place_id))];
}

export function mergeGoogleIdentityResults<T extends GoogleIdentityCandidate>(places: readonly T[], results: readonly GoogleIdentityResult[]): T[] {
  const byId = new Map(results.filter((result) => result.google_match_status !== null).map((result) => [result.place_id, result]));
  return places.map((place) => {
    const identity = byId.get(place.place_id);
    return identity ? {
      ...place,
      google_place_id: identity.google_place_id,
      google_match_status: identity.google_match_status ?? place.google_match_status,
      google_match_confidence: identity.google_match_confidence,
    } : place;
  });
}

export async function warmVisibleGooglePlaceIdentitiesWith(
  places: readonly GoogleIdentityCandidate[],
  ensure: EnsureGoogleIdentities,
  onResults?: (results: readonly GoogleIdentityResult[]) => void,
): Promise<readonly GoogleIdentityResult[]> {
  const placeIds = visibleNotCheckedPlaceIds(places);
  if (placeIds.length === 0) return [];
  try {
    const results = await ensure(placeIds);
    const terminal = results.filter((result) => result.google_match_status && result.google_match_status !== 'not_checked');
    if (terminal.length > 0) onResults?.(terminal);
    return results;
  } catch {
    return [];
  }
}
