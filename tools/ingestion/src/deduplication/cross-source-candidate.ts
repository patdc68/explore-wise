import { normalizeName, normalizeOptionalText } from "../normalization/text.js";
import type { PlaceSnapshot } from "../types/index.js";

export interface CrossSourceCandidateResult {
  classification: "not_candidate" | "review";
  distanceMeters: number;
  signals: {
    sameNormalizedName: boolean;
    sameNormalizedAddress: boolean;
    sameCategory: boolean;
  };
  action: "none" | "manual_review";
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function distanceMeters(
  left: Pick<PlaceSnapshot, "latitude" | "longitude">,
  right: Pick<PlaceSnapshot, "latitude" | "longitude">,
): number {
  const earthRadiusMeters = 6_371_008.8;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

export function classifyCrossSourceCandidate(
  left: PlaceSnapshot,
  right: PlaceSnapshot,
): CrossSourceCandidateResult {
  const distance = distanceMeters(left, right);
  const leftAddress = normalizeOptionalText(left.address);
  const rightAddress = normalizeOptionalText(right.address);
  const signals = {
    sameNormalizedName: normalizeName(left.name) === normalizeName(right.name),
    sameNormalizedAddress: leftAddress !== null
      && rightAddress !== null
      && normalizeName(leftAddress) === normalizeName(rightAddress),
    sameCategory: left.categoryCode === right.categoryCode,
  };
  const isCrossSource = left.sourceCode !== right.sourceCode;
  const isCandidate = isCrossSource && (
    (signals.sameNormalizedName && distance <= 75)
    || (signals.sameNormalizedAddress && signals.sameCategory && distance <= 150)
  );

  return {
    classification: isCandidate ? "review" : "not_candidate",
    distanceMeters: distance,
    signals,
    action: isCandidate ? "manual_review" : "none",
  };
}

