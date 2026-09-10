import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateFoursquarePlaceTaxonomy,
  type FoursquareCategoryClassification,
} from "../../../data/category-mappings/foursquare.js";

function category(
  categoryId: string,
  decision: "include" | "exclude" | "review",
  exploreWiseCategoryCode: string | null = decision === "include" ? "activity.recreation" : null,
): FoursquareCategoryClassification {
  return {
    categoryId,
    categoryLabel: categoryId,
    known: true,
    decision,
    exploreWiseCategoryCode,
    precedence: decision === "include" ? 10 : 1000,
    matchedRuleCategoryId: categoryId,
  };
}

function decision(name: string, categories: readonly FoursquareCategoryClassification[]) {
  return evaluateFoursquarePlaceTaxonomy({ name, categories });
}

test("Tierra Santa's Arcade-only source taxonomy is held by the memorial-park guard", () => {
  const result = decision("Tierra Santa Memorial Park", [category("Arcade", "include")]);
  assert.equal(result.decision, "review");
  assert.equal(result.reason, "contextual_name_guard");
  assert.deepEqual(result.evidence.contextualNameGuards, ["memorial_park_name"]);
});

test("include plus non-discovery categories is always review", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["Arcade", "Bank"],
    ["Gaming Cafe", "Repair Shop"],
    ["Park", "Government Office"],
    ["Historic Monument", "Cemetery"],
    ["Museum", "University"],
  ];
  for (const [included, excluded] of cases) {
    const result = decision(`${included} and ${excluded}`, [category(included, "include"), category(excluded, "exclude", null)]);
    assert.equal(result.decision, "review", `${included} + ${excluded}`);
    assert.equal(result.reason, "included_and_excluded_category_mix");
  }
});

test("a clearly excluded cemetery alone is excluded", () => {
  const result = decision("Public Cemetery", [category("Cemetery", "exclude", null)]);
  assert.equal(result.decision, "exclude");
  assert.equal(result.reason, "all_categories_explicitly_excluded");
});

test("unknown Foursquare IDs and review-category mixtures are held for review", () => {
  const unknown = {
    ...category("new-foursquare-id", "review", null),
    known: false,
    precedence: null,
    matchedRuleCategoryId: null,
  };
  assert.equal(decision("Future category", [unknown]).decision, "review");
  assert.equal(decision("Arcade at venue", [category("Arcade", "include"), category("Unresolved venue", "review", null)]).reason, "ambiguous_mixed_category");
});

test("legitimate Arcade and public Park remain included", () => {
  assert.equal(decision("Legitimate Arcade", [category("Arcade", "include")]).decision, "include");
  assert.equal(decision("Legitimate Public Park", [category("Park", "include", "outdoor.park")]).decision, "include");
});
