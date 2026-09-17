import assert from "node:assert/strict";
import test from "node:test";
import { GooglePlacesClientError } from "../src/google-places/client.js";
import { matchExploreWisePlace } from "../src/google-places/matcher.js";
import { normalizeGooglePlaceName } from "../src/google-places/normalization.js";
import { scoreGooglePlaceMatch } from "../src/google-places/scoring.js";
import type { ExploreWiseGooglePlace, GooglePlaceCandidate, GooglePlacesSearchClient } from "../src/google-places/types.js";

const place = (overrides: Partial<ExploreWiseGooglePlace> = {}): ExploreWiseGooglePlace => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Yardstick Coffee",
  address: "106 Esteban Street, Legazpi Village",
  city: "Makati",
  district: null,
  region: "Metro Manila",
  countryCode: "PH",
  categoryCode: "food.cafe",
  latitude: 14.5568,
  longitude: 121.0172,
  source: "foursquare_os",
  sourcePlaceId: "source-1",
  ...overrides,
});

const candidate = (overrides: Partial<GooglePlaceCandidate> = {}): GooglePlaceCandidate => ({
  id: "google-1",
  displayName: "Yardstick Coffee",
  formattedAddress: "106 Esteban Street, Legazpi Village, Makati, Metro Manila, Philippines",
  latitude: 14.55682,
  longitude: 121.01721,
  primaryType: "coffee_shop",
  ...overrides,
});

test("exact name and close coordinates produce a match", () => {
  const result = scoreGooglePlaceMatch(place(), [candidate()]);
  assert.equal(result.status, "matched");
  assert.ok(result.confidence! >= 0.9);
  assert.ok(result.coordinateDistanceMeters! < 5);
});

test("name normalization handles punctuation, apostrophes, and ampersands", () => {
  assert.equal(normalizeGooglePlaceName("McDonald’s & Co."), "mcdonalds and co");
  const result = scoreGooglePlaceMatch(place({ name: "Bo's Coffee & Tea" }), [candidate({ displayName: "Bos Coffee and Tea" })]);
  assert.ok(result.nameSimilarity! > 0.95);
});

test("compact scoring recognizes merged branding words", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Royce Tea" }),
    [candidate({ displayName: "Roycetea (Ayala Malls Manila Bay)", primaryType: "tea_house" })],
  );
  assert.ok(result.nameSimilarity! >= 0.9);
});

test("descriptor-aware containment recognizes a possessive cafe brand", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Pookaberry’s Café" }),
    [candidate({ displayName: "Pookaberry", primaryType: "cafe" })],
  );
  assert.ok(result.nameSimilarity! >= 0.9);
});

test("descriptor-aware containment recognizes a restobar suffix", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Cafe Esso" }),
    [candidate({ displayName: "Cafe Esso Restobar - Korea Town Manila", primaryType: "bar" })],
  );
  assert.ok(result.nameSimilarity! >= 0.95);
});

test("a locality suffix does not dilute a multi-token independent venue", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "New Hatchin Japanese Grocery", categoryCode: "food.restaurant" }),
    [candidate({ displayName: "New Hatchin Japanese Grocery Makati", primaryType: "grocery_store" })],
  );
  assert.ok(result.nameSimilarity! >= 0.95);
});

test("independent venue branch suffixes preserve core-name confidence", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "JT's Manukan Grille", categoryCode: "food.restaurant" }),
    [candidate({ displayName: "JT's Manukan Grille - Centris Walk", primaryType: "filipino_restaurant" })],
  );
  assert.equal(result.status, "matched");
  assert.ok(result.nameSimilarity! >= 0.9);
});

test("generic restaurant descriptors do not dilute the core name", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Kingdom Buffet", categoryCode: "food.restaurant" }),
    [candidate({ displayName: "KINGDOM BUFFET RESTAURANT", primaryType: "buffet_restaurant" })],
  );
  assert.equal(result.status, "matched");
  assert.ok(result.nameSimilarity! >= 0.95);
});

test("a shared generic cafe token cannot establish name identity", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Cafe Uno" }),
    [candidate({ displayName: "Cafe Dos", primaryType: "cafe" })],
  );
  assert.equal(result.status, "unmatched");
  assert.ok(result.nameSimilarity! < 0.4);
});

test("a generic-only name is low-information even when text is exact", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Cafe" }),
    [candidate({ displayName: "Café", primaryType: "cafe" })],
  );
  assert.equal(result.status, "unmatched");
  assert.equal(result.nameSimilarity, 0.25);
});

test("safe trailing company suffixes do not reduce name identity", () => {
  assert.equal(normalizeGooglePlaceName("Yardstick Coffee, Inc."), "yardstick coffee");
  assert.equal(scoreGooglePlaceMatch(place({ name: "Yardstick Coffee, Inc." }), [candidate()]).status, "matched");
});

test("near coordinates select the correct franchise branch over a farther branch", () => {
  const ew = place({ name: "Jollibee", address: "Ayala Avenue", city: "Makati", categoryCode: "food.restaurant" });
  const result = scoreGooglePlaceMatch(ew, [
    candidate({ id: "far", displayName: "Jollibee", formattedAddress: "Quezon City", latitude: 14.65, longitude: 121.03, primaryType: "fast_food_restaurant" }),
    candidate({ id: "near", displayName: "Jollibee", formattedAddress: "Ayala Avenue, Makati", latitude: 14.55682, longitude: 121.01721, primaryType: "fast_food_restaurant" }),
  ]);
  assert.equal(result.status, "matched");
  assert.equal(result.bestGooglePlaceId, "near");
});

