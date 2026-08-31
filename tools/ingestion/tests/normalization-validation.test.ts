import assert from "node:assert/strict";
import test from "node:test";
import { metroManilaRegion } from "../../../data/regions/metro-manila.js";
import { normalizeName } from "../src/normalization/text.js";
import {
  isValidLatitude,
  isValidLongitude,
  normalizeCountryCode,
} from "../src/normalization/location.js";
import { normalizeAndValidatePlace } from "../src/validation/validate-place.js";
import { RunDuplicateTracker } from "../src/validation/duplicate-tracker.js";

const context = {
  ingestionRunId: "test-run",
  sourceId: "test-source-id",
  sourceCode: "foursquare_os",
  knownSourceCodes: new Set(["foursquare_os"]),
  region: metroManilaRegion,
  unknownCategoryPolicy: "review" as const,
};

const categoryResolver = (sourceCategory: string) => ({
  status: "mapped" as const,
  sourceCategory,
  exploreWiseCategoryCode: "food.cafe",
});

test("coordinate validation accepts boundaries and rejects out-of-range values", () => {
  assert.equal(isValidLatitude(-90), true);
  assert.equal(isValidLatitude(90), true);
  assert.equal(isValidLatitude(90.00001), false);
  assert.equal(isValidLongitude(-180), true);
  assert.equal(isValidLongitude(180), true);
  assert.equal(isValidLongitude(-180.00001), false);
  assert.equal(isValidLongitude(Number.NaN), false);
});

test("country-code normalization accepts only two ASCII letters", () => {
  assert.equal(normalizeCountryCode(" ph "), "PH");
  assert.equal(normalizeCountryCode("PHL"), null);
  assert.equal(normalizeCountryCode("P1"), null);
  assert.equal(normalizeCountryCode(undefined), null);
});

test("normalized names are deterministic without changing the source name", () => {
  assert.equal(normalizeName("  Café\tNORTH — Test  "), "café north test");

  const result = normalizeAndValidatePlace({
    sourcePlaceId: "opaque-ID",
    name: "  Café\tNORTH — Test  ",
    categorySourceCode: "test:cafe",
    countryCode: "ph",
    latitude: 14.5,
    longitude: 121,
    timezone: "Asia/Manila",
    currencyCode: "php",
  }, context, categoryResolver, new RunDuplicateTracker());

  assert.equal(result.name, "Café NORTH — Test");
  assert.equal(result.normalizedName, "café north test");
  assert.equal(result.sourcePlaceId, "opaque-ID");
});

test("validation records structured coordinate and country failures", () => {
  const result = normalizeAndValidatePlace({
    sourcePlaceId: "bad-place",
    name: "TEST / FICTIONAL Invalid",
    categorySourceCode: "test:cafe",
    countryCode: "PHL",
    latitude: 91,
    longitude: -181,
  }, context, categoryResolver, new RunDuplicateTracker());

  assert.equal(result.validationStatus, "invalid");
  assert.deepEqual(
    result.validationErrors.map((item) => item.code),
    ["invalid_latitude", "invalid_longitude", "invalid_country_code"],
  );
});

test("unknown categories are explicitly held for review", () => {
  const result = normalizeAndValidatePlace({
    sourcePlaceId: "unmapped-place",
    name: "TEST / FICTIONAL Unmapped Place",
    categorySourceCode: "unknown-category",
    countryCode: "PH",
    latitude: 14.5,
    longitude: 121,
  }, context, (sourceCategory) => ({
    status: "review",
    sourceCategory,
    exploreWiseCategoryCode: null,
    reason: "unmapped_source_category",
  }), new RunDuplicateTracker());

  assert.equal(result.validationStatus, "review");
  assert.equal(result.validationErrors[0]?.code, "unmapped_source_category");
});
