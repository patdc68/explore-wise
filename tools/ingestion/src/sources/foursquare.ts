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
  [field: string]: unknown;
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
    Object.entries(row).filter(([, value]) => value !== undefined),
  );
}

export function transformFoursquarePlace(
  row: FoursquarePlaceRow,
  region: RegionConfig,
): RawSourcePlace {
  return {
    sourcePlaceId: row.fsq_place_id,
    name: row.name,
    categorySourceCode: firstString(row.fsq_category_ids),
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

