import assert from "node:assert/strict";
import test from "node:test";
import { classifyNonFoodSemantic, outcomeForManifest, outcomeForSemantic, selectGeneralAdmission, validateOfficialManifest, type OfficialPriceManifest } from "../src/pricing/official-admission-pricing.js";
import { groupPriceRange } from "../../../packages/database/src/pricing.js";

const NOW = new Date("2026-09-03T00:00:00.000Z");
function manifest(overrides: Partial<OfficialPriceManifest> = {}): OfficialPriceManifest {
  return { placeId: "place", sourceUrl: "https://operator.example/rates", sourceTitle: "Rates", operator: "Operator", productName: "General admission", minAmountMinor: 10_000, maxAmountMinor: 10_000, currencyCode: "PHP", pricingUnit: "admission", audience: "general", pricingBasis: "branch_verified", applicabilityScope: "PLACE_LEVEL_PRICE", capturedAt: "2026-08-20T00:00:00.000Z", evidenceNotes: "Official current rate.", ...overrides };
}

test("official admission contract keeps general, discounted, free, and unknown semantics honest", () => {
  assert.equal(outcomeForManifest(manifest(), NOW), "IMPORTABLE_CANDIDATE");
  assert.equal(outcomeForManifest(manifest({ pricingUnit: "free", minAmountMinor: 0, maxAmountMinor: 0, audience: "all_visitors" }), NOW), "VERIFIED_FREE_CANDIDATE");
  assert.match(validateOfficialManifest(manifest({ pricingUnit: "free", minAmountMinor: 1, maxAmountMinor: 1 }), NOW).join(" "), /zero/u);
  assert.equal(outcomeForSemantic(classifyNonFoodSemantic({ id: "x", name: "Unnamed public park", categoryCode: "outdoor.park" })), "UNKNOWN");
  const discounted = manifest({ productName: "Student admission", audience: "discounted", minAmountMinor: 5_000, maxAmountMinor: 5_000 });
  const general = manifest({ productName: "Regular admission" });
  assert.equal(selectGeneralAdmission([discounted, general])?.productName, "Regular admission");
});

test("recreation, resource, product, freshness, cinema, and party-size rules stay explicit", () => {
  assert.equal(classifyNonFoodSemantic({ id: "x", name: "Mystery escape room", categoryCode: "activity.recreation" }), "PER_PERSON_ACTIVITY");
  assert.equal(classifyNonFoodSemantic({ id: "x", name: "Paeng's Bowling Lane", categoryCode: "activity.recreation" }), "PER_GROUP_RESOURCE");
  assert.equal(outcomeForManifest(manifest({ applicabilityScope: "MULTI_VENUE_PRODUCT" }), NOW), "PRODUCT_VARIANT_NOT_REPRESENTABLE");
  assert.match(validateOfficialManifest(manifest({ validUntil: "2026-08-31T23:59:59.999Z" }), NOW).join(" "), /expired/u);
  assert.match(validateOfficialManifest(manifest({ capturedAt: "2026-05-01T00:00:00.000Z" }), NOW).join(" "), /stale/u);
  assert.equal(outcomeForSemantic(classifyNonFoodSemantic({ id: "x", name: "Cinema 1", categoryCode: "entertainment.cinema" })), "SESSION_SPECIFIC");
  assert.deepEqual(groupPriceRange({ id: "lane", currencyCode: "PHP", minAmountMinor: 120_000, maxAmountMinor: 120_000, pricingStatus: "paid", pricingUnit: "fixed", pricingSource: "official_website", pricePrecision: "exact", pricingBasis: "branch_verified", pricingChannel: "unspecified_official", confidenceLevel: "VERIFIED", lastVerifiedAt: "2026-08-20T00:00:00.000Z" }, 5), { minAmountMinor: 120_000, maxAmountMinor: 120_000 });
});
