import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProductionEligibility } from "../src/eligibility/production-eligibility.js";

test("production eligibility treats staging-quality states deterministically", () => {
  assert.deepEqual(evaluateProductionEligibility({
    sourceClosedAt: null,
    sourceQualityFlags: [],
  }), { status: "eligible", reasons: [] });

  assert.deepEqual(evaluateProductionEligibility({
    sourceClosedAt: null,
    sourceQualityFlags: [" DUPLICATE "],
  }), { status: "review", reasons: ["source_flagged_duplicate"] });

  assert.deepEqual(evaluateProductionEligibility({
    sourceClosedAt: null,
    sourceQualityFlags: ["closed", "duplicate"],
  }), { status: "excluded", reasons: ["source_flagged_closed", "source_flagged_duplicate"] });

  assert.deepEqual(evaluateProductionEligibility({
    sourceClosedAt: null,
    sourceQualityFlags: ["privatevenue"],
  }), { status: "excluded", reasons: ["source_flagged_privatevenue"] });

  assert.deepEqual(evaluateProductionEligibility({
    sourceClosedAt: null,
    sourceQualityFlags: ["future_source_flag"],
  }), { status: "review", reasons: ["source_has_unresolved_quality_flag"] });

  assert.deepEqual(evaluateProductionEligibility({
    sourceClosedAt: "2026-08-01T00:00:00.000Z",
    sourceQualityFlags: [],
  }), { status: "excluded", reasons: ["source_marked_closed"] });
});
