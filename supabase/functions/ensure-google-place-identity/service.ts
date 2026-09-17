import type {
  ExploreWiseGooglePlace,
  GoogleMatchStatus,
  GooglePlaceMatchResult,
} from '../_shared/google-place-identity/types.ts';

export const MAX_GOOGLE_IDENTITY_BATCH_SIZE = 5;
export const MAX_GOOGLE_MATCH_CONCURRENCY = 3;
export const GOOGLE_ERROR_RETRY_AFTER_MS = 24 * 60 * 60 * 1_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NON_RETRYABLE_STATUSES = new Set<GoogleMatchStatus>(['matched', 'needs_review', 'ambiguous', 'unmatched']);

export type StoredGoogleIdentityPlace = ExploreWiseGooglePlace & Readonly<{
  googlePlaceId: string | null;
  googleMatchStatus: GoogleMatchStatus;
  googleMatchConfidence: number | null;
  googleMatchCheckedAt: string | null;
  googlePlaceIdRefreshedAt: string | null;
  googleMatchAlgorithmVersion: string | null;
}>;

export type GoogleIdentityResult = Readonly<{
  place_id: string;
  google_place_id: string | null;
  google_match_status: GoogleMatchStatus | null;
  google_match_confidence: number | null;
  google_match_checked_at: string | null;
  google_match_algorithm_version: string | null;
  google_api_calls: number;
  error?: Readonly<{ code: 'place_not_found' | 'identity_unavailable'; retryable: boolean }>;
}>;

export interface GoogleIdentityRepository {
  readPlaces(placeIds: readonly string[]): Promise<readonly StoredGoogleIdentityPlace[]>;
  persistIfStatus(
    place: StoredGoogleIdentityPlace,
    expectedStatus: 'not_checked' | 'error',
    result: GooglePlaceMatchResult,
    checkedAt: string,
  ): Promise<StoredGoogleIdentityPlace>;
}

export type GooglePlaceMatcher = (place: ExploreWiseGooglePlace) => Promise<GooglePlaceMatchResult>;

export class GoogleIdentityInputError extends Error {
  constructor(readonly code: 'invalid_body' | 'batch_too_large' | 'invalid_place_id') {
    super(code);
    this.name = 'GoogleIdentityInputError';
  }
}

export function validateGoogleIdentityRequest(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GoogleIdentityInputError('invalid_body');
  const keys = Object.keys(value as Record<string, unknown>);
  const placeIds = (value as { place_ids?: unknown }).place_ids;
  if (keys.length !== 1 || keys[0] !== 'place_ids' || !Array.isArray(placeIds) || placeIds.length < 1) {
    throw new GoogleIdentityInputError('invalid_body');
  }
  if (placeIds.length > MAX_GOOGLE_IDENTITY_BATCH_SIZE) throw new GoogleIdentityInputError('batch_too_large');
  if (!placeIds.every((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))) {
    throw new GoogleIdentityInputError('invalid_place_id');
  }
  return [...new Set(placeIds.map((id) => id.toLowerCase()))];
}

function identityResult(place: StoredGoogleIdentityPlace, googleApiCalls = 0): GoogleIdentityResult {
  return {
    place_id: place.id,
    google_place_id: place.googleMatchStatus === 'matched' ? place.googlePlaceId : null,
    google_match_status: place.googleMatchStatus,
    google_match_confidence: place.googleMatchConfidence,
    google_match_checked_at: place.googleMatchCheckedAt,
    google_match_algorithm_version: place.googleMatchAlgorithmVersion,
    google_api_calls: googleApiCalls,
  };
}

function isRetryEligible(place: StoredGoogleIdentityPlace, nowMs: number): place is StoredGoogleIdentityPlace & { googleMatchStatus: 'not_checked' | 'error' } {
  if (place.googleMatchStatus === 'not_checked') return true;
  if (place.googleMatchStatus !== 'error') return false;
  if (!place.googleMatchCheckedAt) return true;
  const checkedAt = Date.parse(place.googleMatchCheckedAt);
  return Number.isFinite(checkedAt) && nowMs - checkedAt >= GOOGLE_ERROR_RETRY_AFTER_MS;
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export class GoogleIdentityService {
  private readonly inFlight = new Map<string, Promise<GoogleIdentityResult>>();

  constructor(
    private readonly repository: GoogleIdentityRepository,
    private readonly matcher: GooglePlaceMatcher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensure(placeIds: readonly string[]): Promise<readonly GoogleIdentityResult[]> {
    const places = await this.repository.readPlaces(placeIds);
    const placeById = new Map(places.map((place) => [place.id.toLowerCase(), place]));
    return mapConcurrent(placeIds, MAX_GOOGLE_MATCH_CONCURRENCY, async (placeId) => {
      const place = placeById.get(placeId.toLowerCase());
      if (!place) return {
        place_id: placeId,
        google_place_id: null,
        google_match_status: null,
        google_match_confidence: null,
        google_match_checked_at: null,
        google_match_algorithm_version: null,
        google_api_calls: 0,
        error: { code: 'place_not_found', retryable: false },
      };
      if (NON_RETRYABLE_STATUSES.has(place.googleMatchStatus) || !isRetryEligible(place, this.now().getTime())) {
        return identityResult(place);
      }
      const existing = this.inFlight.get(place.id);
      if (existing) return existing.then((result) => ({ ...result, google_api_calls: 0 }));
      const work = this.matchAndPersist(place).finally(() => this.inFlight.delete(place.id));
      this.inFlight.set(place.id, work);
      return work;
    });
  }

  private async matchAndPersist(place: StoredGoogleIdentityPlace & { googleMatchStatus: 'not_checked' | 'error' }): Promise<GoogleIdentityResult> {
    let googleApiCalls = 0;
    try {
      const match = await this.matcher(place);
      googleApiCalls = match.apiCallCount;
      const checkedAt = this.now().toISOString();
      const persisted = await this.repository.persistIfStatus(place, place.googleMatchStatus, match, checkedAt);
      return identityResult(persisted, googleApiCalls);
    } catch {
      return {
        ...identityResult(place, googleApiCalls),
        error: { code: 'identity_unavailable', retryable: true },
      };
    }
  }
}
