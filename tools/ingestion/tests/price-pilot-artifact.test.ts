import assert from "node:assert/strict";
import test from "node:test";
import { getImportablePilotPrices, validatePilotArtifact, type PilotArtifact, type PilotUnresolvedPriceEvidence } from "../src/pricing/pilot-artifact.js";

const casaPlaceId = "00000000-0000-4000-8000-000000000001";
const oceanPlaceId = "00000000-0000-4000-8000-000000000002";
const casaCandidate = { placeId: casaPlaceId, outcome: "verified" as const, reason: "Current official regular admission." };
const price = {
  recordId: "casa-manila-regular", target: { placeId: casaPlaceId }, currencyCode: "PHP", minAmountMinor: 7_500, maxAmountMinor: 7_500,
  pricingStatus: "paid" as const, pricingUnit: "admission" as const, pricingSource: "official_website" as const,
  pricePrecision: "exact" as const, confidenceLevel: "VERIFIED" as const, sourceUrl: "https://example.test/casa", sourceType: "official_website",
  retrievedAt: "2026-09-03T00:00:00.000Z", applicabilityScope: "PLACE_LEVEL_PRICE" as const, applicabilityNotes: "Regular admission.", evidenceNotes: "Official evidence.",
};
const oceanEvidence: PilotUnresolvedPriceEvidence = {
  placeId: oceanPlaceId, reasonCode: "PRODUCT_VARIANT_NOT_REPRESENTABLE", applicabilityScope: "MULTI_VENUE_PRODUCT", productName: "Ocean to Jungle, One Pass",
  currencyCode: "PHP", minAmountMinor: 95_000, maxAmountMinor: 95_000, pricingStatus: "paid", pricingUnit: "admission", pricingSource: "official_website",
  pricePrecision: "exact", confidenceLevel: "VERIFIED", sourceUrl: "https://example.test/ocean", sourceType: "official_website", sourceReferenceId: "ocean-to-jungle",
  retrievedAt: "2026-09-03T00:00:00.000Z", validFrom: "2026-06-29T16:00:00.000Z", validUntil: "2026-10-01T15:59:59.999Z",
  applicabilityNotes: "One-person promotional access to two venues.", evidenceNotes: "Official pass price and validity.",
};
const oceanCandidate = { placeId: oceanPlaceId, outcome: "unresolved" as const, reason: "PRODUCT_VARIANT_NOT_REPRESENTABLE", unresolvedPriceEvidence: oceanEvidence };

function artifact(overrides: Partial<PilotArtifact> = {}): PilotArtifact {
  return { schemaVersion: "explorewise.price-pilot.v1", reviewStatus: "approved", generatedAt: "2026-09-03T00:00:00.000Z", supportedCurrencies: ["PHP"], candidates: [casaCandidate], prices: [price], chains: [], memberships: [], ...overrides };
}

test("Casa Manila regular admission is importable place-level evidence", () => {
  const input = artifact();
  assert.doesNotThrow(() => validatePilotArtifact(input, { requireApproved: true }));
  assert.deepEqual(getImportablePilotPrices(input).map((item) => item.recordId), ["casa-manila-regular"]);
});

test("named promotional passes cannot be imported as generic place prices", () => {
  const namedPass = { ...price, recordId: "named-pass", applicabilityScope: "NAMED_TICKET_OR_PASS" as const };
  assert.throws(() => validatePilotArtifact(artifact({ prices: [namedPass] })), /only PLACE_LEVEL_PRICE is importable/u);
});

test("multi-venue passes remain unresolved even when their factual amount is verified", () => {
  const multiVenuePass = { ...price, recordId: "multi-venue", applicabilityScope: "MULTI_VENUE_PRODUCT" as const, minAmountMinor: 95_000, maxAmountMinor: 95_000 };
  assert.throws(() => validatePilotArtifact(artifact({ prices: [multiVenuePass] })), /only PLACE_LEVEL_PRICE is importable/u);
  assert.doesNotThrow(() => validatePilotArtifact(artifact({ candidates: [casaCandidate, oceanCandidate], prices: [price] })));
});

test("unresolved product evidence retains official provenance and factual price", () => {
  const input = artifact({ candidates: [casaCandidate, oceanCandidate], prices: [price] });
  validatePilotArtifact(input);
  const evidence = input.candidates[1]?.unresolvedPriceEvidence;
  assert.equal(evidence?.productName, "Ocean to Jungle, One Pass");
  assert.equal(evidence?.minAmountMinor, 95_000);
  assert.equal(evidence?.sourceUrl, "https://example.test/ocean");
  assert.equal(evidence?.validUntil, "2026-10-01T15:59:59.999Z");
});

test("approved artifacts expose only explicitly importable prices to the importer", () => {
  const input = artifact({ candidates: [casaCandidate, oceanCandidate], prices: [price] });
  validatePilotArtifact(input, { requireApproved: true });
  assert.deepEqual(getImportablePilotPrices(input).map((item) => item.target.placeId), [casaPlaceId]);
});

test("rejects invalid, unreviewed, and unscoped price artifacts", () => {
  assert.throws(() => validatePilotArtifact(artifact({ reviewStatus: "pending_human_review" }), { requireApproved: true }));
  assert.throws(() => validatePilotArtifact(artifact({ prices: [{ ...price, minAmountMinor: -1 }] })));
  assert.throws(() => validatePilotArtifact(artifact({ prices: [{ ...price, currencyCode: "USD" }] })));
  assert.throws(() => validatePilotArtifact(artifact({ prices: [{ ...price, sourceUrl: "" }] })));
  assert.throws(() => validatePilotArtifact(artifact({ prices: [{ ...price, applicabilityScope: "PACKAGE" as const }] })), /only PLACE_LEVEL_PRICE/u);
});
