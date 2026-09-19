import {
  categoryFallbackPresentation,
  PLACE_PRESENTATION_MAX_PLACES,
  type PlacePresentationRequestV1,
  type PlacePresentationResponseV1,
  type PlacePresentationV1,
} from '../../../packages/place-presentation/src/contracts.ts';
import { GooglePresentationClientError, type GooglePhotoFetchResult, type GooglePhotoPresentation } from './google.ts';
import type { PresentationPlaceRecord, SupabasePresentationRepository } from './repository.ts';

export const MAX_PRESENTATION_CONCURRENCY = 2;

export interface PresentationPhotoClient {
  fetchPhoto(googlePlaceId: string, variant: PlacePresentationRequestV1['variant']): Promise<GooglePhotoFetchResult>;
}

function mapConcurrent<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!);
    }
  }
  return Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker())).then(() => results);
}

function fallback(placeId: string, category: string | null, reason: Parameters<typeof categoryFallbackPresentation>[2]): PlacePresentationV1 {
  return categoryFallbackPresentation(placeId, category, reason);
}

function itemPresentation(place: PresentationPlaceRecord, photo: GooglePhotoPresentation): PlacePresentationV1 {
  return {
    presentationVersion: 1,
    ewPlaceId: place.ewPlaceId.toLowerCase(),
    source: 'google_places',
    fallbackCategory: place.fallbackCategory,
    image: {
      uri: photo.uri,
      ...(photo.widthPx ? { widthPx: photo.widthPx } : {}),
      ...(photo.heightPx ? { heightPx: photo.heightPx } : {}),
      provider: 'google_maps',
      authorAttributions: photo.authorAttributions,
      googleMapsUri: photo.googleMapsUri,
      ...(photo.flagContentUri ? { flagContentUri: photo.flagContentUri } : {}),
    },
  };
}

export type PresentationServiceResult = Readonly<{
  response: PlacePresentationResponseV1;
  googleSuccessCount: number;
  fallbackCounts: Readonly<Record<string, number>>;
  googleCallCount: number;
}>;

export class PlacePresentationService {
  private readonly repository: Pick<SupabasePresentationRepository, 'readActivePlaces'>;
  private readonly google: PresentationPhotoClient;

  constructor(
    repository: Pick<SupabasePresentationRepository, 'readActivePlaces'>,
    google: PresentationPhotoClient,
  ) {
    this.repository = repository;
    this.google = google;
  }

  async present(request: PlacePresentationRequestV1): Promise<PresentationServiceResult> {
    if (request.ewPlaceIds.length > PLACE_PRESENTATION_MAX_PLACES) throw new Error('Presentation batch is too large.');
    const records = await this.repository.readActivePlaces(request.ewPlaceIds);
    const byId = new Map(records.map((place) => [place.ewPlaceId.toLowerCase(), place]));
    let googleCallCount = 0;
    let googleSuccessCount = 0;
    const fallbackCounts: Record<string, number> = {};
    const results = await mapConcurrent(request.ewPlaceIds, MAX_PRESENTATION_CONCURRENCY, async (placeId) => {
      const place = byId.get(placeId.toLowerCase());
      if (!place) return fallback(placeId, null, 'unmatched');
      if (place.googleMatchStatus !== 'matched' || !place.googlePlaceId) {
        return fallback(place.ewPlaceId, place.fallbackCategory, place.googleMatchStatus === 'not_checked' || place.googleMatchStatus === 'error' ? 'identity_pending' : 'unmatched');
      }
      try {
        const fetched = await this.google.fetchPhoto(place.googlePlaceId, request.variant);
        googleCallCount += fetched.apiCallCount;
        if (!fetched.presentation) return fallback(place.ewPlaceId, place.fallbackCategory, 'no_photo');
        googleSuccessCount += 1;
        return itemPresentation(place, fetched.presentation);
      } catch (error) {
        if (error instanceof GooglePresentationClientError) googleCallCount += error.apiCallCount;
        const reason = error instanceof GooglePresentationClientError && error.code === 'api_error' && error.retryable && error.message.includes('HTTP 429') ? 'quota' : 'unavailable';
        return fallback(place.ewPlaceId, place.fallbackCategory, reason);
      }
    });
    for (const result of results) {
      if (result.source === 'category_fallback') fallbackCounts[result.fallbackReason] = (fallbackCounts[result.fallbackReason] ?? 0) + 1;
    }
    return { response: { responseVersion: 1, presentations: results }, googleSuccessCount, fallbackCounts, googleCallCount };
  }
}
