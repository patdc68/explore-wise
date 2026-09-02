import type { FoursquareTaxonomyNode } from "../../../../data/category-mappings/foursquare.js";

export const FOURSQUARE_REMEDIATION_RULE_VERSION = "foursquare-remediation-v1.0.0";

const BAR = "4bf58dd8d48988d116941735";
const FOOD_RETAIL = "4bf58dd8d48988d1f9941735";
const FOOD_SERVICE = "56aa371be4b08b9a8d573550";
const ARTS_AND_ENTERTAINMENT = "4d4b7104d754a06370d81259";
const SPORTS_AND_RECREATION = "4f4528bc4b90abdf24c9de85";
const EDUCATION = "4bf58dd8d48988d13b941735";
const GOVERNMENT_BUILDING = "4bf58dd8d48988d126941735";
const CEMETERY = "4bf58dd8d48988d15c941735";
const BANK = "4bf58dd8d48988d10a951735";
const LANDMARKS_AND_OUTDOORS = "4d4b7105d754a06377d81259";
const OTHER_GREAT_OUTDOORS = "4bf58dd8d48988d162941735";

export interface RemediationCategoryEvidence {
  categoryId: string;
  decision: "include" | "exclude" | "review";
  exploreWiseCategoryCode: string | null;
}

export interface ReviewAuditRow {
  placeId: string;
  source: "foursquare_os";
  sourcePlaceId: string;
  name: string;
  foursquareCategoryIds: readonly string[];
  evidence: { categories: readonly RemediationCategoryEvidence[]; contextualNameGuards: readonly string[] };
}

export type RemediationDisposition = "keep" | "hide" | "manual_review";

export type RemediationReason =
  | "compatible_food_dining"
  | "compatible_food_bar"
  | "compatible_food_retail"
  | "compatible_food_service"
  | "compatible_gaming_cafe"
  | "compatible_park_sport"
  | "compatible_cemetery_outdoor_attraction"
  | "compatible_heritage_government"
  | "cemetery_memorial_park"
  | "bank_misclassified_as_recreation"
  | "no_high_confidence_rule";

export interface RemediationDecision {
  disposition: RemediationDisposition;
  reason: RemediationReason;
  ruleVersion: typeof FOURSQUARE_REMEDIATION_RULE_VERSION;
}

function ancestry(categoryId: string, taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>): readonly string[] {
  const node = taxonomy.get(categoryId);
  return node === undefined ? [] : [
    node.category_id,
    node.level1_category_id,
    node.level2_category_id,
    node.level3_category_id,
    node.level4_category_id,
    node.level5_category_id,
    node.level6_category_id,
  ].filter((id): id is string => id !== null);
}

function hasDescendant(
  categoryId: string,
  ancestorId: string,
  taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>,
): boolean {
  return ancestry(categoryId, taxonomy).includes(ancestorId);
}

function hasCategory(
  row: ReviewAuditRow,
  ancestorId: string,
  taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>,
): boolean {
  return row.foursquareCategoryIds.some((categoryId) => hasDescendant(categoryId, ancestorId, taxonomy));
}

function hasIncludeCode(row: ReviewAuditRow, predicate: (code: string) => boolean): boolean {
  return row.evidence.categories.some((category) => (
    category.decision === "include"
    && category.exploreWiseCategoryCode !== null
    && predicate(category.exploreWiseCategoryCode)
  ));
}

function everySourceCategory(
  row: ReviewAuditRow,
  predicate: (categoryId: string) => boolean,
): boolean {
  return row.foursquareCategoryIds.length > 0 && row.foursquareCategoryIds.every(predicate);
}

function isFoodInclude(category: RemediationCategoryEvidence): boolean {
  return category.decision === "include" && category.exploreWiseCategoryCode?.startsWith("food") === true;
}

function hasContextGuard(row: ReviewAuditRow): boolean {
  return row.evidence.contextualNameGuards.length > 0;
}

function compatibleFoodCategory(
  categoryId: string,
  row: ReviewAuditRow,
  taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>,
): boolean {
  const evidence = row.evidence.categories.find((category) => category.categoryId === categoryId);
  return (evidence !== undefined && isFoodInclude(evidence))
    || hasDescendant(categoryId, BAR, taxonomy)
    || hasDescendant(categoryId, FOOD_RETAIL, taxonomy)
    || hasDescendant(categoryId, FOOD_SERVICE, taxonomy)
    || evidence?.decision === "review";
}

function keep(reason: Exclude<RemediationReason, "cemetery_memorial_park" | "bank_misclassified_as_recreation">): RemediationDecision {
  return { disposition: "keep", reason, ruleVersion: FOURSQUARE_REMEDIATION_RULE_VERSION };
}

