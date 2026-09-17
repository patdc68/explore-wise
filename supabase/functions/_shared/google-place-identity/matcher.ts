import { GooglePlacesClientError } from "./client.ts";
import { GOOGLE_MATCH_ALGORITHM_VERSION, scoreGooglePlaceMatch } from "./scoring.ts";
import type { ExploreWiseGooglePlace, GooglePlaceMatchResult, GooglePlacesSearchClient } from "./types.ts";

export async function matchExploreWisePlace(
  place: ExploreWiseGooglePlace,
  client: GooglePlacesSearchClient,
): Promise<GooglePlaceMatchResult> {
  try {
    return scoreGooglePlaceMatch(place, await client.searchText(place));
  } catch (error) {
    const known = error instanceof GooglePlacesClientError;
    return {
      ewPlaceId: place.id,
      bestGooglePlaceId: null,
      status: "error",
      confidence: null,
      candidateCount: 0,
      nameSimilarity: null,
      coordinateDistanceMeters: null,
      localitySupport: null,
      categorySupport: null,
      ambiguityReason: null,
      reason: known ? error.message : "Google Places matching failed.",
      algorithmVersion: GOOGLE_MATCH_ALGORITHM_VERSION,
      apiCallCount: known && error.code === "missing_api_key" ? 0 : 1,
      candidates: [],
    };
  }
}
