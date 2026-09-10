import assert from "node:assert/strict";
import test from "node:test";
import { metroManilaRegion } from "../../../data/regions/metro-manila.js";
import { resolveFoursquareCategory } from "../../../data/category-mappings/foursquare.js";
import { buildFoursquareSampleReport } from "../src/reporting/foursquare-sample.js";
import type { RawSourcePlace } from "../src/types/index.js";
import { RunDuplicateTracker } from "../src/validation/duplicate-tracker.js";
import { normalizeAndValidatePlace } from "../src/validation/validate-place.js";

test("Foursquare sample reporting separates valid, review, closed, flags, and missing fields", () => {
  const rawRecords: RawSourcePlace[] = [
    {
      sourcePlaceId: "sample-cafe",
      name: "Sample Café",
      categorySourceCode: "4bf58dd8d48988d16d941735",
      countryCode: "PH",
      region: "Metro Manila",
      city: "Makati",
      address: "Test address",
      latitude: 14.55,
      longitude: 121.02,
      timezone: "Asia/Manila",
      currencyCode: "PHP",
      websiteUrl: "https://example.invalid/cafe#menu",
      sourceUpdatedAt: "2026-08-01",
      sourceQualityFlags: ["sample_flag"],
      sourcePayload: {
        fsq_place_id: "sample-cafe",
        name: "Sample Café",
        latitude: 14.55,
        longitude: 121.02,
        address: "Test address",
        locality: "Makati",
        region: "Metro Manila",
        postcode: "1200",
        country: "PH",
        tel: "+63 2 0000 0000",
        website: "https://example.invalid/cafe#menu",
        date_refreshed: "2026-08-01",
        fsq_category_ids: ["4bf58dd8d48988d16d941735", "4bf58dd8d48988d1e0931735"],
        fsq_category_labels: ["Dining and Drinking > Cafe, Coffee, and Tea House > Café", "Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop"],
        unresolved_flags: ["sample_flag"],
      },
    },
    {
      sourcePlaceId: "sample-closed",
      name: "Sample Closed",
      categorySourceCode: "unmapped-category",
      countryCode: "PH",
      region: "Metro Manila",
      city: "Manila",
      latitude: 14.6,
      longitude: 120.98,
      timezone: "Asia/Manila",
      currencyCode: "PHP",
      sourceUpdatedAt: "2026-08-02",
      sourceClosedAt: "2026-08-03",
      sourceQualityFlags: ["sample_flag"],
      sourcePayload: {
        fsq_place_id: "sample-closed",
        name: "Sample Closed",
        latitude: 14.6,
        longitude: 120.98,
        locality: "Manila",
        region: "Metro Manila",
        country: "PH",
        date_refreshed: "2026-08-02",
        date_closed: "2026-08-03",
        fsq_category_ids: ["unmapped-category"],
        fsq_category_labels: ["Unmapped Test Category"],
        unresolved_flags: ["sample_flag"],
      },
    },
  ];
  const duplicateTracker = new RunDuplicateTracker();
  const stagingRecords = rawRecords.map((record) => normalizeAndValidatePlace(record, {
    ingestionRunId: "sample-run",
    sourceId: "sample-source",
    sourceCode: "foursquare_os",
    knownSourceCodes: new Set(["foursquare_os"]),
    region: metroManilaRegion,
    unknownCategoryPolicy: "review",
  }, resolveFoursquareCategory, duplicateTracker));

  const report = buildFoursquareSampleReport(rawRecords, stagingRecords, metroManilaRegion);

  assert.equal(report.rowsSelected, 2);
  assert.equal(report.valid, 1);
  assert.equal(report.review, 1);
  assert.equal(report.rejected, 0);
  assert.equal(report.closed, 1);
  assert.equal(report.missingAddress, 1);
  assert.equal(report.missingPostcode, 1);
  assert.equal(report.missingPhone, 1);
  assert.equal(report.missingWebsite, 1);
  assert.equal(report.categoryCoverage, 2);
  assert.equal(report.unmappedCategoryCount, 1);
  assert.equal(report.multipleCategoryPlaces, 1);
  assert.equal(report.unresolvedFlagCoverage, 2);
  assert.deepEqual(report.unresolvedFlags, [{
    flag: "sample_flag",
    samplePlaces: 2,
    exampleSourcePlaceIds: ["sample-cafe", "sample-closed"],
  }]);
  assert.deepEqual(report.coordinates.outlierSourcePlaceIds, []);
});
