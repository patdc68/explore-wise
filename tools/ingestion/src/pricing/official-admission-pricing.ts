import type { PricingBasis, PricingUnit } from "../../../../packages/database/src/pricing.js";

export const NON_FOOD_OUTCOMES = [
  "IMPORTABLE_CANDIDATE", "REVIEW_REQUIRED", "VERIFIED_FREE_CANDIDATE",
  "PRODUCT_VARIANT_NOT_REPRESENTABLE", "SESSION_SPECIFIC", "UNKNOWN",
] as const;
export type NonFoodOutcome = (typeof NON_FOOD_OUTCOMES)[number];

export type NonFoodSemantic = "ADMISSION" | "PER_PERSON_ACTIVITY" | "PER_GROUP_RESOURCE" | "SESSION_SPECIFIC" | "VERIFIED_FREE_CANDIDATE" | "UNKNOWN";
export type OfficialPriceManifest = Readonly<{
  placeId: string;
  sourceUrl: string;
  sourceTitle: string;
  operator: string;
  productName: string;
  minAmountMinor: number;
  maxAmountMinor: number;
  currencyCode: string;
  pricingUnit: PricingUnit;
  audience: "general" | "discounted" | "all_visitors";
  pricingBasis: PricingBasis;
  applicabilityScope: "PLACE_LEVEL_PRICE" | "NAMED_TICKET_OR_PASS" | "PROMOTIONAL_BUNDLE" | "MULTI_VENUE_PRODUCT" | "SESSION_SPECIFIC";
  validFrom?: string;
  validUntil?: string;
  capturedAt: string;
  evidenceNotes: string;
}>;

export type NonFoodPlace = Readonly<{ id: string; name: string; categoryCode: string }>;

/** Conservative classification: a category supplies context, never a price or free claim. */
export function classifyNonFoodSemantic(place: NonFoodPlace): NonFoodSemantic {
  if (place.categoryCode === "entertainment.cinema") return "SESSION_SPECIFIC";
  if (place.categoryCode === "attraction" || place.categoryCode === "attraction.museum") return "ADMISSION";
  const name = place.name.toLowerCase();
  if (place.categoryCode === "activity.recreation" && /\b(bowling|lane|court|room rental)\b/u.test(name)) return "PER_GROUP_RESOURCE";
  if (place.categoryCode === "activity.recreation" && /\b(escape|skate|climb|kart|archery|trampoline)\b/u.test(name)) return "PER_PERSON_ACTIVITY";
  if (place.categoryCode === "attraction.culture" && /\b(museum)\b/u.test(name)) return "ADMISSION";
  return "UNKNOWN";
}

export function outcomeForSemantic(semantic: NonFoodSemantic): NonFoodOutcome {
  return semantic === "SESSION_SPECIFIC" ? "SESSION_SPECIFIC" : "UNKNOWN";
}

export function validateOfficialManifest(manifest: OfficialPriceManifest, now: Date): readonly string[] {
  const issues: string[] = [];
  if (!manifest.placeId || !/^https:\/\//u.test(manifest.sourceUrl)) issues.push("official HTTPS source and place candidate are required");
  if (!/^[A-Z]{3}$/u.test(manifest.currencyCode)) issues.push("currency must be ISO 4217");
  if (!Number.isSafeInteger(manifest.minAmountMinor) || !Number.isSafeInteger(manifest.maxAmountMinor) || manifest.minAmountMinor < 0 || manifest.minAmountMinor > manifest.maxAmountMinor) issues.push("amount range is invalid");
  const captured = Date.parse(manifest.capturedAt);
  if (Number.isNaN(captured) || captured > now.getTime()) issues.push("capture timestamp is invalid");
  if (manifest.pricingUnit === "free" && (manifest.minAmountMinor !== 0 || manifest.maxAmountMinor !== 0)) issues.push("verified free must be zero");
  if (manifest.pricingUnit !== "free" && manifest.minAmountMinor === 0) issues.push("paid pricing requires a positive amount");
  if (manifest.applicabilityScope !== "PLACE_LEVEL_PRICE" && manifest.pricingBasis === "branch_verified") issues.push("non-place product evidence cannot become a generic branch price");
  if (manifest.validUntil && Date.parse(manifest.validUntil) < now.getTime()) issues.push("evidence is expired");
  if (now.getTime() - captured > 90 * 24 * 60 * 60 * 1000) issues.push("evidence is stale");
  return issues;
}

export function outcomeForManifest(manifest: OfficialPriceManifest, now: Date): NonFoodOutcome {
  if (manifest.applicabilityScope === "SESSION_SPECIFIC") return "SESSION_SPECIFIC";
  if (manifest.applicabilityScope !== "PLACE_LEVEL_PRICE") return "PRODUCT_VARIANT_NOT_REPRESENTABLE";
  if (validateOfficialManifest(manifest, now).length > 0) return "REVIEW_REQUIRED";
  return manifest.pricingUnit === "free" ? "VERIFIED_FREE_CANDIDATE" : "IMPORTABLE_CANDIDATE";
}

/** A student/PWD/senior rate is retained as evidence, never substituted for normal admission. */
export function selectGeneralAdmission(manifests: readonly OfficialPriceManifest[]): OfficialPriceManifest | null {
  return manifests.find((manifest) => manifest.applicabilityScope === "PLACE_LEVEL_PRICE" && manifest.pricingUnit === "admission" && manifest.audience === "general") ?? null;
}
