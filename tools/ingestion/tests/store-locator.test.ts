import assert from "node:assert/strict";
import test from "node:test";
import { OfficialSnapshotStoreLocatorAdapter, buildMatchingArtifact, buildStoreLocatorManifest, calibrateCoordinates, generateStoreLocatorCandidates, matchStoreLocator, normalizePhilippineAddress, normalizePhilippinePhone, type ExploreWisePlace, type OfficialStore } from "../src/identity/store-locator.js";

const source = { merchantKey: "example-coffee", merchantName: "Example Coffee", officialDomains: ["example.com"], sourceType: "official_store_locator" as const, sourceReference: "https://www.example.com/locations", access: "PUBLIC_NORMAL_EXPERIENCE" as const };
const store = (overrides: Record<string, unknown> = {}): OfficialStore => ({ officialName: "Example Coffee Legaspi", address: "Universal LMS Building, 106 Esteban St., Makati, Metro Manila", officialReference: "https://www.example.com/locations", ...overrides } as OfficialStore);
const place = (overrides: Record<string, unknown> = {}): ExploreWisePlace => ({ id: "place-1", name: "Example Coffee", address: "106 Esteban Street, Legazpi Village", city: "Makati", ...overrides } as ExploreWisePlace);
const manifest = (stores = [store()]) => buildStoreLocatorManifest({ collectionStatus: "SUPPORTED", merchant: source, capturedAt: "2026-09-03T00:00:00.000Z", stores, warnings: [], unsupportedFields: [] });

test("normalizes Philippine store evidence without erasing useful unit and locality detail", () => {
  assert.equal(normalizePhilippineAddress("G/F, The Podium, Ortigas Center, Mandaluyong, Metro Manila"), "ground floor the podium ortigas center mandaluyong metro manila");
  assert.deepEqual(normalizePhilippinePhone("+63 920 911 4913 / (02) 8635-4668"), ["63286354668", "639209114913"]);
  assert.deepEqual(normalizePhilippinePhone("6327112770"), []);
});
test("rejects duplicate official external IDs and preserves source provenance", () => {
  assert.throws(() => manifest([{ ...store(), externalStoreId: "x" }, { ...store({ officialName: "Example Coffee Two" }), externalStoreId: "x" }]), /Duplicate external store ID/);
  const result = manifest();
  assert.equal(result.provenance.adapterVersion, "store-locator-identity.v1");
  assert.match(result.provenance.sourceHash, /^[a-f0-9]{64}$/u);
});
test("merchant context generates qualified branch candidates but cannot establish identity alone", () => {
  const candidates = generateStoreLocatorCandidates(source, store({ officialName: "Example Coffee Annapolis Albany", address: undefined }), [place({ name: "Example Coffee Annapolis", address: undefined, city: undefined })]);
  assert.equal(candidates.length, 1);
  assert.equal(matchStoreLocator(source, store({ address: undefined }), [place({ address: undefined, city: undefined })]).outcome, "REVIEW_REQUIRED");
});
test("exact normalized phone plus merchant context confirms one branch", () => {
  const result = matchStoreLocator(source, store({ phone: "0917 123 4567", address: undefined }), [place({ phone: "+63 (917) 123-4567", address: undefined, city: undefined })]);
  assert.equal(result.outcome, "MATCHED_HIGH_CONFIDENCE");
  assert.match(result.confidenceBasis.join(" "), /exact normalized official phone/u);
});
test("strong address agreement confirms while weak address evidence stays in review", () => {
  assert.equal(matchStoreLocator(source, store(), [place()]).outcome, "MATCHED_HIGH_CONFIDENCE");
  const weak = matchStoreLocator(source, store({ address: "The Podium, Ortigas Center, Mandaluyong" }), [place({ address: "The Podium, Ortigas", city: "Mandaluyong" })]);
  assert.equal(weak.outcome, "REVIEW_REQUIRED");
});
test("conflicting locality never auto-matches even with an exact phone", () => {
  const result = matchStoreLocator(source, store({ phone: "09171234567" }), [place({ city: "Quezon City", phone: "639171234567" })]);
  assert.equal(result.outcome, "CONFLICT");
});
test("coordinates are disabled before calibration and can confirm only after a source-specific calibration", () => {
  const locatedStore = store({ address: undefined, locality: "Makati", latitude: 14.5568, longitude: 121.0172 });
  const locatedPlace = place({ address: undefined, latitude: 14.55685, longitude: 121.0172 });
  assert.equal(matchStoreLocator(source, locatedStore, [locatedPlace]).outcome, "REVIEW_REQUIRED");
  const calibration = calibrateCoordinates([8, 18, 20]);
  assert.equal(calibration.thresholdMeters, 25);
  assert.equal(matchStoreLocator(source, locatedStore, [locatedPlace], calibration).outcome, "MATCHED_HIGH_CONFIDENCE");
});
test("ambiguous mall branches create a conflict rather than selecting one", () => {
  const official = store({ address: "G/F, The Podium, Ortigas Center, Mandaluyong", locality: "Mandaluyong" });
  const candidates = [place({ id: "a", address: "Ground Floor The Podium Ortigas Center", city: "Mandaluyong" }), place({ id: "b", address: "Ground Floor The Podium Ortigas Center", city: "Mandaluyong" })];
  assert.equal(matchStoreLocator(source, official, candidates).outcome, "CONFLICT");
});
test("matching artifacts preserve review evidence and are stable for identical input", () => {
  const adapter = new OfficialSnapshotStoreLocatorAdapter(source, { stores: [store()], warnings: [], unsupportedFields: [] });
  const captured = adapter.collect({ capturedAt: "2026-09-03T00:00:00.000Z" });
  const first = buildMatchingArtifact(captured, [place()], "2026-09-03T00:00:00.000Z");
  const second = buildMatchingArtifact(captured, [place()], "2026-09-03T00:00:00.000Z");
  assert.deepEqual(first, second);
  assert.equal(first.matches[0]!.candidates[0]!.evidence.addressStrength, "STRONG");
});
