import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBudget,
  groupPriceRange,
  isPriceFresh,
  isPriceStructurallyValid,
  PRICING_SOURCE_TRUST,
  resolvePriceEvidence,
  pricingDisclosure,
  deriveNormalSoloSpendRange,
  type PriceEvidence,
} from "../../../packages/database/src/pricing.js";

const NOW = new Date("2026-09-03T00:00:00.000Z");
const RECENT = "2026-08-15T00:00:00.000Z";

function price(overrides: Partial<PriceEvidence> = {}): PriceEvidence {
  return {
    id: "price-1", currencyCode: "PHP", minAmountMinor: 30_000, maxAmountMinor: 45_000,
    pricingStatus: "paid", pricingUnit: "per_person", pricingSource: "official_menu",
    pricePrecision: "exact", pricingBasis: "branch_verified", pricingChannel: "dine_in", confidenceLevel: "VERIFIED", lastVerifiedAt: RECENT, ...overrides,
  };
}

function resolved(evidence: PriceEvidence) { return { evidence, inheritedFromBrand: false } as const; }

test("per-person PHP pricing multiplies by party size and fits ₱1,500 for two", () => {
  const evidence = price();
  assert.deepEqual(groupPriceRange(evidence, 2), { minAmountMinor: 60_000, maxAmountMinor: 90_000 });
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(evidence), now: NOW }).status, "fits");
});

test("per-group and fixed prices are not multiplied by party size", () => {
  assert.deepEqual(groupPriceRange(price({ pricingUnit: "per_group" }), 4), { minAmountMinor: 30_000, maxAmountMinor: 45_000 });
  assert.deepEqual(groupPriceRange(price({ pricingUnit: "fixed" }), 4), { minAmountMinor: 30_000, maxAmountMinor: 45_000 });
  assert.deepEqual(groupPriceRange(price({ pricingUnit: "admission" }), 4), { minAmountMinor: 120_000, maxAmountMinor: 180_000 });
  assert.throws(() => groupPriceRange(price(), 0), RangeError);
});

test("verified free pricing is exactly zero and fits a non-negative budget", () => {
  const free = price({ pricingStatus: "free", pricingUnit: "free", minAmountMinor: 0, maxAmountMinor: 0 });
  assert.equal(isPriceStructurallyValid(free), true);
  assert.equal(evaluateBudget({ budgetAmountMinor: 0, partySize: 5, resolvedPrice: resolved(free), now: NOW }).status, "fits");
});

test("exact, range, fits, may-exceed, and exceeds are deterministic", () => {
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(price({ minAmountMinor: 60_000, maxAmountMinor: 85_000 })), now: NOW }).status, "may_exceed");
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(price({ minAmountMinor: 90_000, maxAmountMinor: 100_000 })), now: NOW }).status, "exceeds");
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: null, now: NOW }).status, "unknown");
});

test("stale and low-confidence estimated evidence cannot claim a fit", () => {
  assert.equal(PRICING_SOURCE_TRUST.official_menu, "authoritative");
  assert.equal(PRICING_SOURCE_TRUST.explorewise_estimate, "estimate");
  assert.equal(isPriceFresh(price({ lastVerifiedAt: "2026-05-01T00:00:00.000Z" }), NOW), false);
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(price({ lastVerifiedAt: "2026-05-01T00:00:00.000Z" })), now: NOW }).reason, "stale_or_invalid");
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(price({ confidenceLevel: "LOW", pricePrecision: "estimated", pricingSource: "explorewise_estimate" })), now: NOW }).reason, "stale_or_invalid");
});

test("negative, inverted, and non-PHP-safe currency evidence is rejected structurally", () => {
  assert.equal(isPriceStructurallyValid(price({ minAmountMinor: -1 })), false);
  assert.equal(isPriceStructurallyValid(price({ minAmountMinor: 45_001, maxAmountMinor: 45_000 })), false);
  assert.equal(isPriceStructurallyValid(price({ currencyCode: "PHP" })), true);
  assert.equal(isPriceStructurallyValid(price({ currencyCode: "php" })), false);
});

test("exact branch price overrides a brand reference", () => {
  const chain = price({ id: "chain", minAmountMinor: 60_000, maxAmountMinor: 60_000 });
  const branch = price({ id: "branch", minAmountMinor: 30_000, maxAmountMinor: 30_000 });
  const reference = price({ id: "brand", pricingSource: "official_menu", pricingBasis: "brand_reference", pricingChannel: "official_delivery", pricePrecision: "derived", confidenceLevel: "HIGH", derivationVersion: "normal-order.v1" });
  const membership = { brandId: "brand-1", identityStatus: "CONFIRMED_CHAIN" as const, pricingProfileApplicable: true };
  assert.equal(resolvePriceEvidence({ placePrices: [branch], brandPrices: [reference], brandMembership: membership, now: NOW })?.evidence.id, "branch");
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [reference], brandMembership: { ...membership, pricingProfileApplicable: false }, now: NOW }), null);
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [reference], brandMembership: membership, now: NOW })?.inheritedFromBrand, true);
});

