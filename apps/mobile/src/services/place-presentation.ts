import { getSupabaseClient } from '@/lib/supabase';
import { ensureGooglePlaceIdentities } from '@/services/google-place-identity';
import type { GoogleMatchStatus } from '@/services/google-maps';
import {
  categoryFallbackPresentation,
  PLACE_PRESENTATION_MAX_PLACES,
  validatePlacePresentationResponse,
  type PlacePresentationRequestV1,
  type PlacePresentationV1,
  type PlacePresentationVariant,
} from '../../../../packages/place-presentation/src/contracts.ts';

export type PlacePresentationCandidate = Readonly<{
  place_id: string;
  category_code?: string | null;
  google_match_status?: GoogleMatchStatus | string | null;
}>;

export type PresentationInvoke = (functionName: string, options: Readonly<{
  body: PlacePresentationRequestV1;
  signal?: AbortSignal;
  timeout?: number;
}>) => Promise<Readonly<{ data: unknown; error: unknown | null }>>;

export type PlacePresentationServiceOptions = Readonly<{
  invoke?: PresentationInvoke;
  ensureIdentities?: (placeIds: readonly string[]) => Promise<readonly {
    place_id: string;
    google_place_id: string | null;
    google_match_status: GoogleMatchStatus | null;
  }[]>;
  timeoutMs?: number;
}>;

export type PlacePresentationFetchOptions = Readonly<{
  allowGoogle?: boolean;
  signal?: AbortSignal;
}>;

const fallbackReason = (candidate: PlacePresentationCandidate): Parameters<typeof categoryFallbackPresentation>[2] => {
  const status = candidate.google_match_status;
  if (!status || status === 'not_checked' || status === 'error') return 'identity_pending';
  return status === 'unmatched' || status === 'ambiguous' || status === 'needs_review' ? 'unmatched' : 'unavailable';
};

function fallback(candidate: PlacePresentationCandidate, reason = fallbackReason(candidate)): PlacePresentationV1 {
  return categoryFallbackPresentation(candidate.place_id, candidate.category_code ?? null, reason);
}

function defaultInvoke(functionName: string, options: Readonly<{ body: PlacePresentationRequestV1; signal?: AbortSignal; timeout?: number }>) {
  return getSupabaseClient().functions.invoke<unknown>(functionName, { body: options.body, signal: options.signal, timeout: options.timeout });
}

function uniqueCandidates(candidates: readonly PlacePresentationCandidate[]): readonly PlacePresentationCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const id = candidate.place_id.trim().toLowerCase();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, PLACE_PRESENTATION_MAX_PLACES);
}

function isAbortError(value: unknown): boolean {
  return typeof value === 'object' && value !== null && ((value as { name?: unknown }).name === 'AbortError' || (value as { code?: unknown }).code === 'ABORT_ERR');
}

function responseMap(value: unknown): Map<string, PlacePresentationV1> | null {
  const validated = validatePlacePresentationResponse(value);
  if (!validated.success) return null;
  const map = new Map<string, PlacePresentationV1>();
  for (const presentation of validated.data.presentations) map.set(presentation.ewPlaceId.toLowerCase(), presentation);
  return map;
}

export class PlacePresentationService {
  private readonly invoke: PresentationInvoke;
  private readonly ensureIdentities: NonNullable<PlacePresentationServiceOptions['ensureIdentities']>;
  private readonly timeoutMs: number;
  private readonly inFlight = new Map<string, Promise<readonly PlacePresentationV1[]>>();

  constructor(options: PlacePresentationServiceOptions = {}) {
    this.invoke = options.invoke ?? defaultInvoke;
    this.ensureIdentities = options.ensureIdentities ?? ensureGooglePlaceIdentities;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async fetch(
    candidates: readonly PlacePresentationCandidate[],
    variant: PlacePresentationVariant,
    options: PlacePresentationFetchOptions = {},
  ): Promise<readonly PlacePresentationV1[]> {
    const visible = uniqueCandidates(candidates);
    if (visible.length === 0) return [];
    if (options.allowGoogle === false) return visible.map((candidate) => fallback(candidate, 'policy_blocked'));
    if (options.signal?.aborted) return visible.map((candidate) => fallback(candidate, 'offline'));
    const key = `${variant}:${visible.map((candidate) => candidate.place_id.toLowerCase()).join(',')}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const work = this.fetchVisible(visible, variant, options.signal).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  private async fetchVisible(visible: readonly PlacePresentationCandidate[], variant: PlacePresentationVariant, signal?: AbortSignal): Promise<readonly PlacePresentationV1[]> {
    const pendingIdentityIds = visible.filter((candidate) => !candidate.google_match_status || candidate.google_match_status === 'not_checked').map((candidate) => candidate.place_id);
    const identityById = new Map<string, GoogleMatchStatus | null>();
    if (pendingIdentityIds.length > 0) {
      try {
        const identities = await this.ensureIdentities(pendingIdentityIds);
        for (const identity of identities) identityById.set(identity.place_id.toLowerCase(), identity.google_match_status);
      } catch {
        return visible.map((candidate) => fallback(candidate, 'offline'));
      }
    }
    if (signal?.aborted) return visible.map((candidate) => fallback(candidate, 'offline'));
    const requestIds = visible.filter((candidate) => {
      const status = identityById.get(candidate.place_id.toLowerCase()) ?? candidate.google_match_status;
      return status === 'matched' || (status === undefined && Boolean(candidate.google_match_status));
    }).map((candidate) => candidate.place_id);
    if (requestIds.length === 0) {
      return visible.map((candidate) => {
        const status = identityById.get(candidate.place_id.toLowerCase());
        return status && status !== 'matched' ? fallback(candidate, status === 'not_checked' ? 'identity_pending' : 'unmatched') : fallback(candidate);
      });
    }
    const request: PlacePresentationRequestV1 = { requestVersion: 1, ewPlaceIds: requestIds, variant };
    try {
      const result = await this.invoke('get-place-presentation', { body: request, signal, timeout: this.timeoutMs });
      if (result.error) return visible.map((candidate) => fallback(candidate, 'unavailable'));
      const parsed = responseMap(result.data);
      if (!parsed) return visible.map((candidate) => fallback(candidate, 'unavailable'));
      return visible.map((candidate) => parsed.get(candidate.place_id.toLowerCase()) ?? fallback(candidate, 'unavailable'));
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) return visible.map((candidate) => fallback(candidate, 'offline'));
      return visible.map((candidate) => fallback(candidate, 'unavailable'));
    }
  }
}

export const placePresentationService = new PlacePresentationService();

export async function fetchPlacePresentations(
  candidates: readonly PlacePresentationCandidate[],
  variant: PlacePresentationVariant,
  options?: PlacePresentationFetchOptions,
): Promise<readonly PlacePresentationV1[]> {
  return placePresentationService.fetch(candidates, variant, options);
}

export function presentationByPlaceId(presentations: readonly PlacePresentationV1[]): ReadonlyMap<string, PlacePresentationV1> {
  return new Map(presentations.map((presentation) => [presentation.ewPlaceId.toLowerCase(), presentation]));
}
