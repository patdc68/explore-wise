import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSIST_GOOGLE_MATCH_RESULT_SQL,
  googleMatchPersistenceParameters,
  parseGooglePlaceMatchArgs,
} from "../src/cli/google-place-match.js";
import type { GooglePlaceMatchResult } from "../src/google-places/types.js";

test("Google matching CLI defaults to a bounded resumable dry run", () => {
  assert.deepEqual(parseGooglePlaceMatchArgs([]), {
    dryRun: true,
    limit: 25,
    status: "not_checked",
    forceRefresh: false,
    concurrency: 3,
  });
});

test("Google matching CLI supports exact place, status, concurrency, and explicit refresh/write controls", () => {
  assert.deepEqual(parseGooglePlaceMatchArgs([
    "--write", "--limit", "1", "--place-id", "11111111-1111-4111-8111-111111111111",
    "--status", "needs_review", "--concurrency", "2", "--force-refresh",
  ]), {
    dryRun: false,
    limit: 1,
    placeId: "11111111-1111-4111-8111-111111111111",
    status: "needs_review",
    forceRefresh: true,
    concurrency: 2,
  });
});

test("Google matching CLI rejects unbounded or unknown input", () => {
  assert.throws(() => parseGooglePlaceMatchArgs(["--limit", "101"]), /1 to 100/u);
  assert.throws(() => parseGooglePlaceMatchArgs(["--status", "unknown"]), /must be one of/u);
  assert.throws(() => parseGooglePlaceMatchArgs(["--concurrency", "6"]), /1 to 5/u);
  assert.throws(() => parseGooglePlaceMatchArgs(["--unexpected"]), /Unknown option/u);
});

test("Google match persistence explicitly types reused Postgres parameters", () => {
  assert.match(PERSIST_GOOGLE_MATCH_RESULT_SQL, /\$3::text = 'matched'/u);
  assert.match(PERSIST_GOOGLE_MATCH_RESULT_SQL, /\$5::timestamptz/u);
  assert.match(PERSIST_GOOGLE_MATCH_RESULT_SQL, /where id = \$1::uuid/u);
});

test("Google match persistence records every terminal status and only retains matched Place IDs", () => {
  const checkedAt = "2026-09-14T09:00:00.000Z";
  const result: GooglePlaceMatchResult = {
    ewPlaceId: "11111111-1111-4111-8111-111111111111",
    bestGooglePlaceId: "google-place-1",
    status: "matched",
    confidence: 0.95,
    candidateCount: 1,
    nameSimilarity: 1,
    coordinateDistanceMeters: 1,
    localitySupport: 1,
    categorySupport: 1,
    ambiguityReason: null,
    reason: "test",
    algorithmVersion: "google-text-v1.1.0",
    apiCallCount: 1,
    candidates: [],
  };

  for (const status of ["matched", "needs_review", "ambiguous", "unmatched", "error"] as const) {
    const parameters = googleMatchPersistenceParameters({ ...result, status }, checkedAt);
    assert.equal(parameters[1], status === "matched" ? "google-place-1" : null);
    assert.equal(parameters[2], status);
    assert.equal(parameters[3], 0.95);
    assert.equal(parameters[4], checkedAt);
    assert.equal(parameters[5], "google-text-v1.1.0");
  }
});
