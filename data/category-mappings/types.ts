export type CategoryMappingStatus = "mapped" | "review";

export interface CategoryMappingResult {
  status: CategoryMappingStatus;
  sourceCategory: string;
  exploreWiseCategoryCode: string | null;
  reason?: "unmapped_source_category";
}