test("fresh competing evidence resolves by source trust, then confidence, precision, and recency", () => {
  const provider = price({ id: "provider", pricingSource: "licensed_provider", confidenceLevel: "VERIFIED" });
  const official = price({ id: "official", pricingSource: "official_menu", confidenceLevel: "VERIFIED" });
  assert.equal(resolvePriceEvidence({ placePrices: [provider, official], brandPrices: [], brandMembership: null, now: NOW })?.evidence.id, "official");
});

test("brand reference is qualified, party-size aware, channel-specific, and retains disclosure", () => {
  const reference = price({
    pricingSource: "official_menu", pricingBasis: "brand_reference", pricingChannel: "official_delivery", pricePrecision: "derived", confidenceLevel: "HIGH",
    derivationVersion: "normal-solo-order-class.v1", referenceDisclaimer: "Based on official brand pricing. Prices may vary by branch or ordering channel.", minAmountMinor: 18_000, maxAmountMinor: 30_000,
  });
  const brandMembership = { brandId: "jollibee", identityStatus: "CONFIRMED_CHAIN" as const, pricingProfileApplicable: true };
  const resolvedReference = resolvePriceEvidence({ placePrices: [], brandPrices: [reference], brandMembership, now: NOW });
  const result = evaluateBudget({ budgetAmountMinor: 100_000, partySize: 2, resolvedPrice: resolvedReference, now: NOW });
  assert.equal(result.status, "likely_fits");
  assert.deepEqual(groupPriceRange(reference, 2), { minAmountMinor: 36_000, maxAmountMinor: 60_000 });
  assert.equal(result.evidence?.evidence.pricingChannel, "official_delivery");
  assert.equal(pricingDisclosure(reference), "Based on official brand pricing. Prices may vary by branch or ordering channel.");
});

test("brand count is irrelevant; unresolved, stale, or malformed references never resolve", () => {
  const reference = price({ pricingSource: "official_menu", pricingBasis: "brand_reference", pricingChannel: "official_delivery", pricePrecision: "derived", confidenceLevel: "HIGH", derivationVersion: "normal-solo-order-class.v1" });
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [reference], brandMembership: { brandId: "two-location-brand", identityStatus: "CONFIRMED_CHAIN", pricingProfileApplicable: true }, now: NOW })?.evidence.id, reference.id);
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [reference], brandMembership: { brandId: "fifty-location-brand", identityStatus: "CONFIRMED_CHAIN", pricingProfileApplicable: true }, now: NOW })?.evidence.id, reference.id);
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [reference], brandMembership: { brandId: "x", identityStatus: "UNRESOLVED", pricingProfileApplicable: true }, now: NOW }), null);
  assert.equal(evaluateBudget({ budgetAmountMinor: 100_000, partySize: 1, resolvedPrice: { evidence: { ...reference, validUntil: "2026-08-01T00:00:00.000Z" }, inheritedFromBrand: true }, now: NOW }).status, "unknown");
  assert.equal(isPriceStructurallyValid({ ...reference, confidenceLevel: "VERIFIED" }), false);
});

test("independent place reference needs no membership and is never presented as an exact bill", () => {
  const localMenu = price({ pricingBasis: "place_reference", pricingSource: "official_menu", pricingChannel: "dine_in", pricePrecision: "derived", confidenceLevel: "HIGH", derivationVersion: "normal-solo-order-class.v1", minAmountMinor: 35_000, maxAmountMinor: 70_000 });
  const resolution = resolvePriceEvidence({ placePrices: [localMenu], brandPrices: [], brandMembership: null, now: NOW });
  assert.equal(evaluateBudget({ budgetAmountMinor: 80_000, partySize: 1, resolvedPrice: resolution, now: NOW }).status, "likely_fits");
  assert.equal(pricingDisclosure(localMenu), "Based on this restaurant's official menu. Your actual spend depends on what you order.");
  assert.equal(localMenu.pricePrecision, "derived");
  assert.notEqual(localMenu.confidenceLevel, "VERIFIED");
});

test("local-menu derivation accepts declared solo cores and routes uncertain menus to review", () => {
  assert.deepEqual(deriveNormalSoloSpendRange([
    { id: "main-1", amountMinor: 40_000, classification: "solo_core" }, { id: "main-2", amountMinor: 55_000, classification: "solo_core" },
    { id: "main-3", amountMinor: 70_000, classification: "solo_core" }, { id: "steak", amountMinor: 200_000, classification: "shared" },
    { id: "dessert", amountMinor: 15_000, classification: "dessert" }, { id: "rice", amountMinor: 5_000, classification: "add_on" },
  ]), { outcome: "derived", minAmountMinor: 40_000, maxAmountMinor: 70_000, qualifyingItemIds: ["main-1", "main-2", "main-3"] });
  assert.deepEqual(deriveNormalSoloSpendRange([{ id: "share", amountMinor: 90_000, classification: "shared" }]), { outcome: "review", reason: "insufficient_solo_core_items" });
});
