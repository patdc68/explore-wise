import {
  branchTokens,
  googlePlaceNameSimilarity,
  knownChainBrand,
  normalizeGoogleMatchingText,
  roundScore,
  tokenOverlap,
  tokenizeGoogleMatchingText,
} from "./normalization.ts";
import type { ExploreWiseGooglePlace, GoogleCandidateScore, GooglePlaceCandidate, GooglePlaceMatchResult } from "./types.ts";

export const GOOGLE_MATCH_ALGORITHM_VERSION = "google-text-v1.1.0";
export const GOOGLE_MATCH_WEIGHTS = Object.freeze({ name: 0.45, coordinate: 0.35, locality: 0.10, category: 0.10 });
export const GOOGLE_MATCH_THRESHOLDS = Object.freeze({ matched: 0.90, needsReview: 0.75, ambiguityDelta: 0.03, chainAmbiguityDelta: 0.08 });

const LOCALITY_STOP_WORDS = new Set([
  "the", "and", "of", "at", "in", "philippines", "metro", "city", "street", "st", "road", "rd", "avenue", "ave",
  "floor", "ground", "level", "unit", "building", "bldg", "barangay", "brgy",
]);

const GOOGLE_TYPE_GROUPS: Readonly<Record<string, string>> = {
  restaurant: "food", bar: "food", bar_and_grill: "food", bistro: "food", cafeteria: "food", cocktail_bar: "food",
  deli: "food", diner: "food", gastropub: "food", pub: "food", sports_bar: "food", wine_bar: "food",
  food_court: "food", meal_delivery: "food", meal_takeaway: "food", sandwich_shop: "food", steak_house: "food",
  cafe: "cafe", cat_cafe: "cafe", coffee_roastery: "cafe", coffee_shop: "cafe", coffee_stand: "cafe",
  dog_cafe: "cafe", tea_house: "cafe", bakery: "bakery", bagel_shop: "bakery", pastry_shop: "bakery",
  acai_shop: "dessert", cake_shop: "dessert", candy_store: "dessert", chocolate_shop: "dessert",
  confectionery: "dessert", dessert_restaurant: "dessert", dessert_shop: "dessert", donut_shop: "dessert",
  ice_cream_shop: "dessert", movie_theater: "cinema", movie_rental: "cinema", museum: "museum", art_gallery: "culture",
  historical_landmark: "culture", cultural_landmark: "culture", tourist_attraction: "attraction",
  amusement_center: "recreation", amusement_park: "recreation", bowling_alley: "recreation", gym: "recreation",
  park: "outdoor", botanical_garden: "outdoor", city_park: "outdoor", dog_park: "outdoor", national_park: "outdoor",
  state_park: "outdoor", wildlife_park: "outdoor", garden: "outdoor", hiking_area: "outdoor", picnic_ground: "outdoor", plaza: "outdoor",
  shopping_mall: "mall",
};

function ewCategoryGroup(code: string | null): string | null {
  if (!code) return null;
  if (code === "food.cafe") return "cafe";
  if (code === "food.bakery") return "bakery";
  if (code === "food.dessert") return "dessert";
  if (code === "food" || code === "food.restaurant") return "food";
  if (code === "entertainment.cinema") return "cinema";
  if (code === "attraction.museum") return "museum";
  if (code === "attraction.culture") return "culture";
  if (code === "activity.recreation" || code === "entertainment") return "recreation";
  if (code === "outdoor" || code === "outdoor.park") return "outdoor";
  if (code === "attraction") return "attraction";
  return null;
}

function isLargeProperty(categoryCode: string | null, primaryType: string | null): boolean {
  return Boolean(categoryCode?.startsWith("outdoor") || categoryCode?.startsWith("attraction") || primaryType === "shopping_mall" || primaryType === "park" || primaryType === "tourist_attraction");
}

