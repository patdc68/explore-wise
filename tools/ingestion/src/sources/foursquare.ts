import type { CategoryMappingResult } from "../../../../data/category-mappings/types.js";
import type { RawSourcePlace, RegionConfig } from "../types/index.js";
import type { PlaceSourceAdapter, SourceReadOptions } from "./types.js";

export interface FoursquarePlaceRow {
  fsq_place_id?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  address?: unknown;
  locality?: unknown;
  region?: unknown;
  postcode?: unknown;
  admin_region?: unknown;
  post_town?: unknown;
  po_box?: unknown;
  country?: unknown;
  date_created?: unknown;
  date_refreshed?: unknown;
  date_closed?: unknown;
  tel?: unknown;
  website?: unknown;
  email?: unknown;
  facebook_id?: unknown;
  instagram?: unknown;
  twitter?: unknown;
  fsq_category_ids?: unknown;
  fsq_category_labels?: unknown;
  placemaker_url?: unknown;
  unresolved_flags?: unknown;
  geom?: unknown;
  bbox?: unknown;
  __selected_category_id?: unknown;
  __selected_category_label?: unknown;
  __explorewise_category_code?: unknown;
  __mapping_rule_id?: unknown;
  __diversity_rank?: unknown;
  __category_classifications?: unknown;
  [field: string]: unknown;
}

export interface FoursquareSourceCategoryClassification {
  categoryId: string;
  categoryLabel: string | null;
  decision: "include" | "exclude" | "review";
  exploreWiseCategoryCode: string | null;
}

export interface FoursquareCatalogReader {
  readPlaces(region: RegionConfig, limit: number): Promise<readonly FoursquarePlaceRow[]>;
}

function firstString(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.find((item): item is string => typeof item === "string");
}

function serializableSourcePayload(row: FoursquarePlaceRow): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key, value]) => !key.startsWith("__") && value !== undefined),
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function categoryClassifications(value: unknown): readonly FoursquareSourceCategoryClassification[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is FoursquareSourceCategoryClassification => (
    typeof item === "object"
    && item !== null
    && typeof (item as { categoryId?: unknown }).categoryId === "string"
    && ["include", "exclude", "review"].includes(
      String((item as { decision?: unknown }).decision),
    )
  ));
}

export function transformFoursquarePlace(
  row: FoursquarePlaceRow,
  region: RegionConfig,
): RawSourcePlace {
  const selectedCategoryId = optionalString(row.__selected_category_id)
    ?? firstString(row.fsq_category_ids);
  const exploreWiseCategoryCode = optionalString(row.__explorewise_category_code);
  const categoryMappingHint: CategoryMappingResult | undefined = (
    selectedCategoryId && exploreWiseCategoryCode
  )
    ? {
        status: "mapped",
        sourceCategory: selectedCategoryId,
        exploreWiseCategoryCode,
      }
    : undefined;

  return {
    sourcePlaceId: row.fsq_place_id,
    name: row.name,
    categorySourceCode: selectedCategoryId,
    ...(categoryMappingHint ? { categoryMappingHint } : {}),
    sourceCategoryClassifications: categoryClassifications(row.__category_classifications),
    countryCode: row.country,
    region: row.region,
    city: row.locality,
    district: row.admin_region,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: region.timezone,
    currencyCode: region.currency,
    websiteUrl: row.website,
    phoneNumber: row.tel,
    sourceUpdatedAt: row.date_refreshed,
    sourceClosedAt: row.date_closed,
    sourceQualityFlags: row.unresolved_flags,
    sourcePayload: serializableSourcePayload(row),
  };
}

export class FoursquareOpenSourcePlacesAdapter implements PlaceSourceAdapter {
  readonly sourceCode = "foursquare_os";

  constructor(private readonly catalog: FoursquareCatalogReader) {}

  async read(options: SourceReadOptions): Promise<readonly RawSourcePlace[]> {
    const limit = options.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new RangeError("A live Foursquare sample limit must be between 1 and 50.");
    }

    const rows = await this.catalog.readPlaces(options.region, limit);
    return rows.slice(0, limit).map((row) => transformFoursquarePlace(row, options.region));
  }
}
