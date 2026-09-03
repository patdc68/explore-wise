import assert from "node:assert/strict";
import test from "node:test";
import { buildManifest, generateMerchantCandidates, isStaleEvidence, matchMerchantStore, normalizeCurrency, normalizeMetroManilaLocality, normalizePhilippineAddress, normalizePhilippinePhone, stableHash } from "../src/pricing/merchant-ordering.js";

const merchant = { key: "example", name: "Example", officialDomain: "example.com", sourceType: "official_ordering_system" as const, sourceReference: "https://example.com/order", refreshFeasibility: "AUTOMATABLE_REFRESH" as const };
const base = () => ({ merchant, capturedAt: "2026-09-03T00:00:00.000Z", storeDiscovery: "BULK_ENUMERABLE" as const, stores: [{ externalStoreId: "s1", name: "Example One", address: "1 Main St", sourceReference: "https://example.com/stores/s1" }], menus: [{ externalMenuId: "m1", applicability: "STORE_MENU" as const, channel: "pickup" as const, capturedAt: "2026-09-03T00:00:00.000Z", sourceReference: "https://example.com/menu/m1", items: [{ externalItemId: "i1", name: "Coffee", amountMinor: 12000, currency: "php", sourceReference: "https://example.com/menu/m1" }] }], warnings: [], unsupportedFields: [] });
test("normalizes source identity, currency, channel, and stable manifest hashes", () => { const a = buildManifest(base()); const b = buildManifest(base()); assert.equal(a.merchant.officialDomain, "example.com"); assert.equal(a.menus[0]!.channel, "pickup"); assert.equal(a.menus[0]!.items[0]!.currency, "php"); assert.equal(normalizeCurrency(" php "), "PHP"); assert.equal(a.manifestHash, b.manifestHash); assert.equal(stableHash({ b: 1, a: 2 }), stableHash({ a: 2, b: 1 })); });
test("rejects duplicate external store/menu/item IDs", () => { const input = base(); input.stores = [...input.stores, { ...input.stores[0]! }]; assert.throws(() => buildManifest(input), /Duplicate external store ID/); const menus = base(); menus.menus = [...menus.menus, { ...menus.menus[0]! }]; assert.throws(() => buildManifest(menus), /Duplicate external menu ID/); const items = base(); items.menus = [{ ...items.menus[0]!, items: [...items.menus[0]!.items, { ...items.menus[0]!.items[0]! }] }]; assert.throws(() => buildManifest(items), /Duplicate item ID/); });
test("Philippine addresses retain branch detail while standardizing common forms", () => {
  assert.equal(normalizePhilippineAddress("G/F, The Podium, Ortigas Center, Mandaluyong, Metro Manila"), "ground floor the podium ortigas center mandaluyong metro manila");
  assert.equal(normalizePhilippineAddress("Lot1 Block 9 Albany St., cor. Annapolis, San Juan"), "lot1 block 9 albany street corner annapolis san juan");
  assert.equal(normalizeMetroManilaLocality("106 Esteban Street, Makati, Metro Manila"), "106 esteban street makati");
});
test("Philippine phone matching is exact after safe country-format normalization", () => {
  assert.deepEqual(normalizePhilippinePhone("+63 920 911 4913 / 02 8635-4668"), ["639209114913", "63286354668"]);
  assert.deepEqual(normalizePhilippinePhone("(02) 8724 0322"), ["63287240322"]);
  assert.deepEqual(normalizePhilippinePhone("6327112770"), []);
});
test("two-stage matching finds Chowking branch candidates but does not confirm a name alone", () => {
  const store = { name: "Chowking Annapolis Albany", address: "Lot1 Block 9 Albany Street, Corner Annapolis Street", phone: "86937017 / 0998-9524339", sourceReference: "https://example.com" };
  const places = [{ id: "a", name: "Chowking Annapolis", address: "Lot 1 Block 9 Albany St, cor Annapolis, San Juan, 1503 Metro Manila", city: "San Juan", latitude: 14.603977, longitude: 121.05248 }, { id: "b", name: "Chowking", address: "Other", city: "Makati" }];
  assert.equal(generateMerchantCandidates("Chowking", store, places).length, 2);
  assert.equal(matchMerchantStore("Chowking", store, places).outcome, "MATCHED_HIGH_CONFIDENCE");
  assert.equal(matchMerchantStore("Chowking", { name: "Chowking Unknown", sourceReference: "https://example.com" }, [{ id: "b", name: "Chowking", city: "Makati" }]).outcome, "REVIEW_REQUIRED");
});
test("Yardstick official address and EW address can confirm with independent locality evidence", () => {
  const store = { name: "Yardstick Legazpi Village", address: "Universal LMS Building, 106 Esteban Street, Makati, Metro Manila", sourceReference: "https://example.com" };
  const places = [{ id: "legazpi", name: "Yardstick Coffee", address: "106 Esteban Street, Legaspi Village", city: "Makati", latitude: 14.5568131, longitude: 121.0172452 }];
  assert.equal(matchMerchantStore("Yardstick Coffee", store, places).outcome, "MATCHED_HIGH_CONFIDENCE");
});
test("an address overlap outside the known merchant context is never a branch confirmation", () => {
  const store = { name: "Chowking Example", address: "106 Esteban Street, Makati", sourceReference: "https://example.com" };
  assert.equal(matchMerchantStore("Chowking", store, [{ id: "other", name: "Unrelated Cafe", address: "106 Esteban St, Makati", city: "Makati" }]).outcome, "REVIEW_REQUIRED");
});
test("address mismatch and coordinate conflict never auto-match", () => { const store = { name: "Example", address: "1 Main", latitude: 14.6, longitude: 121, sourceReference: "https://example.com" }; assert.equal(matchMerchantStore("Example", store, [{ id: "a", name: "Example", address: "Other", latitude: 14.60001, longitude: 121 }]).outcome, "REVIEW_REQUIRED"); });
test("stale evidence and source changes are detectable", () => { assert.equal(isStaleEvidence("2026-01-01T00:00:00.000Z", "2026-09-03T00:00:00.000Z", 90), true); const original = buildManifest(base()); const recaptured = buildManifest({ ...base(), capturedAt: "2026-09-04T00:00:00.000Z", menus: [{ ...base().menus[0]!, capturedAt: "2026-09-04T00:00:00.000Z" }] }); const changed = buildManifest({ ...base(), menus: [{ ...base().menus[0]!, items: [{ ...base().menus[0]!.items[0]!, amountMinor: 12100 }] }] }); assert.equal(original.menus[0]!.contentHash, recaptured.menus[0]!.contentHash); assert.notEqual(original.menus[0]!.contentHash, changed.menus[0]!.contentHash); });
test("unsupported source reference is rejected", () => { const input = base(); input.merchant = { ...merchant, sourceReference: "https://other.example/order" }; assert.throws(() => buildManifest(input), /declared official domain/); });
