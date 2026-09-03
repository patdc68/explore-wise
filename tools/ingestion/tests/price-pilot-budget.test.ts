import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBudget, type PriceEvidence } from "../../../packages/database/src/pricing.js";

const now = new Date("2026-09-03T00:00:00.000Z");
const base: Omit<PriceEvidence, "id" | "minAmountMinor" | "maxAmountMinor"> = {
  currencyCode: "PHP", pricingStatus: "paid", pricingUnit: "admission", pricingSource: "official_website",
  pricePrecision: "exact", pricingBasis: "branch_verified", pricingChannel: "dine_in", confidenceLevel: "VERIFIED", lastVerifiedAt: "2026-09-03T00:00:00.000Z",
};
const resolved = (evidence: PriceEvidence) => ({ evidence, inheritedFromBrand: false } as const);

test("Phase 1 pilot budget examples retain conservative price semantics", () => {
  const casaManila = { ...base, id: "casa", minAmountMinor: 7_500, maxAmountMinor: 7_500 };
  const oceanToJungle = { ...base, id: "ocean", minAmountMinor: 95_000, maxAmountMinor: 95_000 };
  // This is simulation-only: two separately ticketed Ocean Park passes must not
  // be imported as one generic admission range without product-scope support.
  const distinctPassEnvelope = { ...base, id: "simulation-only", minAmountMinor: 55_000, maxAmountMinor: 95_000, pricingBasis: "place_reference" as const, pricePrecision: "derived" as const, confidenceLevel: "HIGH" as const, derivationVersion: "normal-solo-order-class.v1" };
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(casaManila), now }).status, "fits");
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(distinctPassEnvelope), now }).status, "may_exceed");
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: resolved(oceanToJungle), now }).status, "exceeds");
  assert.equal(evaluateBudget({ budgetAmountMinor: 150_000, partySize: 2, resolvedPrice: null, now }).status, "unknown");
});
