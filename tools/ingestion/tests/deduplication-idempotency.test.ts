import assert from "node:assert/strict";
import test from "node:test";
import { decideIdempotency } from "../src/deduplication/idempotency.js";
import { classifyCrossSourceCandidate } from "../src/deduplication/cross-source-candidate.js";
import { hasSamePrimaryIdentity } from "../src/deduplication/primary-identity.js";
import { createPrimarySourceIdentity } from "../src/normalization/identity.js";
import { RunDuplicateTracker } from "../src/validation/duplicate-tracker.js";
import type { PlaceSnapshot } from "../src/types/index.js";

const snapshot: PlaceSnapshot = {
  sourceCode: "foursquare_os",
  sourcePlaceId: "abc:123",
  name: "TEST / FICTIONAL Cafe",
  categoryCode: "food.cafe",
  countryCode: "PH",
  region: "Metro Manila",
  city: "Test City",
  district: null,
  address: null,
  latitude: 14.5,
  longitude: 121,
  timezone: "Asia/Manila",
  currencyCode: "PHP",
  websiteUrl: null,
  phoneNumber: null,
  sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
};

test("primary identity is exactly source plus opaque source place ID", () => {
  assert.equal(createPrimarySourceIdentity("foursquare_os", "abc:123"), "foursquare_os:abc%3A123");
  assert.equal(hasSamePrimaryIdentity(snapshot, { ...snapshot }), true);
  assert.equal(hasSamePrimaryIdentity(snapshot, { ...snapshot, sourceCode: "openstreetmap" }), false);
  assert.equal(hasSamePrimaryIdentity(snapshot, { ...snapshot, sourcePlaceId: "ABC:123" }), false);
});

test("duplicate detection is scoped to one tracker/run", () => {
  const identity = createPrimarySourceIdentity("foursquare_os", "abc:123");
  const firstRun = new RunDuplicateTracker();
  const secondRun = new RunDuplicateTracker();

  assert.equal(firstRun.checkAndAdd(identity), false);
  assert.equal(firstRun.checkAndAdd(identity), true);
  assert.equal(secondRun.checkAndAdd(identity), false);
});

test("idempotency classifies insert, update, identical, and stale source records", () => {
  assert.deepEqual(decideIdempotency(undefined, snapshot), {
    action: "inserted",
    reason: "new_source_identity",
  });
  assert.deepEqual(decideIdempotency(snapshot, { ...snapshot }), {
    action: "unchanged",
    reason: "identical",
  });
  assert.deepEqual(decideIdempotency(snapshot, { ...snapshot, name: "TEST / FICTIONAL Renamed Cafe" }), {
    action: "updated",
    reason: "source_backed_fields_changed",
  });
  assert.deepEqual(decideIdempotency(snapshot, {
    ...snapshot,
    name: "TEST / FICTIONAL Stale Rename",
    sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
  }), {
    action: "unchanged",
    reason: "stale_source_record",
  });
});

test("cross-source proximity matches are review-only and never auto-merged", () => {
  const result = classifyCrossSourceCandidate(snapshot, {
    ...snapshot,
    sourceCode: "openstreetmap",
    sourcePlaceId: "other-identity",
    latitude: snapshot.latitude + 0.0001,
  });

  assert.equal(result.classification, "review");
  assert.equal(result.action, "manual_review");
});
