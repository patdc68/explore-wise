import type { CategoryMappingResult } from "./types.js";

export type FoursquareIngestionDecision = "include" | "exclude" | "review";

export interface FoursquareCategoryRule {
  categoryId: string;
  categoryLabel: string;
  decision: FoursquareIngestionDecision;
  exploreWiseCategoryCode: string | null;
  precedence: number;
  matchDescendants: boolean;
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

  { categoryId: "4d4b7105d754a06373d81259", categoryLabel: "Event", decision: "review", exploreWiseCategoryCode: null, precedence: 2000, matchDescendants: true },
  { categoryId: "4d4b7104d754a06370d81259", categoryLabel: "Arts and Entertainment", decision: "review", exploreWiseCategoryCode: null, precedence: 2001, matchDescendants: true },
  { categoryId: "63be6904847c3692a84b9bb5", categoryLabel: "Dining and Drinking", decision: "review", exploreWiseCategoryCode: null, precedence: 2002, matchDescendants: true },
  { categoryId: "4d4b7105d754a06377d81259", categoryLabel: "Landmarks and Outdoors", decision: "review", exploreWiseCategoryCode: null, precedence: 2003, matchDescendants: true },
  { categoryId: "4f4528bc4b90abdf24c9de85", categoryLabel: "Sports and Recreation", decision: "review", exploreWiseCategoryCode: null, precedence: 2004, matchDescendants: true },
]);

export const foursquareIncludeCategoryRules = Object.freeze(
  foursquareCategoryRules.filter((rule) => rule.decision === "include"),
);

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
