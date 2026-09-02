import assert from "node:assert/strict";
import test from "node:test";
import type { FoursquareTaxonomyNode } from "../../../data/category-mappings/foursquare.js";
import {
  remediateFoursquareReview,
  type ReviewAuditRow,
} from "../src/remediation/foursquare-production-remediation.js";

function node(category_id: string, ancestors: readonly string[] = []): FoursquareTaxonomyNode {
  const values = [category_id, ...ancestors, null, null, null, null, null];
  return {
    category_id,
    category_label: category_id,
    level1_category_id: values[1] ?? null,
    level2_category_id: values[2] ?? null,
    level3_category_id: values[3] ?? null,
    level4_category_id: values[4] ?? null,
    level5_category_id: values[5] ?? null,
    level6_category_id: values[6] ?? null,
  };
}

const ids = {
  restaurant: "restaurant", cafe: "cafe", arcade: "arcade", park: "4bf58dd8d48988d163941735", museum: "museum",
  dining: "63be6904847c3692a84b9bb5", bar: "4bf58dd8d48988d116941735",
  retail: "4bf58dd8d48988d1f9941735", cemetery: "4bf58dd8d48988d15c941735",
  bank: "4bf58dd8d48988d10a951735", education: "4bf58dd8d48988d13b941735",
  government: "4bf58dd8d48988d126941735", arts: "4d4b7104d754a06370d81259",
  landmarks: "4d4b7105d754a06377d81259", otherOutdoors: "4bf58dd8d48988d162941735",
};
const taxonomy = new Map([
  node(ids.restaurant), node(ids.cafe), node(ids.arcade, [ids.arts]), node(ids.park, [ids.landmarks]), node(ids.museum),
  node(ids.dining), node(ids.bar), node(ids.retail), node(ids.cemetery), node(ids.bank), node(ids.education), node(ids.government), node(ids.arts),
  node(ids.landmarks), node(ids.otherOutdoors, [ids.landmarks]),
].map((value) => [value.category_id, value]));

function row(name: string, categories: readonly [string, "include" | "exclude" | "review", string | null][], guards: readonly string[] = []): ReviewAuditRow {
  return {
    placeId: name, source: "foursquare_os", sourcePlaceId: name, name,
    foursquareCategoryIds: categories.map(([id]) => id),
    evidence: {
      categories: categories.map(([categoryId, decision, exploreWiseCategoryCode]) => ({ categoryId, decision, exploreWiseCategoryCode })),
      contextualNameGuards: guards,
    },
  };
}

test("remediation keeps explicitly compatible food and heritage combinations", () => {
  assert.deepEqual(
    remediateFoursquareReview(row("Restaurant Bar", [[ids.restaurant, "include", "food.restaurant"], [ids.bar, "exclude", null]]), taxonomy),
    { disposition: "keep", reason: "compatible_food_bar", ruleVersion: "foursquare-remediation-v1.0.0" },
  );
  assert.equal(
    remediateFoursquareReview(row("Museum Campus", [[ids.museum, "include", "attraction.museum"], [ids.education, "exclude", null]]), taxonomy).reason,
    "compatible_heritage_government",
  );
});

test("remediation hides only strong cemetery/memorial and bank/recreation signals", () => {
  assert.equal(
    remediateFoursquareReview(row("True Memorial Park", [[ids.cemetery, "exclude", null], [ids.park, "include", "outdoor.park"]]), taxonomy).reason,
    "cemetery_memorial_park",
  );
  assert.equal(
    remediateFoursquareReview(row("Bank Arcade", [[ids.bank, "exclude", null], [ids.arcade, "include", "activity.recreation"]]), taxonomy).reason,
    "bank_misclassified_as_recreation",
  );
});

test("contextual guards and unapproved mixed classifications remain manual", () => {
  assert.equal(
    remediateFoursquareReview(row("Tierra Santa Memorial Park", [[ids.arcade, "include", "activity.recreation"]], ["memorial_park_name"]), taxonomy).disposition,
    "manual_review",
  );
  assert.equal(
    remediateFoursquareReview(row("Furniture Cafe", [[ids.cafe, "include", "food.cafe"], ["furniture", "exclude", null]]), taxonomy).disposition,
    "manual_review",
  );
});

test("remediation preserves the exact public cemetery outdoor-attraction pattern", () => {
  assert.deepEqual(
    remediateFoursquareReview(row("Paco Park", [
      [ids.park, "include", "outdoor.park"],
      [ids.cemetery, "exclude", null],
      [ids.otherOutdoors, "review", null],
    ]), taxonomy),
    { disposition: "keep", reason: "compatible_cemetery_outdoor_attraction", ruleVersion: "foursquare-remediation-v1.0.0" },
  );
});
