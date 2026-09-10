export const PRICING_UNITS = ["per_person", "per_group", "admission", "fixed", "free"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

export const PRICING_SOURCES = [
  "official_menu",
  "official_website",
  "merchant",
  "licensed_provider",
  "explorewise_estimate",
] as const;
export type PricingSource = (typeof PRICING_SOURCES)[number];

export const PRICE_PRECISIONS = ["exact", "derived", "estimated"] as const;
export type PricePrecision = (typeof PRICE_PRECISIONS)[number];

/** Scope of applicability, intentionally independent from source provenance. */
export const PRICING_BASES = ["branch_verified", "brand_reference", "place_reference"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

/** The ordering context reported by the merchant; never inferred as dine-in. */
export const PRICING_CHANNELS = ["dine_in", "pickup", "official_delivery", "unspecified_official", "unknown"] as const;
export type PricingChannel = (typeof PRICING_CHANNELS)[number];

export const CONFIDENCE_LEVELS = ["VERIFIED", "HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const PRICING_SOURCE_TRUST = {
  official_menu: "authoritative",
  official_website: "authoritative",
  merchant: "authoritative",
  licensed_provider: "trusted",
  explorewise_estimate: "estimate",
} as const;
export type PricingSourceTrust = (typeof PRICING_SOURCE_TRUST)[PricingSource];

export type PriceEvidence = Readonly<{
  id: string;
  currencyCode: string;
  minAmountMinor: number;
  maxAmountMinor: number;
  pricingStatus: "free" | "paid";
  pricingUnit: PricingUnit;
  pricingSource: PricingSource;
  pricePrecision: PricePrecision;
  pricingBasis: PricingBasis;
  pricingChannel: PricingChannel;
  confidenceLevel: ConfidenceLevel;
  derivationVersion?: string | null;
  referenceDisclaimer?: string | null;
  lastVerifiedAt: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}>;

/** A membership is required only to inherit a brand-level reference. */
export type BrandMembership = Readonly<{
  brandId: string;
  identityStatus: "CONFIRMED_CHAIN" | "UNRESOLVED" | "REJECTED";
  pricingProfileApplicable: boolean;
}>;

export type ResolvedPrice = Readonly<{
  evidence: PriceEvidence;
  inheritedFromBrand: boolean;
}>;

export const MENU_ITEM_CLASSES = ["solo_core", "solo_optional", "shared", "add_on", "beverage", "dessert", "group_package", "promotional", "unknown"] as const;
export type MenuItemClass = (typeof MENU_ITEM_CLASSES)[number];
export type MenuItemForDerivation = Readonly<{ id: string; amountMinor: number; classification: MenuItemClass }>;
export type SpendDerivation = Readonly<{ outcome: "derived"; minAmountMinor: number; maxAmountMinor: number; qualifyingItemIds: readonly string[] } | { outcome: "review"; reason: "insufficient_solo_core_items" | "invalid_menu_item" }>;

export type BudgetStatus = "fits" | "may_exceed" | "exceeds" | "likely_fits" | "likely_exceeds" | "unknown";

export type BudgetEvaluation = Readonly<{
  status: BudgetStatus;
  groupMinAmountMinor: number | null;
  groupMaxAmountMinor: number | null;
  evidence: ResolvedPrice | null;
  reason: "no_pricing" | "stale_or_invalid" | "insufficient_confidence" | "fits" | "may_exceed" | "exceeds" | "likely_fits" | "likely_exceeds";
}>;

/** Prices require fresh verification at least every 90 days unless an earlier valid_until is supplied. */
export const PRICE_FRESHNESS_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_TRUST_RANK: Record<PricingSourceTrust, number> = { authoritative: 3, trusted: 2, estimate: 1 };
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { VERIFIED: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const PRECISION_RANK: Record<PricePrecision, number> = { exact: 3, derived: 2, estimated: 1 };

function asTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isPriceFresh(evidence: PriceEvidence, now: Date): boolean {
  const nowMs = now.getTime();
  const verifiedAt = asTimestamp(evidence.lastVerifiedAt);
  const validFrom = asTimestamp(evidence.validFrom);
  const validUntil = asTimestamp(evidence.validUntil);
  if (verifiedAt === null || (validFrom !== null && validFrom > nowMs)) return false;
  if (validUntil !== null && validUntil < nowMs) return false;
  return nowMs - verifiedAt <= PRICE_FRESHNESS_DAYS * DAY_MS;
}

export function isPriceStructurallyValid(evidence: PriceEvidence): boolean {
  if (!/^[A-Z]{3}$/u.test(evidence.currencyCode)) return false;
  if (!Number.isSafeInteger(evidence.minAmountMinor) || !Number.isSafeInteger(evidence.maxAmountMinor)) return false;
  if (evidence.minAmountMinor < 0 || evidence.minAmountMinor > evidence.maxAmountMinor) return false;
  if (evidence.pricingStatus === "free") {
    return evidence.pricingUnit === "free" && evidence.minAmountMinor === 0 && evidence.maxAmountMinor === 0
      && (evidence.pricingBasis === "branch_verified" || (evidence.pricingSource === "official_menu" && evidence.pricePrecision === "derived"));
  }
  if (evidence.pricingUnit === "free" || evidence.minAmountMinor <= 0) return false;
  if (evidence.pricingBasis === "branch_verified") {
    return evidence.pricePrecision === "exact"
      && evidence.confidenceLevel === "VERIFIED"
      && ["official_menu", "official_website", "merchant", "licensed_provider"].includes(evidence.pricingSource);
  }
  return evidence.pricePrecision === "derived"
    && evidence.confidenceLevel !== "VERIFIED"
    && ["official_menu", "official_website", "merchant"].includes(evidence.pricingSource)
    && Boolean(evidence.derivationVersion?.trim());
}

/**
 * Conservative rule: estimates and LOW evidence can inform later presentation,
 * but can never support a claim that a place fits the user's budget.
 */
export function canSupportBudgetConclusion(evidence: PriceEvidence): boolean {
  return PRICING_SOURCE_TRUST[evidence.pricingSource] !== "estimate"
    && evidence.confidenceLevel !== "LOW"
    && evidence.pricePrecision !== "estimated"
    && (evidence.pricingBasis === "branch_verified" || evidence.confidenceLevel === "HIGH");
}

function preferredEvidence(prices: readonly PriceEvidence[], now: Date): PriceEvidence | null {
  return [...prices]
    .filter((price) => isPriceStructurallyValid(price) && isPriceFresh(price, now))
    .sort((left, right) => {
      const sourceDifference = SOURCE_TRUST_RANK[PRICING_SOURCE_TRUST[right.pricingSource]] - SOURCE_TRUST_RANK[PRICING_SOURCE_TRUST[left.pricingSource]];
      if (sourceDifference !== 0) return sourceDifference;
      const confidenceDifference = CONFIDENCE_RANK[right.confidenceLevel] - CONFIDENCE_RANK[left.confidenceLevel];
      if (confidenceDifference !== 0) return confidenceDifference;
      const precisionDifference = PRECISION_RANK[right.pricePrecision] - PRECISION_RANK[left.pricePrecision];
      if (precisionDifference !== 0) return precisionDifference;
      const verifiedDifference = (asTimestamp(right.lastVerifiedAt) ?? 0) - (asTimestamp(left.lastVerifiedAt) ?? 0);
      return verifiedDifference !== 0 ? verifiedDifference : left.id.localeCompare(right.id);
    })[0] ?? null;
}

/** Direct place evidence (branch verified or place reference) always wins. */
export function resolvePriceEvidence(input: Readonly<{
  placePrices: readonly PriceEvidence[];
  brandPrices: readonly PriceEvidence[];
  brandMembership: BrandMembership | null;
  now: Date;
}>): ResolvedPrice | null {
  const direct = preferredEvidence(input.placePrices, input.now);
  if (direct) return { evidence: direct, inheritedFromBrand: false };
  if (input.brandMembership?.identityStatus !== "CONFIRMED_CHAIN" || !input.brandMembership.pricingProfileApplicable) return null;
  const inherited = preferredEvidence(input.brandPrices, input.now);
  return inherited ? { evidence: inherited, inheritedFromBrand: true } : null;
}

export function groupPriceRange(evidence: PriceEvidence, partySize: number): Readonly<{ minAmountMinor: number; maxAmountMinor: number }> {
  if (!Number.isSafeInteger(partySize) || partySize < 1) throw new RangeError("partySize must be a positive integer");
  const multiplier = evidence.pricingUnit === "per_person" || evidence.pricingUnit === "admission" ? partySize : 1;
  return { minAmountMinor: evidence.minAmountMinor * multiplier, maxAmountMinor: evidence.maxAmountMinor * multiplier };
}

export function evaluateBudget(input: Readonly<{
  budgetAmountMinor: number;
  partySize: number;
  resolvedPrice: ResolvedPrice | null;
  now: Date;
}>): BudgetEvaluation {
  if (!Number.isSafeInteger(input.budgetAmountMinor) || input.budgetAmountMinor < 0) {
    throw new RangeError("budgetAmountMinor must be a non-negative integer");
  }
  const resolved = input.resolvedPrice;
  if (!resolved) return { status: "unknown", groupMinAmountMinor: null, groupMaxAmountMinor: null, evidence: null, reason: "no_pricing" };
  if (!isPriceStructurallyValid(resolved.evidence) || !isPriceFresh(resolved.evidence, input.now)) {
    return { status: "unknown", groupMinAmountMinor: null, groupMaxAmountMinor: null, evidence: resolved, reason: "stale_or_invalid" };
  }
  if (!canSupportBudgetConclusion(resolved.evidence)) {
    return { status: "unknown", groupMinAmountMinor: null, groupMaxAmountMinor: null, evidence: resolved, reason: "insufficient_confidence" };
  }
  const range = groupPriceRange(resolved.evidence, input.partySize);
  const reference = resolved.evidence.pricingBasis !== "branch_verified";
  if (range.maxAmountMinor <= input.budgetAmountMinor) {
    return { status: reference ? "likely_fits" : "fits", groupMinAmountMinor: range.minAmountMinor, groupMaxAmountMinor: range.maxAmountMinor, evidence: resolved, reason: reference ? "likely_fits" : "fits" };
  }
  if (range.minAmountMinor > input.budgetAmountMinor) {
    return { status: reference ? "likely_exceeds" : "exceeds", groupMinAmountMinor: range.minAmountMinor, groupMaxAmountMinor: range.maxAmountMinor, evidence: resolved, reason: reference ? "likely_exceeds" : "exceeds" };
  }
  return { status: "may_exceed", groupMinAmountMinor: range.minAmountMinor, groupMaxAmountMinor: range.maxAmountMinor, evidence: resolved, reason: "may_exceed" };
}

export function pricingDisclosure(evidence: PriceEvidence): string | null {
  if (evidence.pricingBasis === "branch_verified") return null;
  if (evidence.referenceDisclaimer?.trim()) return evidence.referenceDisclaimer;
  return evidence.pricingBasis === "brand_reference"
    ? "Based on the brand's official menu. Actual prices may vary by location or ordering channel."
    : "Based on this restaurant's official menu. Your actual spend depends on what you order.";
}

/**
 * Shared deterministic derivation for all merchant sizes. Item classification
 * is supplied by a source adapter/reviewer; this function never guesses it.
 * Shared dishes, add-ons, beverages, desserts, packages, and promotions are
 * deliberately excluded from a normal solo spend range.
 */
export function deriveNormalSoloSpendRange(items: readonly MenuItemForDerivation[]): SpendDerivation {
  if (items.some((item) => !item.id.trim() || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0)) return { outcome: "review", reason: "invalid_menu_item" };
  const qualifying = items.filter((item) => item.classification === "solo_core").sort((left, right) => left.amountMinor - right.amountMinor || left.id.localeCompare(right.id));
  if (qualifying.length < 3) return { outcome: "review", reason: "insufficient_solo_core_items" };
  // After class filtering, min/max describe the declared normal solo menu
  // class, rather than the cheapest and most expensive item on the whole menu.
  return { outcome: "derived", minAmountMinor: qualifying[0]!.amountMinor, maxAmountMinor: qualifying.at(-1)!.amountMinor, qualifyingItemIds: qualifying.map((item) => item.id) };
}
