import type { CategoryMappingResult } from "./types.js";

// Intentionally empty for this foundation milestone. Add only verified Foursquare
// taxonomy identifiers or names, and map them to existing ew_categories.code values.
export const foursquareCategoryMappings: Readonly<Record<string, string>> = Object.freeze({});

export function resolveFoursquareCategory(
  sourceCategory: string,
  mappings: Readonly<Record<string, string>> = foursquareCategoryMappings,
): CategoryMappingResult {
  const lookupKey = sourceCategory.trim().toLocaleLowerCase("und");
  const exploreWiseCategoryCode = mappings[lookupKey];

  if (exploreWiseCategoryCode) {
    return {
      status: "mapped",
      sourceCategory,
      exploreWiseCategoryCode,
    };
  }

  return {
    status: "review",
    sourceCategory,
    exploreWiseCategoryCode: null,
    reason: "unmapped_source_category",
  };
}

