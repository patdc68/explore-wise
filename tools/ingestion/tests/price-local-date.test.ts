import assert from "node:assert/strict";
import test from "node:test";
import { isPriceFresh, type PriceEvidence } from "../../../packages/database/src/pricing.js";
import { localCalendarDayBoundaryToUtc } from "../src/pricing/local-date.js";

test("Philippine calendar-day boundaries convert to the correct UTC instants", () => {
  assert.equal(localCalendarDayBoundaryToUtc("2026-10-01", "Asia/Manila", "start"), "2026-09-30T16:00:00.000Z");
  assert.equal(localCalendarDayBoundaryToUtc("2026-10-01", "Asia/Manila", "end"), "2026-10-01T15:59:59.999Z");
});

test("a Philippine-local end date is valid through local end-of-day and not after", () => {
  const evidence: PriceEvidence = {
    id: "bounded", currencyCode: "PHP", minAmountMinor: 95_000, maxAmountMinor: 95_000, pricingStatus: "paid", pricingUnit: "admission",
    pricingSource: "official_website", pricePrecision: "exact", pricingBasis: "branch_verified", pricingChannel: "dine_in", confidenceLevel: "VERIFIED", lastVerifiedAt: "2026-09-03T00:00:00.000Z",
    validFrom: localCalendarDayBoundaryToUtc("2026-06-30", "Asia/Manila", "start"),
    validUntil: localCalendarDayBoundaryToUtc("2026-10-01", "Asia/Manila", "end"),
  };
  assert.equal(isPriceFresh(evidence, new Date("2026-10-01T15:59:59.999Z")), true);
  assert.equal(isPriceFresh(evidence, new Date("2026-10-01T16:00:00.000Z")), false);
});
