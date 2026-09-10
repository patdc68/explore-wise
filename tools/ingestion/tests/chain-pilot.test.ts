import assert from "node:assert/strict";
import test from "node:test";
import { classifyChainIdentity, PILOT_BRAND_IDENTITY_RULES } from "../src/pricing/chain-pilot.js";
import { evaluateBudget, resolvePriceEvidence, type PriceEvidence } from "../../../packages/database/src/pricing.js";

const kfc = PILOT_BRAND_IDENTITY_RULES.find((rule) => rule.canonicalName === "KFC")!;
const NOW = new Date("2026-09-03T00:00:00.000Z");
const price = (overrides: Partial<PriceEvidence> = {}): PriceEvidence => ({
  id: "price", currencyCode: "PHP", minAmountMinor: 12_000, maxAmountMinor: 20_000, pricingStatus: "paid", pricingUnit: "per_person",
  pricingSource: "official_menu", pricingBasis: "brand_reference", pricingChannel: "official_delivery", pricePrecision: "derived", confidenceLevel: "HIGH", derivationVersion: "normal-order.v1", lastVerifiedAt: "2026-08-20T00:00:00.000Z", ...overrides,
});

test("same name without source identity evidence is not confirmed", () => {
  assert.equal(classifyChainIdentity({ rule: kfc, sourceWebsiteUrl: null }).status, "UNRESOLVED");
});

test("stable official branch domain confirms; a conflicting domain rejects", () => {
  assert.equal(classifyChainIdentity({ rule: kfc, sourceWebsiteUrl: "https://stores.kfc.com.ph/kfc-example/Home" }).status, "CONFIRMED_CHAIN");
  assert.equal(classifyChainIdentity({ rule: kfc, sourceWebsiteUrl: "https://redirect.foursquare.com/l/?u=https%3A%2F%2Fstores.kfc.com.ph%2Fkfc-example%2FHome" }).status, "CONFIRMED_CHAIN");
  assert.equal(classifyChainIdentity({ rule: kfc, sourceWebsiteUrl: "https://example.test/kfc" }).status, "REJECTED");
});

test("membership and applicability are independent; unresolved or inapplicable branches inherit nothing", () => {
  const chain = price();
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [chain], brandMembership: null, now: NOW }), null);
  assert.equal(resolvePriceEvidence({ placePrices: [], brandPrices: [chain], brandMembership: { brandId: "kfc", identityStatus: "CONFIRMED_CHAIN", pricingProfileApplicable: false }, now: NOW }), null);
});

test("expired profiles and delivery-only evidence cannot silently yield FITS", () => {
  const expired = price({ validUntil: "2026-08-31T23:59:59.999Z" });
  const deliveryOnly = price({ id: "delivery-only", pricingSource: "explorewise_estimate", pricePrecision: "estimated", confidenceLevel: "LOW" });
  const expiredResolved = { evidence: expired, inheritedFromBrand: true } as const;
  const deliveryResolved = { evidence: deliveryOnly, inheritedFromBrand: false } as const;
  assert.equal(evaluateBudget({ budgetAmountMinor: 100_000, partySize: 1, resolvedPrice: expiredResolved, now: NOW }).status, "unknown");
  assert.equal(evaluateBudget({ budgetAmountMinor: 100_000, partySize: 1, resolvedPrice: deliveryResolved, now: NOW }).status, "unknown");
});
