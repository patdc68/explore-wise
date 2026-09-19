import {
  type PlacePresentationVariant,
  type PlacePhotoAuthorAttribution,
} from '../../../packages/place-presentation/src/contracts.ts';

export const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';
export const GOOGLE_PLACE_DETAILS_FIELD_MASK = 'photos';
export const MAX_GOOGLE_PRESENTATION_TIMEOUT_MS = 8_000;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GooglePhotoMetadata = Readonly<{
  resourceName: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions: readonly PlacePhotoAuthorAttribution[];
  googleMapsUri: string;
  flagContentUri?: string;
}>;

export type GooglePhotoPresentation = Readonly<{
  uri: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions: readonly PlacePhotoAuthorAttribution[];
  googleMapsUri: string;
  flagContentUri?: string;
}>;

export type GooglePhotoFetchResult = Readonly<{
  presentation: GooglePhotoPresentation | null;
  apiCallCount: number;
}>;

export class GooglePresentationClientError extends Error {
  readonly code: 'api_error' | 'malformed_response' | 'missing_api_key';
  readonly retryable: boolean;
  readonly apiCallCount: number;

  constructor(
    code: 'api_error' | 'malformed_response' | 'missing_api_key',
    retryable: boolean,
    message: string,
    apiCallCount = 1,
  ) {
    super(message);
    this.name = 'GooglePresentationClientError';
    this.code = code;
    this.retryable = retryable;
    this.apiCallCount = apiCallCount;
  }
}

function recordLike(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function positiveDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 4_800 ? value : undefined;
}

function parseAttribution(value: unknown): PlacePhotoAuthorAttribution | null {
  const record = recordLike(value);
  if (!record || typeof record.displayName !== 'string' || !record.displayName.trim() || record.displayName.length > 400) return null;
  const uri = record.uri === undefined ? undefined : httpsUrl(record.uri) ?? undefined;
  const photoUri = record.photoUri === undefined ? undefined : httpsUrl(record.photoUri) ?? undefined;
  if (record.uri !== undefined && !uri) return null;
  if (record.photoUri !== undefined && !photoUri) return null;
  return { displayName: record.displayName.trim(), ...(uri ? { uri } : {}), ...(photoUri ? { photoUri } : {}) };
}

function resourceName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  return /^places\/[A-Za-z0-9._~-]+\/photos\/[A-Za-z0-9._~:-]+$/.test(value) ? value : null;
}

export function parseGooglePhotoDetails(value: unknown): GooglePhotoMetadata | null {
  const root = recordLike(value);
  if (!root || !Array.isArray(root.photos)) return null;
  for (const item of root.photos) {
    const photo = recordLike(item);
    if (!photo) continue;
    const name = resourceName(photo.name);
    const googleMapsUri = httpsUrl(photo.googleMapsUri);
    if (!name || !googleMapsUri) continue;
    const rawAuthors = photo.authorAttributions;
    const parsedAuthors = rawAuthors === undefined
      ? []
      : Array.isArray(rawAuthors) ? rawAuthors.map(parseAttribution) : null;
    // If Google supplied attribution data, do not silently drop malformed
    // entries and show the photo without the required credit metadata.
    if (parsedAuthors === null || parsedAuthors.some((author) => author === null)) continue;
    const authors = parsedAuthors as PlacePhotoAuthorAttribution[];
    return {
      resourceName: name,
      ...(positiveDimension(photo.widthPx) ? { widthPx: positiveDimension(photo.widthPx) } : {}),
      ...(positiveDimension(photo.heightPx) ? { heightPx: positiveDimension(photo.heightPx) } : {}),
      authorAttributions: authors,
      googleMapsUri,
      ...(httpsUrl(photo.flagContentUri) ? { flagContentUri: httpsUrl(photo.flagContentUri)! } : {}),
    };
  }
  return null;
}

export function parseGooglePhotoMedia(value: unknown): string | null {
  const root = recordLike(value);
  return root ? httpsUrl(root.photoUri) : null;
}

function dimensionsFor(variant: PlacePresentationVariant): { width: number; height: number } {
  if (variant === 'hero') return { width: 1_280, height: 720 };
  if (variant === 'card') return { width: 960, height: 540 };
  return { width: 192, height: 192 };
}

async function fetchJson(fetcher: Fetcher, url: string, init: RequestInit, timeoutMs: number, apiCallCount: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new GooglePresentationClientError('api_error', response.status === 429 || response.status >= 500, `Google Places returned HTTP ${response.status}.`, apiCallCount);
    try {
      return await response.json();
    } catch {
      throw new GooglePresentationClientError('malformed_response', false, 'Google Places returned invalid JSON.', apiCallCount);
    }
  } catch (error) {
    if (error instanceof GooglePresentationClientError) throw error;
    throw new GooglePresentationClientError('api_error', true, controller.signal.aborted ? 'Google Places request timed out.' : 'Google Places request failed.', apiCallCount);
  } finally {
    clearTimeout(timer);
  }
}

export class GooglePlacesPresentationClient {
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(
    apiKey: string,
    fetcher: Fetcher = fetch,
    timeoutMs = MAX_GOOGLE_PRESENTATION_TIMEOUT_MS,
  ) {
    this.apiKey = apiKey.trim();
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    if (!this.apiKey) throw new GooglePresentationClientError('missing_api_key', false, 'GOOGLE_PLACES_API_KEY is required for presentation enrichment.');
  }

  async fetchPhoto(googlePlaceId: string, variant: PlacePresentationVariant): Promise<GooglePhotoFetchResult> {
    const details = await fetchJson(
      this.fetcher,
      `${GOOGLE_PLACES_BASE_URL}/places/${encodeURIComponent(googlePlaceId)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': GOOGLE_PLACE_DETAILS_FIELD_MASK,
        },
      },
      this.timeoutMs,
      1,
    );
    const metadata = parseGooglePhotoDetails(details);
    if (!metadata) return { presentation: null, apiCallCount: 1 };
    const dimensions = dimensionsFor(variant);
    const media = await fetchJson(
      this.fetcher,
      `${GOOGLE_PLACES_BASE_URL}/${metadata.resourceName}/media?maxHeightPx=${dimensions.height}&maxWidthPx=${dimensions.width}&skipHttpRedirect=true`,
      {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Goog-Api-Key': this.apiKey },
      },
      this.timeoutMs,
      2,
    );
    const uri = parseGooglePhotoMedia(media);
    if (!uri) return { presentation: null, apiCallCount: 2 };
    return { presentation: { uri, widthPx: metadata.widthPx, heightPx: metadata.heightPx, authorAttributions: metadata.authorAttributions, googleMapsUri: metadata.googleMapsUri, ...(metadata.flagContentUri ? { flagContentUri: metadata.flagContentUri } : {}) }, apiCallCount: 2 };
  }
}
