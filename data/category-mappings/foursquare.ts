import type { CategoryMappingResult } from "./types.js";

export type FoursquareIngestionDecision = "include" | "exclude" | "review";

/**
 * Bump this whenever the deterministic per-place decision policy changes. It is
 * written to audit artifacts and durable decisions so historical outcomes stay
 * explainable after later taxonomy work.
 */
export const FOURSQUARE_TAXONOMY_RULE_VERSION = "foursquare-taxonomy-v2.0.0";

export interface FoursquareCategoryRule {
  categoryId: string;
  categoryLabel: string;
  decision: FoursquareIngestionDecision;
  exploreWiseCategoryCode: string | null;
  precedence: number;
  matchDescendants: boolean;
}

export interface FoursquareCategoryClassification {
  categoryId: string;
  categoryLabel: string | null;
  /** False only when Foursquare did not return this ID in its published taxonomy. */
  known: boolean;
  decision: FoursquareIngestionDecision;
  exploreWiseCategoryCode: string | null;
  precedence: number | null;
  matchedRuleCategoryId: string | null;
}

export interface FoursquareTaxonomyNode {
  category_id: string;
  category_label: string;
  level1_category_id: string | null;
  level2_category_id: string | null;
  level3_category_id: string | null;
  level4_category_id: string | null;
  level5_category_id: string | null;
  level6_category_id: string | null;
}

export type FoursquarePlaceTaxonomyDecision = "include" | "exclude" | "review";

export type FoursquarePlaceTaxonomyReason =
  | "all_categories_included"
  | "all_categories_explicitly_excluded"
  | "included_and_excluded_category_mix"
  | "unknown_source_category"
  | "taxonomy_requires_review"
  | "ambiguous_mixed_category"
  | "no_source_categories"
  | "contextual_name_guard";

export interface FoursquarePlaceTaxonomyResult {
  decision: FoursquarePlaceTaxonomyDecision;
  reason: FoursquarePlaceTaxonomyReason;
  ruleVersion: typeof FOURSQUARE_TAXONOMY_RULE_VERSION;
  /** The mapped include selected only after the full-place decision is INCLUDE. */
  selectedCategory: FoursquareCategoryClassification | null;
  evidence: {
    categories: readonly FoursquareCategoryClassification[];
    contextualNameGuards: readonly string[];
  };
}