function hide(reason: Extract<RemediationReason, "cemetery_memorial_park" | "bank_misclassified_as_recreation">): RemediationDecision {
  return { disposition: "hide", reason, ruleVersion: FOURSQUARE_REMEDIATION_RULE_VERSION };
}

/**
 * A deliberately narrow, deterministic disposition layer over taxonomy-v2
 * REVIEWs. Stable source IDs and ancestry decide outcomes; names are used only
 * to strengthen the cemetery/memorial rule and never by themselves to hide.
 */
export function remediateFoursquareReview(
  row: ReviewAuditRow,
  taxonomy: ReadonlyMap<string, FoursquareTaxonomyNode>,
): RemediationDecision {
  const hasHeritageInclude = hasIncludeCode(row, (code) => (
    code === "attraction.museum" || code === "attraction.culture"
  ));
  const onlyParkOrGardenIncludes = row.evidence.categories
    .filter((category) => category.decision === "include")
    .every((category) => category.exploreWiseCategoryCode === "outdoor.park");
  const memorialParkName = /\bmemorial parks?\b/iu.test(row.name);

  if (
    hasCategory(row, CEMETERY, taxonomy)
    && memorialParkName
    && onlyParkOrGardenIncludes
    && !hasHeritageInclude
  ) return hide("cemetery_memorial_park");

  if (
    hasCategory(row, BANK, taxonomy)
    && hasIncludeCode(row, (code) => code === "activity.recreation")
    && row.evidence.categories.filter((category) => category.decision === "include")
      .every((category) => category.exploreWiseCategoryCode === "activity.recreation")
    && !hasContextGuard(row)
  ) return hide("bank_misclassified_as_recreation");

  if (hasContextGuard(row)) {
    return { disposition: "manual_review", reason: "no_high_confidence_rule", ruleVersion: FOURSQUARE_REMEDIATION_RULE_VERSION };
  }

  // The three-way Foursquare pattern Cemetery + Park + Other Great Outdoors is
  // a public outdoor attraction classification, not a cemetery-only signal.
  // It intentionally requires all three stable category IDs/ancestry branches
  // and no contextual guard; ordinary cemetery parks remain excluded or manual.
  const cemeteryOutdoorAttraction = hasCategory(row, CEMETERY, taxonomy)
    && hasCategory(row, OTHER_GREAT_OUTDOORS, taxonomy)
    && hasIncludeCode(row, (code) => code === "outdoor.park")
    && everySourceCategory(row, (id) => (
      hasDescendant(id, CEMETERY, taxonomy)
      || hasDescendant(id, LANDMARKS_AND_OUTDOORS, taxonomy)
    ));
  if (cemeteryOutdoorAttraction) return keep("compatible_cemetery_outdoor_attraction");

  const hasFood = row.evidence.categories.some(isFoodInclude);
  if (hasFood && everySourceCategory(row, (id) => compatibleFoodCategory(id, row, taxonomy))) {
    if (hasCategory(row, BAR, taxonomy)) return keep("compatible_food_bar");
    if (hasCategory(row, FOOD_RETAIL, taxonomy)) return keep("compatible_food_retail");
    if (hasCategory(row, FOOD_SERVICE, taxonomy)) return keep("compatible_food_service");
    return keep("compatible_food_dining");
  }

  const gamingCafe = hasIncludeCode(row, (code) => code === "activity.recreation")
    && everySourceCategory(row, (id) => hasDescendant(id, ARTS_AND_ENTERTAINMENT, taxonomy));
  if (gamingCafe) return keep("compatible_gaming_cafe");

  const parkSport = hasIncludeCode(row, (code) => code === "outdoor.park")
    && everySourceCategory(row, (id) => (
      hasDescendant(id, SPORTS_AND_RECREATION, taxonomy)
      || hasDescendant(id, "4bf58dd8d48988d163941735", taxonomy)
    ));
  if (parkSport) return keep("compatible_park_sport");

  const heritageGovernment = hasHeritageInclude
    && everySourceCategory(row, (id) => (
      hasDescendant(id, EDUCATION, taxonomy)
      || hasDescendant(id, GOVERNMENT_BUILDING, taxonomy)
      || row.evidence.categories.some((category) => category.categoryId === id && category.decision === "include")
    ));
  if (heritageGovernment) return keep("compatible_heritage_government");

  return { disposition: "manual_review", reason: "no_high_confidence_rule", ruleVersion: FOURSQUARE_REMEDIATION_RULE_VERSION };
}
