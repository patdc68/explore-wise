export const PLACE_PRESENTATION_REQUEST_VERSION = 1 as const;
export const PLACE_PRESENTATION_RESPONSE_VERSION = 1 as const;
export const PLACE_PRESENTATION_MAX_PLACES = 3;

export const PLACE_PRESENTATION_VARIANTS = ['thumbnail', 'card', 'hero'] as const;
export type PlacePresentationVariant = (typeof PLACE_PRESENTATION_VARIANTS)[number];

export const PLACE_PRESENTATION_FALLBACK_REASONS = [
  'identity_pending',
  'unmatched',
  'no_photo',
  'unavailable',
  'offline',
  'quota',
  'policy_blocked',
] as const;
export type PlacePresentationFallbackReason = (typeof PLACE_PRESENTATION_FALLBACK_REASONS)[number];

export type PlacePresentationRequestV1 = Readonly<{
  requestVersion: typeof PLACE_PRESENTATION_REQUEST_VERSION;
  ewPlaceIds: readonly string[];
  variant: PlacePresentationVariant;
}>;

export type PlacePhotoAuthorAttribution = Readonly<{
  displayName: string;
  uri?: string;
  photoUri?: string;
}>;

export type GooglePlacePresentationV1 = Readonly<{
  presentationVersion: typeof PLACE_PRESENTATION_RESPONSE_VERSION;
  ewPlaceId: string;
  source: 'google_places';
  fallbackCategory: string | null;
  image: Readonly<{
    uri: string;
    widthPx?: number;
    heightPx?: number;
    provider: 'google_maps';
    authorAttributions: readonly PlacePhotoAuthorAttribution[];
    googleMapsUri: string;
    flagContentUri?: string;
  }>;
}>;

export type CategoryFallbackPresentationV1 = Readonly<{
  presentationVersion: typeof PLACE_PRESENTATION_RESPONSE_VERSION;
  ewPlaceId: string;
  source: 'category_fallback';
  fallbackCategory: string | null;
  fallbackReason: PlacePresentationFallbackReason;
}>;

export type PlacePresentationV1 = GooglePlacePresentationV1 | CategoryFallbackPresentationV1;

export type PlacePresentationResponseV1 = Readonly<{
  responseVersion: typeof PLACE_PRESENTATION_RESPONSE_VERSION;
  presentations: readonly PlacePresentationV1[];
}>;

type RecordLike = Readonly<Record<string, unknown>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_CATEGORY_LENGTH = 160;
const MAX_DISPLAY_NAME_LENGTH = 400;

function recordLike(value: unknown): RecordLike | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordLike : null;
}

function onlyKeys(record: RecordLike, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.every((key) => allowed.includes(key));
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function validCategory(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= MAX_CATEGORY_LENGTH && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/iu.test(value));
}

function validDimension(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 4_800);
}

export type ContractValidationResult<T> = Readonly<
  | { success: true; data: T }
  | { success: false; code: string }
>;

export function validatePlacePresentationRequest(value: unknown): ContractValidationResult<PlacePresentationRequestV1> {
  const record = recordLike(value);
  if (!record || Object.keys(record).length !== 3 || record.requestVersion !== PLACE_PRESENTATION_REQUEST_VERSION) return { success: false, code: 'invalid_request' };
  if (!Array.isArray(record.ewPlaceIds) || record.ewPlaceIds.length < 1 || record.ewPlaceIds.length > PLACE_PRESENTATION_MAX_PLACES) return { success: false, code: 'invalid_place_ids' };
  const ids = record.ewPlaceIds;
  if (!ids.every(validUuid)) return { success: false, code: 'invalid_place_id' };
  const normalizedIds = ids.map((id) => id.toLowerCase());
  if (new Set(normalizedIds).size !== normalizedIds.length) return { success: false, code: 'duplicate_place_id' };
  if (!PLACE_PRESENTATION_VARIANTS.includes(record.variant as PlacePresentationVariant)) return { success: false, code: 'invalid_variant' };
  return { success: true, data: { requestVersion: 1, ewPlaceIds: normalizedIds, variant: record.variant as PlacePresentationVariant } };
}