export function geodesicDistanceMeters(left: Readonly<{ latitude: number; longitude: number }>, right: Readonly<{ latitude: number; longitude: number }>): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.latitude - left.latitude) * radians;
  const longitudeDelta = (right.longitude - left.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

function interpolate(distance: number, points: readonly Readonly<[number, number]>[]): number {
  if (distance <= points[0]![0]) return points[0]![1];
  for (let index = 1; index < points.length; index += 1) {
    const [distanceHigh, scoreHigh] = points[index]!;
    const [distanceLow, scoreLow] = points[index - 1]!;
    if (distance <= distanceHigh) {
      const position = (distance - distanceLow) / (distanceHigh - distanceLow);
      return scoreLow + ((scoreHigh - scoreLow) * position);
    }
  }
  return points.at(-1)![1];
}

export function coordinateSupport(distanceMeters: number | null, largeProperty: boolean): number {
  if (distanceMeters === null) return 0;
  const ordinary = [[0, 1], [50, 0.98], [150, 0.86], [300, 0.62], [750, 0.18], [1500, 0.03], [3000, 0]] as const;
  const large = [[0, 1], [50, 1], [150, 0.97], [300, 0.9], [750, 0.7], [1500, 0.4], [3000, 0.12], [5000, 0]] as const;
  return roundScore(interpolate(distanceMeters, largeProperty ? large : ordinary));
}

export function localitySupport(place: ExploreWiseGooglePlace, candidate: GooglePlaceCandidate): number {
  const source = [place.address, place.district, place.city, place.region].filter(Boolean).join(" ");
  const sourceTokens = tokenizeGoogleMatchingText(source).filter((token) => !LOCALITY_STOP_WORDS.has(token));
  const candidateTokens = tokenizeGoogleMatchingText(candidate.formattedAddress).filter((token) => !LOCALITY_STOP_WORDS.has(token));
  if (sourceTokens.length === 0) return 0.5;
  if (candidateTokens.length === 0) return 0;
  const sourceSupport = tokenOverlap(sourceTokens, candidateTokens);
  const candidateSupport = tokenOverlap(candidateTokens, sourceTokens);
  return roundScore((sourceSupport * 0.75) + (candidateSupport * 0.25));
}

export function categorySupport(categoryCode: string | null, primaryType: string | null): number {
  const source = ewCategoryGroup(categoryCode);
  const normalizedType = primaryType ? normalizeGoogleMatchingText(primaryType).replace(/ /gu, "_") : null;
  const candidate = normalizedType
    ? GOOGLE_TYPE_GROUPS[normalizedType] ?? (normalizedType.endsWith("_restaurant") ? "food" : undefined)
    : undefined;
  if (!source || !candidate) return 0.5;
  if (source === candidate) return 1;
  const foodGroups = new Set(["food", "cafe", "bakery", "dessert"]);
  if (foodGroups.has(source) && foodGroups.has(candidate)) return 0.65;
  const outingGroups = new Set(["cinema", "museum", "culture", "attraction", "recreation", "outdoor", "mall"]);
  if (outingGroups.has(source) && outingGroups.has(candidate)) return 0.55;
  return 0;
}

export function scoreGoogleCandidate(place: ExploreWiseGooglePlace, candidate: GooglePlaceCandidate, position: number): GoogleCandidateScore {
  const distanceMeters = candidate.latitude === null || candidate.longitude === null
    ? null
    : geodesicDistanceMeters(place, { latitude: candidate.latitude, longitude: candidate.longitude });
  const nameSimilarity = googlePlaceNameSimilarity(place.name, candidate.displayName);
  const coordinate = coordinateSupport(distanceMeters, isLargeProperty(place.categoryCode, candidate.primaryType));
  const locality = localitySupport(place, candidate);
  const category = categorySupport(place.categoryCode, candidate.primaryType);
  const confidence = roundScore(
    (nameSimilarity * GOOGLE_MATCH_WEIGHTS.name)
    + (coordinate * GOOGLE_MATCH_WEIGHTS.coordinate)
    + (locality * GOOGLE_MATCH_WEIGHTS.locality)
    + (category * GOOGLE_MATCH_WEIGHTS.category),
  );
  return {
    position,
    googlePlaceId: candidate.id,
    candidateName: candidate.displayName,
    candidateAddress: candidate.formattedAddress,
    distanceMeters,
    nameSimilarity,
    coordinateSupport: coordinate,
    localitySupport: locality,
    categorySupport: category,
    confidence,
  };
}

function result(place: ExploreWiseGooglePlace, scores: readonly GoogleCandidateScore[]): GooglePlaceMatchResult {
  const best = scores[0];
  if (!best) return {
    ewPlaceId: place.id, bestGooglePlaceId: null, status: "unmatched", confidence: null, candidateCount: 0,
    nameSimilarity: null, coordinateDistanceMeters: null, localitySupport: null, categorySupport: null,
    ambiguityReason: null, reason: "Google Text Search returned no candidates.", algorithmVersion: GOOGLE_MATCH_ALGORITHM_VERSION,
    apiCallCount: 1, candidates: [],
  };

  const second = scores[1];
  const chainBrand = knownChainBrand(place.name);
  const sameBrand = chainBrand && second
    ? knownChainBrand(best.candidateName) === chainBrand && knownChainBrand(second.candidateName) === chainBrand
    : false;
  const delta = second ? best.confidence - second.confidence : Number.POSITIVE_INFINITY;
  if (second && best.confidence >= GOOGLE_MATCH_THRESHOLDS.needsReview && second.confidence >= GOOGLE_MATCH_THRESHOLDS.needsReview
    && (delta <= GOOGLE_MATCH_THRESHOLDS.ambiguityDelta || (sameBrand && delta <= GOOGLE_MATCH_THRESHOLDS.chainAmbiguityDelta))) {
    const reason = sameBrand
      ? `Two plausible ${chainBrand} branches are separated by only ${roundScore(delta)} confidence.`
      : `The top two candidates are separated by only ${roundScore(delta)} confidence.`;
    return baseResult(place, best, scores, "ambiguous", reason, reason);
  }

  if (chainBrand) {
    if (best.distanceMeters === null || best.distanceMeters > 300 || best.coordinateSupport < 0.62) {
      const status = best.confidence >= GOOGLE_MATCH_THRESHOLDS.needsReview ? "needs_review" : "unmatched";
      return baseResult(place, best, scores, status, `Chain match requires stronger coordinate support for the ${chainBrand} branch.`, null);
    }
    const expectedBranch = branchTokens(place.name);
    if (expectedBranch.length > 0 && tokenOverlap(expectedBranch, branchTokens(best.candidateName)) < 0.5) {
      return baseResult(place, best, scores, "needs_review", "Brand matches, but branch/location tokens do not agree strongly enough.", null);
    }
  }

  if (best.confidence >= GOOGLE_MATCH_THRESHOLDS.matched) return baseResult(place, best, scores, "matched", "One candidate clears the match threshold with compatible evidence.", null);
  if (best.confidence >= GOOGLE_MATCH_THRESHOLDS.needsReview) return baseResult(place, best, scores, "needs_review", "Best candidate is plausible but below the automatic-match threshold.", null);
  return baseResult(place, best, scores, "unmatched", "No candidate reaches the review threshold.", null);
}

function baseResult(
  place: ExploreWiseGooglePlace,
  best: GoogleCandidateScore,
  scores: readonly GoogleCandidateScore[],
  status: "matched" | "ambiguous" | "unmatched" | "needs_review",
  reason: string,
  ambiguityReason: string | null,
): GooglePlaceMatchResult {
  return {
    ewPlaceId: place.id,
    bestGooglePlaceId: best.googlePlaceId,
    status,
    confidence: best.confidence,
    candidateCount: scores.length,
    nameSimilarity: best.nameSimilarity,
    coordinateDistanceMeters: best.distanceMeters,
    localitySupport: best.localitySupport,
    categorySupport: best.categorySupport,
    ambiguityReason,
    reason,
    algorithmVersion: GOOGLE_MATCH_ALGORITHM_VERSION,
    apiCallCount: 1,
    candidates: scores,
  };
}

export function scoreGooglePlaceMatch(place: ExploreWiseGooglePlace, candidates: readonly GooglePlaceCandidate[]): GooglePlaceMatchResult {
  const scores = candidates
    .map((candidate, index) => scoreGoogleCandidate(place, candidate, index + 1))
    .sort((left, right) => right.confidence - left.confidence || (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY) || left.position - right.position);
  return result(place, scores);
}