// Verified against the live 1,279-row places.datasets.categories_os taxonomy on
// 2026-09-01. IDs and ancestry drive classification; labels are documentation.
// Lower precedence wins when a place has multiple included categories.
export const foursquareCategoryRules: readonly FoursquareCategoryRule[] = Object.freeze([
  { categoryId: "4d4b7105d754a06374d81259", categoryLabel: "Dining and Drinking > Restaurant", decision: "include", exploreWiseCategoryCode: "food.restaurant", precedence: 10, matchDescendants: true },
  { categoryId: "63be6904847c3692a84b9bb6", categoryLabel: "Dining and Drinking > Cafe, Coffee, and Tea House", decision: "include", exploreWiseCategoryCode: "food.cafe", precedence: 20, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d16a941735", categoryLabel: "Dining and Drinking > Bakery", decision: "include", exploreWiseCategoryCode: "food.bakery", precedence: 30, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d1d0941735", categoryLabel: "Dining and Drinking > Dessert Shop", decision: "include", exploreWiseCategoryCode: "food.dessert", precedence: 40, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d120951735", categoryLabel: "Dining and Drinking > Food Court", decision: "include", exploreWiseCategoryCode: "food", precedence: 50, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d128941735", categoryLabel: "Dining and Drinking > Cafeteria", decision: "include", exploreWiseCategoryCode: "food", precedence: 60, matchDescendants: true },

  { categoryId: "4bf58dd8d48988d1e1931735", categoryLabel: "Arts and Entertainment > Arcade", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 70, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d1e4931735", categoryLabel: "Arts and Entertainment > Bowling Alley", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 71, matchDescendants: true },
  { categoryId: "5f2c2834b6d05514c704451e", categoryLabel: "Arts and Entertainment > Escape Room", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 72, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d18d941735", categoryLabel: "Arts and Entertainment > Gaming Cafe", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 73, matchDescendants: true },
  { categoryId: "5744ccdfe4b0c0459246b4bb", categoryLabel: "Arts and Entertainment > Karaoke Box", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 74, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d1e3931735", categoryLabel: "Arts and Entertainment > Pool Hall", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 75, matchDescendants: true },
  { categoryId: "52e81612bcbc57f1066b7a26", categoryLabel: "Sports and Recreation > Recreation Center", decision: "include", exploreWiseCategoryCode: "activity.recreation", precedence: 76, matchDescendants: true },

  { categoryId: "4bf58dd8d48988d17f941735", categoryLabel: "Arts and Entertainment > Movie Theater", decision: "include", exploreWiseCategoryCode: "entertainment.cinema", precedence: 80, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d1f2931735", categoryLabel: "Arts and Entertainment > Performing Arts Venue", decision: "include", exploreWiseCategoryCode: "entertainment", precedence: 90, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d182941735", categoryLabel: "Arts and Entertainment > Amusement Park", decision: "include", exploreWiseCategoryCode: "entertainment", precedence: 91, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d193941735", categoryLabel: "Arts and Entertainment > Water Park", decision: "include", exploreWiseCategoryCode: "entertainment", precedence: 92, matchDescendants: true },

  { categoryId: "4bf58dd8d48988d181941735", categoryLabel: "Arts and Entertainment > Museum", decision: "include", exploreWiseCategoryCode: "attraction.museum", precedence: 100, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d1e2931735", categoryLabel: "Arts and Entertainment > Art Gallery", decision: "include", exploreWiseCategoryCode: "attraction.culture", precedence: 110, matchDescendants: true },
  { categoryId: "4deefb944765f83613cdba6e", categoryLabel: "Landmarks and Outdoors > Historic and Protected Site", decision: "include", exploreWiseCategoryCode: "attraction.culture", precedence: 111, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d12d941735", categoryLabel: "Landmarks and Outdoors > Monument", decision: "include", exploreWiseCategoryCode: "attraction.culture", precedence: 112, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d166941735", categoryLabel: "Landmarks and Outdoors > Sculpture Garden", decision: "include", exploreWiseCategoryCode: "attraction.culture", precedence: 113, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d17b941735", categoryLabel: "Arts and Entertainment > Zoo", decision: "include", exploreWiseCategoryCode: "attraction", precedence: 120, matchDescendants: true },
  { categoryId: "4fceea171983d5d06c3e9823", categoryLabel: "Arts and Entertainment > Aquarium", decision: "include", exploreWiseCategoryCode: "attraction", precedence: 121, matchDescendants: true },

  { categoryId: "4bf58dd8d48988d163941735", categoryLabel: "Landmarks and Outdoors > Park", decision: "include", exploreWiseCategoryCode: "outdoor.park", precedence: 130, matchDescendants: true },
  { categoryId: "52e81612bcbc57f1066b7a22", categoryLabel: "Landmarks and Outdoors > Botanical Garden", decision: "include", exploreWiseCategoryCode: "outdoor.park", precedence: 131, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d15a941735", categoryLabel: "Landmarks and Outdoors > Garden", decision: "include", exploreWiseCategoryCode: "outdoor.park", precedence: 132, matchDescendants: true },
  { categoryId: "52e81612bcbc57f1066b7a13", categoryLabel: "Landmarks and Outdoors > Nature Preserve", decision: "include", exploreWiseCategoryCode: "outdoor", precedence: 140, matchDescendants: true },
  { categoryId: "69d41dd556ec6a4ded8e825a", categoryLabel: "Landmarks and Outdoors > Nature Trail", decision: "include", exploreWiseCategoryCode: "outdoor", precedence: 141, matchDescendants: true },

  { categoryId: "4d4b7105d754a06375d81259", categoryLabel: "Business and Professional Services", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1000, matchDescendants: true },
  { categoryId: "63be6904847c3692a84b9bb9", categoryLabel: "Health and Medicine", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1001, matchDescendants: true },
  { categoryId: "4d4b7105d754a06378d81259", categoryLabel: "Retail", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1002, matchDescendants: true },
  { categoryId: "63be6904847c3692a84b9b9a", categoryLabel: "Community and Government", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1003, matchDescendants: true },
  { categoryId: "4d4b7105d754a06379d81259", categoryLabel: "Travel and Transportation", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1004, matchDescendants: true },
  { categoryId: "4d4b7105d754a06376d81259", categoryLabel: "Nightlife Spot", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1005, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d116941735", categoryLabel: "Dining and Drinking > Bar", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1006, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d11f941735", categoryLabel: "Arts and Entertainment > Night Club", decision: "exclude", exploreWiseCategoryCode: null, precedence: 1007, matchDescendants: true },

  // Explicit non-discovery IDs make a single-category exclusion auditable.
  // Their parent branches remain exclusions too; these rules retain the precise
  // signal in evidence when a place is a cemetery, funeral, bank, office,
  // medical, residential, utility, or industrial site.
  { categoryId: "4bf58dd8d48988d15c941735", categoryLabel: "Community and Government > Cemetery", decision: "exclude", exploreWiseCategoryCode: null, precedence: 900, matchDescendants: true },
  { categoryId: "4f4534884b9074f6e4fb0174", categoryLabel: "Business and Professional Services > Funeral Home", decision: "exclude", exploreWiseCategoryCode: null, precedence: 901, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d10a951735", categoryLabel: "Business and Professional Services > Financial Service > Banking and Finance > Bank", decision: "exclude", exploreWiseCategoryCode: null, precedence: 902, matchDescendants: true },
  { categoryId: "52f2ab2ebcbc57f1066b8b44", categoryLabel: "Business and Professional Services > Automotive Service > Automotive Repair Shop", decision: "exclude", exploreWiseCategoryCode: null, precedence: 903, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d124941735", categoryLabel: "Business and Professional Services > Office", decision: "exclude", exploreWiseCategoryCode: null, precedence: 904, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d104941735", categoryLabel: "Health and Medicine > Medical Center", decision: "exclude", exploreWiseCategoryCode: null, precedence: 905, matchDescendants: true },
  { categoryId: "4bf58dd8d48988d196941735", categoryLabel: "Health and Medicine > Hospital", decision: "exclude", exploreWiseCategoryCode: null, precedence: 906, matchDescendants: true },
  { categoryId: "4e67e38e036454776db1fb3a", categoryLabel: "Residence > Residential Building", decision: "exclude", exploreWiseCategoryCode: null, precedence: 907, matchDescendants: true },
  { categoryId: "63be6904847c3692a84b9bb4", categoryLabel: "Business and Professional Services > Utility Company", decision: "exclude", exploreWiseCategoryCode: null, precedence: 908, matchDescendants: true },
  { categoryId: "56aa371be4b08b9a8d5734d7", categoryLabel: "Business and Professional Services > Industrial Estate", decision: "exclude", exploreWiseCategoryCode: null, precedence: 909, matchDescendants: true },

  { categoryId: "4d4b7105d754a06373d81259", categoryLabel: "Event", decision: "review", exploreWiseCategoryCode: null, precedence: 2000, matchDescendants: true },
  { categoryId: "4d4b7104d754a06370d81259", categoryLabel: "Arts and Entertainment", decision: "review", exploreWiseCategoryCode: null, precedence: 2001, matchDescendants: true },
  { categoryId: "63be6904847c3692a84b9bb5", categoryLabel: "Dining and Drinking", decision: "review", exploreWiseCategoryCode: null, precedence: 2002, matchDescendants: true },
  { categoryId: "4d4b7105d754a06377d81259", categoryLabel: "Landmarks and Outdoors", decision: "review", exploreWiseCategoryCode: null, precedence: 2003, matchDescendants: true },
  { categoryId: "4f4528bc4b90abdf24c9de85", categoryLabel: "Sports and Recreation", decision: "review", exploreWiseCategoryCode: null, precedence: 2004, matchDescendants: true },
]);

export const foursquareIncludeCategoryRules = Object.freeze(
  foursquareCategoryRules.filter((rule) => rule.decision === "include"),
);

/** Classifies an ID using only its stable Foursquare ID and published ancestry. */
export function classifyFoursquareTaxonomyCategory(
  categoryId: string,
  taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>,
): FoursquareCategoryClassification {
  const node = taxonomy.get(categoryId);
  if (!node) {
    return {
      categoryId,
      categoryLabel: null,
      known: false,
      decision: "review",
      exploreWiseCategoryCode: null,
      precedence: null,
      matchedRuleCategoryId: null,
    };
  }
  const ancestry = new Set([
    node.category_id,
    node.level1_category_id,
    node.level2_category_id,
    node.level3_category_id,
    node.level4_category_id,
    node.level5_category_id,
    node.level6_category_id,
  ].filter((value): value is string => value !== null));
  const matched = foursquareCategoryRules
    .filter((rule) => rule.categoryId === categoryId || (rule.matchDescendants && ancestry.has(rule.categoryId)))
    .sort((left, right) => left.precedence - right.precedence || left.categoryId.localeCompare(right.categoryId))[0];
  return {
    categoryId,
    categoryLabel: node.category_label,
    known: true,
    decision: matched?.decision ?? "review",
    exploreWiseCategoryCode: matched?.exploreWiseCategoryCode ?? null,
    precedence: matched?.precedence ?? null,
    matchedRuleCategoryId: matched?.categoryId ?? null,
  };
}

function contextualNameGuards(name: string | null | undefined): readonly string[] {
  const normalized = name?.trim().toLocaleLowerCase("und") ?? "";
  if (!normalized) return [];
  const guards: string[] = [];
  if (/\bmemorial parks?\b/u.test(normalized)) guards.push("memorial_park_name");
  if (/^office of\b/u.test(normalized)) guards.push("office_of_name");
  return guards;
}

/**
 * Resolves a place, never an individual category. The caller supplies source
 * taxonomy/ancestry classifications from Foursquare; labels are evidence only.
 * Contextual guards are deliberately review-only and cannot create EXCLUDE.
 */
export function evaluateFoursquarePlaceTaxonomy(input: {
  name?: string | null;
  categories: readonly FoursquareCategoryClassification[];
}): FoursquarePlaceTaxonomyResult {
  const categories = [...input.categories].sort((left, right) => (
    (left.precedence ?? Number.MAX_SAFE_INTEGER) - (right.precedence ?? Number.MAX_SAFE_INTEGER)
    || left.categoryId.localeCompare(right.categoryId)
  ));
  const guards = contextualNameGuards(input.name);
  const included = categories.filter((category) => category.decision === "include");
  const excluded = categories.filter((category) => category.decision === "exclude");
  const review = categories.filter((category) => category.decision === "review");
  const unknown = categories.filter((category) => !category.known);
  const selectedCategory = included[0] ?? null;

  let decision: FoursquarePlaceTaxonomyDecision;
  let reason: FoursquarePlaceTaxonomyReason;
  if (categories.length === 0) {
    decision = "review"; reason = "no_source_categories";
  } else if (unknown.length > 0) {
    decision = "review"; reason = "unknown_source_category";
  } else if (included.length > 0 && excluded.length > 0) {
    decision = "review"; reason = "included_and_excluded_category_mix";
  } else if (included.length > 0 && review.length > 0) {
    decision = "review"; reason = "ambiguous_mixed_category";
  } else if (included.length === categories.length) {
    decision = "include"; reason = "all_categories_included";
  } else if (included.length === 0 && excluded.length > 0 && review.length === 0) {
    decision = "exclude"; reason = "all_categories_explicitly_excluded";
  } else {
    decision = "review"; reason = "taxonomy_requires_review";
  }

  if (guards.length > 0) {
    decision = "review";
    reason = "contextual_name_guard";
  }
  return {
    decision,
    reason,
    ruleVersion: FOURSQUARE_TAXONOMY_RULE_VERSION,
    selectedCategory: decision === "include" ? selectedCategory : null,
    evidence: { categories, contextualNameGuards: guards },
  };
}

const verifiedDirectMappings: Readonly<Record<string, string>> = Object.freeze({
  "4d4b7105d754a06374d81259": "food.restaurant",
  "4bf58dd8d48988d16d941735": "food.cafe",
  "4bf58dd8d48988d1e0931735": "food.cafe",
});

export function resolveFoursquareCategory(
  sourceCategory: string,
  mappings?: Readonly<Record<string, string>>,
): CategoryMappingResult {
  const lookupKey = sourceCategory.trim().toLocaleLowerCase("und");
  const configuredCategory = mappings?.[lookupKey] ?? verifiedDirectMappings[lookupKey];
  if (configuredCategory) {
    return {
      status: "mapped",
      sourceCategory,
      exploreWiseCategoryCode: configuredCategory,
    };
  }
  const directRule = foursquareCategoryRules.find((rule) => (
    rule.categoryId === lookupKey && rule.decision === "include"
  ));

  if (directRule?.exploreWiseCategoryCode) {
    return {
      status: "mapped",
      sourceCategory,
      exploreWiseCategoryCode: directRule.exploreWiseCategoryCode,
    };
  }

  return {
    status: "review",
    sourceCategory,
    exploreWiseCategoryCode: null,
    reason: "unmapped_source_category",
  };
}
