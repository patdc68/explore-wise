import assert from "node:assert/strict";
import test from "node:test";
import { toFoursquareStagingDatabaseRow } from "../src/reporting/foursquare-sample.js";
import { foursquareStagingInsertSql } from "../src/reporting/foursquare-staging-sql.js";
import { normalizeAndValidatePlace } from "../src/validation/validate-place.js";
import { RunDuplicateTracker } from "../src/validation/duplicate-tracker.js";
import { metroManilaRegion } from "../../../data/regions/metro-manila.js";

const context = {
  ingestionRunId: "00000000-0000-4000-8000-000000000001",
  sourceId: "00000000-0000-4000-8000-000000000002",
  sourceCode: "foursquare_os",
  knownSourceCodes: new Set(["foursquare_os"]),
  region: metroManilaRegion,
  unknownCategoryPolicy: "review" as const,
};

function mappedResolver(sourceCategory: string) {
  return { status: "mapped" as const, sourceCategory, exploreWiseCategoryCode: "food.cafe" };
}

test("staging row and every SQL artifact persist the resolved category snapshot", () => {
  const staged = normalizeAndValidatePlace({ sourcePlaceId: "fixture-1", name: "TEST Cafe", categorySourceCode: "cafe", countryCode: "PH", latitude: 14.5, longitude: 121 }, context, mappedResolver, new RunDuplicateTracker());
  const row = toFoursquareStagingDatabaseRow(staged);
  assert.equal(row.mapped_category_code, "food.cafe");
  const sql = foursquareStagingInsertSql([row]);
  assert.match(sql, /mapped_category_code/u);
  assert.match(sql, /'food\.cafe'/u);
  assert.match(sql, /on conflict \(ingestion_run_id, source_id, source_place_id\) do nothing/u);
});

test("unmapped categories retain no invented category snapshot", () => {
  const staged = normalizeAndValidatePlace({ sourcePlaceId: "fixture-2", name: "TEST Unknown", categorySourceCode: "unknown", countryCode: "PH", latitude: 14.5, longitude: 121 }, context, (sourceCategory) => ({ status: "review" as const, sourceCategory, exploreWiseCategoryCode: null, reason: "unmapped_source_category" as const }), new RunDuplicateTracker());
  assert.equal(staged.validationStatus, "review");
  assert.equal(toFoursquareStagingDatabaseRow(staged).mapped_category_code, null);
});

test("review records retain a successfully resolved category snapshot", () => {
  const staged = normalizeAndValidatePlace({ sourcePlaceId: "fixture-3", name: "TEST Closed Cafe", categorySourceCode: "cafe", countryCode: "PH", latitude: 14.5, longitude: 121, sourceClosedAt: "2026-01-01" }, context, mappedResolver, new RunDuplicateTracker());
  assert.equal(staged.validationStatus, "review");
  assert.equal(toFoursquareStagingDatabaseRow(staged).mapped_category_code, "food.cafe");
});

test("historical staging rows may continue to omit the nullable category snapshot", () => {
  const sql = foursquareStagingInsertSql([{
    ingestion_run_id: context.ingestionRunId, source_id: context.sourceId, source_place_id: "historic-fixture", source_payload: null, source_updated_at: null, name: "TEST Historical", category_source_code: "legacy", mapped_category_code: null, country_code: "PH", region: null, city: null, district: null, address: null, latitude: 14.5, longitude: 121, timezone: "Asia/Manila", currency_code: "PHP", website_url: null, phone_number: null, validation_status: "review", validation_errors: [], normalized_name: "test historical", dedupe_key: "foursquare_os:historic-fixture",
  }]);
  assert.match(sql, /'legacy',null,'PH'/u);
});
