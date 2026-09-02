import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBudget,
  groupPriceRange,
  isPriceFresh,
  isPriceStructurallyValid,
  PRICING_SOURCE_TRUST,
  resolvePriceEvidence,
  type PriceEvidence,
} from "../../../packages/database/src/pricing.js";

const NOW = new Date("2026-09-03T00:00:00.000Z");
const RECENT = "2026-08-15T00:00:00.000Z";

function price(overrides: Partial<PriceEvidence> = {}): PriceEvidence {
  return {
    id: "price-1", currencyCode: "PHP", minAmountMinor: 30_000, maxAmountMinor: 45_000,
    pricingStatus: "paid", pricingUnit: "per_person", pricingSource: "official_menu",
    pricePrecision: "exact", confidenceLevel: "VERIFIED", lastVerifiedAt: RECENT, ...overrides,
  };
}

function resolved(evidence: PriceEvidence) { return { evidence, inheritedFromChain: false } as const; }

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
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(price({ confidenceLevel: "LOW", pricePrecision: "estimated", pricingSource: "explorewise_estimate" })), now: NOW }).reason, "insufficient_confidence");
});

test("negative, inverted, and non-PHP-safe currency evidence is rejected structurally", () => {
  assert.equal(isPriceStructurallyValid(price({ minAmountMinor: -1 })), false);
  assert.equal(isPriceStructurallyValid(price({ minAmountMinor: 45_001, maxAmountMinor: 45_000 })), false);
  assert.equal(isPriceStructurallyValid(price({ currencyCode: "PHP" })), true);
  assert.equal(isPriceStructurallyValid(price({ currencyCode: "php" })), false);
});

test("branch price wins; chain profile needs an explicit applicable membership", () => {
  const chain = price({ id: "chain", minAmountMinor: 60_000, maxAmountMinor: 60_000 });
  const branch = price({ id: "branch", minAmountMinor: 30_000, maxAmountMinor: 30_000 });
  assert.equal(resolvePriceEvidence({ branchPrices: [branch], chainPrices: [chain], chainMembership: { chainId: "chain-1", pricingProfileApplicable: true }, now: NOW })?.evidence.id, "branch");
  assert.equal(resolvePriceEvidence({ branchPrices: [], chainPrices: [chain], chainMembership: { chainId: "chain-1", pricingProfileApplicable: false }, now: NOW }), null);
  assert.equal(resolvePriceEvidence({ branchPrices: [], chainPrices: [chain], chainMembership: { chainId: "chain-1", pricingProfileApplicable: true }, now: NOW })?.inheritedFromChain, true);
});

test("fresh competing evidence resolves by source trust, then confidence, precision, and recency", () => {
  const provider = price({ id: "provider", pricingSource: "licensed_provider", confidenceLevel: "VERIFIED" });
  const official = price({ id: "official", pricingSource: "official_menu", confidenceLevel: "HIGH" });
  assert.equal(resolvePriceEvidence({ branchPrices: [provider, official], chainPrices: [], chainMembership: null, now: NOW })?.evidence.id, "official");
});