function validAuthor(value: unknown): value is PlacePhotoAuthorAttribution {
  const record = recordLike(value);
  if (!record || !onlyKeys(record, ['displayName', 'uri', 'photoUri']) || typeof record.displayName !== 'string' || record.displayName.trim().length === 0 || record.displayName.length > MAX_DISPLAY_NAME_LENGTH) return false;
  return (record.uri === undefined || isHttpsUrl(record.uri)) && (record.photoUri === undefined || isHttpsUrl(record.photoUri));
}

function validPresentation(value: unknown): value is PlacePresentationV1 {
  const record = recordLike(value);
  if (!record || !onlyKeys(record, ['presentationVersion', 'ewPlaceId', 'source', 'fallbackCategory', 'fallbackReason', 'image']) || record.presentationVersion !== PLACE_PRESENTATION_RESPONSE_VERSION || !validUuid(record.ewPlaceId) || !validCategory(record.fallbackCategory)) return false;
  if (record.source === 'category_fallback') {
    return onlyKeys(record, ['presentationVersion', 'ewPlaceId', 'source', 'fallbackCategory', 'fallbackReason']) && typeof record.fallbackReason === 'string' && PLACE_PRESENTATION_FALLBACK_REASONS.includes(record.fallbackReason as PlacePresentationFallbackReason);
  }
  if (record.source !== 'google_places') return false;
  if (!onlyKeys(record, ['presentationVersion', 'ewPlaceId', 'source', 'fallbackCategory', 'image'])) return false;
  const image = recordLike(record.image);
  if (!image || !onlyKeys(image, ['uri', 'widthPx', 'heightPx', 'provider', 'authorAttributions', 'googleMapsUri', 'flagContentUri']) || image.provider !== 'google_maps' || !isHttpsUrl(image.uri) || !isHttpsUrl(image.googleMapsUri) || !Array.isArray(image.authorAttributions) || !image.authorAttributions.every(validAuthor)) return false;
  return validDimension(image.widthPx) && validDimension(image.heightPx) && (image.flagContentUri === undefined || isHttpsUrl(image.flagContentUri));
}

export function validatePlacePresentationResponse(value: unknown): ContractValidationResult<PlacePresentationResponseV1> {
  const record = recordLike(value);
  if (!record || Object.keys(record).length !== 2 || record.responseVersion !== PLACE_PRESENTATION_RESPONSE_VERSION || !Array.isArray(record.presentations) || record.presentations.length < 1 || record.presentations.length > PLACE_PRESENTATION_MAX_PLACES) return { success: false, code: 'invalid_response' };
  if (!record.presentations.every(validPresentation)) return { success: false, code: 'invalid_presentation' };
  const ids = record.presentations.map((presentation) => presentation.ewPlaceId.toLowerCase());
  if (new Set(ids).size !== ids.length) return { success: false, code: 'duplicate_presentation' };
  return { success: true, data: value as PlacePresentationResponseV1 };
}

export function serializePlacePresentationResponse(value: PlacePresentationResponseV1): string {
  const parsed = validatePlacePresentationResponse(value);
  if (!parsed.success) throw new Error(parsed.code);
  return JSON.stringify(parsed.data);
}

export function categoryFallbackPresentation(ewPlaceId: string, fallbackCategory: string | null, fallbackReason: PlacePresentationFallbackReason): CategoryFallbackPresentationV1 {
  if (!validUuid(ewPlaceId)) throw new Error('Invalid ExploreWise place ID.');
  if (!validCategory(fallbackCategory)) throw new Error('Invalid fallback category.');
  return { presentationVersion: 1, ewPlaceId: ewPlaceId.toLowerCase(), source: 'category_fallback', fallbackCategory, fallbackReason };
}
