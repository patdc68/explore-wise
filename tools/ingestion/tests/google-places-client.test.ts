import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_TEXT_SEARCH_FIELD_MASK,
  GOOGLE_TEXT_SEARCH_URL,
  GooglePlacesClientError,
  GooglePlacesTextSearchClient,
  parseGoogleTextSearchResponse,
} from "../src/google-places/client.js";
import type { ExploreWiseGooglePlace } from "../src/google-places/types.js";

const place: ExploreWiseGooglePlace = {
  id: "11111111-1111-4111-8111-111111111111", name: "Jollibee", address: "Ayala Avenue", city: "Makati", district: null,
  region: "Metro Manila", countryCode: "PH", categoryCode: "food.restaurant", latitude: 14.5568, longitude: 121.0172,
  source: "foursquare_os", sourcePlaceId: "source-1",
};

test("Places API request is bounded, coordinate-biased, and explicitly masked", async () => {
  let request: { input?: string | URL | Request; init?: RequestInit } = {};
  const client = new GooglePlacesTextSearchClient("test-key", async (input, init) => {
    request = { input, ...(init ? { init } : {}) };
    return new Response(JSON.stringify({ places: [{ id: "g1", displayName: { text: "Jollibee" }, formattedAddress: "Makati", location: { latitude: 14.5568, longitude: 121.0172 }, primaryType: "fast_food_restaurant" }] }), { status: 200 });
  });
  const candidates = await client.searchText(place);
  assert.equal(request.input, GOOGLE_TEXT_SEARCH_URL);
  const headers = request.init!.headers as Record<string, string>;
  assert.equal(headers["X-Goog-FieldMask"], GOOGLE_TEXT_SEARCH_FIELD_MASK);
  assert.ok(!headers["X-Goog-FieldMask"].includes("*"));
  assert.ok(!/photo|rating|review|opening/i.test(headers["X-Goog-FieldMask"]));
  const body = JSON.parse(String(request.init!.body));
  assert.equal(body.pageSize, 5);
  assert.deepEqual(body.locationBias.circle.center, { latitude: place.latitude, longitude: place.longitude });
  assert.equal(candidates[0]!.id, "g1");
});

test("missing API key is rejected before a request", () => {
  assert.throws(() => new GooglePlacesTextSearchClient("  "), (error: unknown) => error instanceof GooglePlacesClientError && error.code === "missing_api_key");
});

test("non-success API responses are typed errors", async () => {
  const client = new GooglePlacesTextSearchClient("test-key", async () => new Response("", { status: 429 }));
  await assert.rejects(() => client.searchText(place), (error: unknown) => error instanceof GooglePlacesClientError && error.code === "api_error" && error.retryable);
});

test("malformed Google responses are rejected without retaining raw payloads", () => {
  assert.throws(() => parseGoogleTextSearchResponse({ places: [{ id: "missing-name" }] }), (error: unknown) => error instanceof GooglePlacesClientError && error.code === "malformed_response");
  assert.deepEqual(parseGoogleTextSearchResponse({}), []);
});
