export const GOOGLE_MATCH_STATUSES = [
  "not_checked",
  "matched",
  "ambiguous",
  "unmatched",
  "needs_review",
  "error",
] as const;

export type GoogleMatchStatus = (typeof GOOGLE_MATCH_STATUSES)[number];

export type ExploreWiseGooglePlace = Readonly<{
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  countryCode: string;
  categoryCode: string | null;
  latitude: number;
  longitude: number;
  source: string;
  sourcePlaceId: string;
}>;

export type GooglePlaceCandidate = Readonly<{
  id: string;
  displayName: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryType: string | null;
}>;

export type GoogleCandidateScore = Readonly<{
  position: number;
  googlePlaceId: string;
  candidateName: string;
  candidateAddress: string | null;
  distanceMeters: number | null;
  nameSimilarity: number;
  coordinateSupport: number;
  localitySupport: number;
  categorySupport: number;
  confidence: number;
}>;

export type GooglePlaceMatchResult = Readonly<{
  ewPlaceId: string;
  bestGooglePlaceId: string | null;
  status: Exclude<GoogleMatchStatus, "not_checked">;
  confidence: number | null;
  candidateCount: number;
  nameSimilarity: number | null;
  coordinateDistanceMeters: number | null;
  localitySupport: number | null;
  categorySupport: number | null;
  ambiguityReason: string | null;
  reason: string;
  algorithmVersion: string;
  apiCallCount: number;
  candidates: readonly GoogleCandidateScore[];
}>;

export interface GooglePlacesSearchClient {
  searchText(place: ExploreWiseGooglePlace): Promise<readonly GooglePlaceCandidate[]>;
}
