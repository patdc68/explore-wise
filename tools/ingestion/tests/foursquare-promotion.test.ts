import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLoadProgress } from "../src/reporting/load-progress.js";
import { classifyPersistedPromotion, classifySourceUpdate, normalizePersistedFlags, PROMOTE_STAGED_PLACE_SQL } from "../src/promotion/foursquare-promotion.js";

const mapped = { validationStatus: "valid" as const, mappedCategoryCode: "food.cafe", categoryId: "category", categoryActive: true, unresolvedFlags: [], dateClosed: null };

test("promotion eligibility uses persisted category snapshots and excludes review, invalid, and unknown flags", () => {
  assert.equal(classifyPersistedPromotion(mapped), "eligible");
  assert.equal(classifyPersistedPromotion({ ...mapped, mappedCategoryCode: null }), "review");
  assert.equal(classifyPersistedPromotion({ ...mapped, validationStatus: "review" }), "review");
  assert.equal(classifyPersistedPromotion({ ...mapped, validationStatus: "invalid" }), "excluded");
  assert.equal(classifyPersistedPromotion({ ...mapped, unresolvedFlags: ["future_flag"] }), "review");
  assert.equal(classifyPersistedPromotion({ ...mapped, unresolvedFlags: ["privatevenue"] }), "excluded");
  assert.equal(classifyPersistedPromotion(mapped, "review"), "review");
  assert.equal(classifyPersistedPromotion(mapped, "excluded"), "excluded");
  assert.deepEqual(normalizePersistedFlags([" Duplicate ", "duplicate"]), ["duplicate"]);
});

test("promotion source identity updates only a non-stale source record", () => {
  assert.equal(classifySourceUpdate(null, "2026-01-01T00:00:00Z"), "insert");
  assert.equal(classifySourceUpdate("2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"), "stale");
  assert.equal(classifySourceUpdate("2026-02-01T00:00:00Z", null), "unchanged");
  assert.match(PROMOTE_STAGED_PLACE_SQL, /st_makepoint\(\$10, \$11\)/u);
  assert.match(PROMOTE_STAGED_PLACE_SQL, /on conflict \(source, source_place_id\)/u);
  assert.match(PROMOTE_STAGED_PLACE_SQL, /ew_place_discovery_decisions/u);
  assert.match(PROMOTE_STAGED_PLACE_SQL, /decision in \('review', 'excluded'\)/u);
  assert.match(PROMOTE_STAGED_PLACE_SQL, /decision\.source = \$1/u);
  assert.match(PROMOTE_STAGED_PLACE_SQL, /decision\.source_place_id = \$2/u);
});

test("load reporting distinguishes an already-completed batch from this invocation's writes", () => {
  assert.deepEqual(summarizeLoadProgress([1, 2, 49], [1, 2]), { completed: [1, 2, 49], appliedThisInvocation: [1, 2], alreadyCompleted: [49] });
});
