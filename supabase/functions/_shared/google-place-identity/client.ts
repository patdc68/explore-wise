import type { ExploreWiseGooglePlace, GooglePlaceCandidate, GooglePlacesSearchClient } from "./types.ts";

export const GOOGLE_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_TEXT_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType";
export const GOOGLE_TEXT_SEARCH_PAGE_SIZE = 5;

export class GooglePlacesClientError extends Error {
  constructor(
    readonly code: "missing_api_key" | "api_error" | "malformed_response",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GooglePlacesClientError";
  }
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function searchRadius(place: ExploreWiseGooglePlace): number {
  return place.categoryCode?.startsWith("outdoor") || place.categoryCode?.startsWith("attraction") ? 3_000 : 1_000;
}

export function buildGoogleTextQuery(place: ExploreWiseGooglePlace): string {
  const fragments = [place.name, place.address, place.district, place.city, place.region].map((value) => value?.trim()).filter(Boolean);
  return [...new Set(fragments)].join(" ");
}

export function buildGoogleTextSearchBody(place: ExploreWiseGooglePlace): Readonly<Record<string, unknown>> {
  return {
    textQuery: buildGoogleTextQuery(place),
    pageSize: GOOGLE_TEXT_SEARCH_PAGE_SIZE,
    languageCode: "en",
    regionCode: place.countryCode,
    locationBias: {
      circle: {
        center: { latitude: place.latitude, longitude: place.longitude },
        radius: searchRadius(place),
      },
    },
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseGoogleTextSearchResponse(value: unknown): readonly GooglePlaceCandidate[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GooglePlacesClientError("malformed_response", "Google Places returned a malformed response.", false);
  const places = (value as { places?: unknown }).places;
  if (places === undefined) return [];
  if (!Array.isArray(places)) throw new GooglePlacesClientError("malformed_response", "Google Places returned a malformed places list.", false);
  return places.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new GooglePlacesClientError("malformed_response", "Google Places returned a malformed candidate.", false);
    const wire = item as Record<string, unknown>;
    const displayName = wire.displayName;
    const nameText = displayName && typeof displayName === "object" && !Array.isArray(displayName)
      ? optionalString((displayName as Record<string, unknown>).text)
      : null;
    const id = optionalString(wire.id);
    if (!id || !nameText) throw new GooglePlacesClientError("malformed_response", "Google Places candidate identity is incomplete.", false);
    const location = wire.location;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (location !== undefined) {
      if (!location || typeof location !== "object" || Array.isArray(location)) throw new GooglePlacesClientError("malformed_response", "Google Places candidate location is malformed.", false);
      const locationRecord = location as Record<string, unknown>;
      if (typeof locationRecord.latitude !== "number" || typeof locationRecord.longitude !== "number"
        || !Number.isFinite(locationRecord.latitude) || !Number.isFinite(locationRecord.longitude)
        || Math.abs(locationRecord.latitude) > 90 || Math.abs(locationRecord.longitude) > 180) {
        throw new GooglePlacesClientError("malformed_response", "Google Places candidate coordinates are malformed.", false);
      }
      latitude = locationRecord.latitude;
      longitude = locationRecord.longitude;
    }
    return {
      id,
      displayName: nameText,
      formattedAddress: optionalString(wire.formattedAddress),
      latitude,
      longitude,
      primaryType: optionalString(wire.primaryType),
    };
  });
}

export class GooglePlacesTextSearchClient implements GooglePlacesSearchClient {
  private readonly apiKey: string;

  constructor(apiKey: string, private readonly fetcher: Fetcher = fetch, private readonly timeoutMs = 8_000) {
    this.apiKey = apiKey.trim();
    if (!this.apiKey) throw new GooglePlacesClientError("missing_api_key", "GOOGLE_PLACES_API_KEY is required for live matching.", false);
  }

  async searchText(place: ExploreWiseGooglePlace): Promise<readonly GooglePlaceCandidate[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(GOOGLE_TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": GOOGLE_TEXT_SEARCH_FIELD_MASK,
        },
        body: JSON.stringify(buildGoogleTextSearchBody(place)),
        signal: controller.signal,
      });
      if (!response.ok) throw new GooglePlacesClientError("api_error", `Google Places Text Search failed with HTTP ${response.status}.`, response.status === 429 || response.status >= 500);
      let payload: unknown;
      try { payload = await response.json(); }
      catch { throw new GooglePlacesClientError("malformed_response", "Google Places returned invalid JSON.", false); }
      return parseGoogleTextSearchResponse(payload);
    } catch (error) {
      if (error instanceof GooglePlacesClientError) throw error;
      const timedOut = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      throw new GooglePlacesClientError("api_error", timedOut ? "Google Places Text Search timed out." : "Google Places Text Search failed.", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