test("a wrong same-brand branch farther away cannot auto-match", () => {
  const result = scoreGooglePlaceMatch(place({ name: "KFC", categoryCode: "food.restaurant" }), [candidate({ displayName: "KFC", latitude: 14.7, longitude: 121.1, primaryType: "fast_food_restaurant" })]);
  assert.equal(result.status, "unmatched");
});

test("a named chain branch cannot match a different distant branch", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Starbucks BGC High Street", address: null, city: "Taguig", categoryCode: "food.cafe" }),
    [candidate({ displayName: "Starbucks Uptown Mall", formattedAddress: "Taguig", latitude: 14.565, longitude: 121.03, primaryType: "coffee_shop" })],
  );
  assert.equal(result.status, "unmatched");
});

test("an exact common name far away remains unmatched", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Paotsin", categoryCode: "food.restaurant" }),
    [candidate({ displayName: "Paotsin", formattedAddress: "Quezon City", latitude: 14.573, longitude: 121.0172, primaryType: "fast_food_restaurant" })],
  );
  assert.equal(result.status, "unmatched");
});

test("nearby garden names with different identities remain unmatched", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Garden at MOA", categoryCode: "outdoor.park" }),
    [candidate({ displayName: "Sky Garden", primaryType: "garden" })],
  );
  assert.equal(result.status, "unmatched");
});

test("two nearly equal same-brand candidates are ambiguous", () => {
  const ew = place({ name: "Starbucks", categoryCode: "food.cafe" });
  const result = scoreGooglePlaceMatch(ew, [
    candidate({ id: "a", displayName: "Starbucks", latitude: 14.55682, longitude: 121.01721 }),
    candidate({ id: "b", displayName: "Starbucks", latitude: 14.55683, longitude: 121.01722 }),
  ]);
  assert.equal(result.status, "ambiguous");
  assert.match(result.ambiguityReason!, /plausible starbucks branches/u);
});

test("an independent venue can match from compatible evidence", () => {
  assert.equal(scoreGooglePlaceMatch(place(), [candidate()]).status, "matched");
});

test("no candidates is unmatched", () => {
  const result = scoreGooglePlaceMatch(place(), []);
  assert.equal(result.status, "unmatched");
  assert.equal(result.bestGooglePlaceId, null);
});

test("a very distant candidate is unmatched", () => {
  const result = scoreGooglePlaceMatch(place(), [candidate({ latitude: 15.5, longitude: 121.8 })]);
  assert.equal(result.status, "unmatched");
});

test("an incomplete address can still match with name, city, and close coordinates", () => {
  const result = scoreGooglePlaceMatch(place({ address: null }), [candidate({ formattedAddress: "Makati, Metro Manila, Philippines" })]);
  assert.equal(result.status, "matched");
});

test("a missing category is neutral rather than fatal", () => {
  const result = scoreGooglePlaceMatch(place({ categoryCode: null }), [candidate()]);
  assert.equal(result.status, "matched");
  assert.equal(result.categorySupport, 0.5);
});

test("official Google food and cafe subtypes support compatible ExploreWise categories", () => {
  assert.equal(scoreGooglePlaceMatch(place({ categoryCode: "food.restaurant" }), [candidate({ primaryType: "buffet_restaurant" })]).categorySupport, 1);
  assert.equal(scoreGooglePlaceMatch(place({ categoryCode: "food.restaurant" }), [candidate({ primaryType: "korean_restaurant" })]).categorySupport, 1);
  assert.equal(scoreGooglePlaceMatch(place({ categoryCode: "food.cafe" }), [candidate({ primaryType: "tea_house" })]).categorySupport, 1);
});

test("branch tokens that conflict require review even at close coordinates", () => {
  const result = scoreGooglePlaceMatch(
    place({ name: "Starbucks BGC High Street", address: null, city: "Taguig", categoryCode: "food.cafe" }),
    [candidate({ displayName: "Starbucks Uptown Mall", formattedAddress: "Taguig", primaryType: "coffee_shop" })],
  );
  assert.equal(result.status, "needs_review");
});

test("an unrelated nearby result remains unmatched", () => {
  const result = scoreGooglePlaceMatch(place(), [candidate({ displayName: "Completely Different Museum", primaryType: "museum" })]);
  assert.equal(result.status, "unmatched");
});

test("Google API errors become retry-safe error results", async () => {
  const client: GooglePlacesSearchClient = { searchText: async () => { throw new GooglePlacesClientError("api_error", "Google Places failed.", true); } };
  const result = await matchExploreWisePlace(place(), client);
  assert.equal(result.status, "error");
  assert.equal(result.apiCallCount, 1);
  assert.equal(result.bestGooglePlaceId, null);
});

test("missing API key errors report zero calls", async () => {
  const client: GooglePlacesSearchClient = { searchText: async () => { throw new GooglePlacesClientError("missing_api_key", "Missing key.", false); } };
  const result = await matchExploreWisePlace(place(), client);
  assert.equal(result.status, "error");
  assert.equal(result.apiCallCount, 0);
});
