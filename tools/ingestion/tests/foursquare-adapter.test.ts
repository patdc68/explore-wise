import assert from "node:assert/strict";
import test from "node:test";
import { metroManilaRegion } from "../../../data/regions/metro-manila.js";
import {
  foursquareCategoryRules,
  resolveFoursquareCategory,
} from "../../../data/category-mappings/foursquare.js";
import {
  classifyFoursquareFailure,
  FoursquareCatalogAccessError,
  sanitizeFoursquareError,
} from "../src/sources/foursquare-errors.js";
import {
  FoursquareOpenSourcePlacesAdapter,
  type FoursquareCatalogReader,
  type FoursquarePlaceRow,
} from "../src/sources/foursquare.js";

class MockFoursquareCatalog implements FoursquareCatalogReader {
  readonly calls: Array<{ regionCode: string; limit: number }> = [];

  constructor(private readonly rows: readonly FoursquarePlaceRow[]) {}

  async readPlaces(
    region: typeof metroManilaRegion,
    limit: number,
  ): Promise<readonly FoursquarePlaceRow[]> {
    this.calls.push({ regionCode: region.regionCode, limit });
    return this.rows.slice(0, limit);
  }
}

test("Foursquare adapter maps documented source fields without live access", async () => {
  const catalog = new MockFoursquareCatalog([{
    fsq_place_id: "mock-fsq-id",
    name: "TEST / MOCK Place",
    latitude: 14.55,
    longitude: 121.03,
    address: "Mock address",
    locality: "Mock City",
    region: "Metro Manila",
    admin_region: "Mock District",
    country: "PH",
    date_refreshed: "2026-08-01",
    tel: "+63 2 0000 0000",
    website: "https://example.invalid/mock",
    fsq_category_ids: ["mock-category-id"],
    fsq_category_labels: ["Mock > Category"],
  }]);
  const adapter = new FoursquareOpenSourcePlacesAdapter(catalog);

  const rows = await adapter.read({ region: metroManilaRegion, limit: 1 });

  assert.deepEqual(catalog.calls, [{ regionCode: "PH-NCR", limit: 1 }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    sourcePlaceId: "mock-fsq-id",
    name: "TEST / MOCK Place",
    categorySourceCode: "mock-category-id",
    sourceCategoryClassifications: [],
    sourceTaxonomyDecision: {
      decision: "review",
      reason: "no_source_categories",
      ruleVersion: "foursquare-taxonomy-v2.0.0",
      selectedCategory: null,
      evidence: { categories: [], contextualNameGuards: [] },
    },
    countryCode: "PH",
    region: "Metro Manila",
    city: "Mock City",
    district: "Mock District",
    address: "Mock address",
    latitude: 14.55,
    longitude: 121.03,
    timezone: "Asia/Manila",
    currencyCode: "PHP",
    websiteUrl: "https://example.invalid/mock",
    phoneNumber: "+63 2 0000 0000",
    sourceUpdatedAt: "2026-08-01",
    sourceClosedAt: undefined,
    sourceQualityFlags: undefined,
    sourcePayload: {
      fsq_place_id: "mock-fsq-id",
      name: "TEST / MOCK Place",
      latitude: 14.55,
      longitude: 121.03,
      address: "Mock address",
      locality: "Mock City",
      region: "Metro Manila",
      admin_region: "Mock District",
      country: "PH",
      date_refreshed: "2026-08-01",
      tel: "+63 2 0000 0000",
      website: "https://example.invalid/mock",
      fsq_category_ids: ["mock-category-id"],
      fsq_category_labels: ["Mock > Category"],
    },
  });
});

test("live sample bounds are enforced before catalog access", async () => {
  const catalog = new MockFoursquareCatalog([]);
  const adapter = new FoursquareOpenSourcePlacesAdapter(catalog);

  await assert.rejects(
    adapter.read({ region: metroManilaRegion, limit: 51 }),
    /between 1 and 50/u,
  );
  assert.equal(catalog.calls.length, 0);
});

test("Foursquare failures are classified from the actual DuckDB error", () => {
  assert.equal(
    classifyFoursquareFailure(
      new Error("IO Error: Could not resolve hostname error for HTTP GET"),
      "catalog_attach",
    ),
    "network_issue",
  );
  assert.equal(
    classifyFoursquareFailure(new Error("HTTP 403 Forbidden"), "table_query"),
    "authorization_entitlement_failure",
  );
  assert.equal(
    classifyFoursquareFailure(
      new Error("Catalog Error: Table with name places_os does not exist"),
      "table_query",
    ),
    "table_not_found",
  );
});

test("sanitized catalog errors never retain the access token", () => {
  const token = "test-secret-that-must-not-appear";
  const error = sanitizeFoursquareError(
    new Error(`request failed for token ${token}`),
    token,
    "table_query",
  );

  assert.ok(error instanceof FoursquareCatalogAccessError);
  assert.equal(error.message.includes(token), false);
  assert.equal(error.message.includes("[REDACTED]"), true);
});

test("verified direct IDs remain mapped while ancestry mappings come from the catalog", () => {
  assert.equal(
    resolveFoursquareCategory("4d4b7105d754a06374d81259").exploreWiseCategoryCode,
    "food.restaurant",
  );
  assert.equal(
    resolveFoursquareCategory("4bf58dd8d48988d16d941735").exploreWiseCategoryCode,
    "food.cafe",
  );
  assert.equal(
    resolveFoursquareCategory("4bf58dd8d48988d1e0931735").exploreWiseCategoryCode,
    "food.cafe",
  );
  assert.equal(resolveFoursquareCategory("unreviewed-category").status, "review");
});

test("V1 Foursquare rules use unique IDs and explicit include, exclude, and review decisions", () => {
  const identities = foursquareCategoryRules.map((rule) => `${rule.categoryId}:${rule.precedence}`);
  assert.equal(new Set(identities).size, identities.length);
  assert.ok(foursquareCategoryRules.some((rule) => (
    rule.categoryId === "4bf58dd8d48988d17f941735"
    && rule.decision === "include"
    && rule.exploreWiseCategoryCode === "entertainment.cinema"
  )));
  assert.ok(foursquareCategoryRules.some((rule) => (
    rule.categoryId === "4bf58dd8d48988d11f941735"
    && rule.decision === "exclude"
  )));
  assert.ok(foursquareCategoryRules.some((rule) => (
    rule.categoryId === "4d4b7105d754a06373d81259"
    && rule.decision === "review"
  )));
});
