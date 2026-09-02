import type { CategoryMappingResult } from "../../../../data/category-mappings/types.js";
import type {
  FoursquareCategoryClassification,
  FoursquarePlaceTaxonomyResult,
} from "../../../../data/category-mappings/foursquare.js";

export interface RegionConfig {
  regionCode: string;
  countryCode: string;
  displayName: string;
  timezone: string;
  currency: string;
  geographicBounds?: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
    provenance: string;
  };
}

export interface RawSourcePlace {
  sourcePlaceId?: unknown;
  name?: unknown;
  categorySourceCode?: unknown;
  categoryMappingHint?: CategoryMappingResult;
  sourceCategoryClassifications?: readonly FoursquareCategoryClassification[];
  sourceTaxonomyDecision?: FoursquarePlaceTaxonomyResult;
  countryCode?: unknown;
  region?: unknown;
  city?: unknown;
  district?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
  currencyCode?: unknown;
  websiteUrl?: unknown;
  phoneNumber?: unknown;
  sourceUpdatedAt?: unknown;
  sourceClosedAt?: unknown;
  sourceQualityFlags?: unknown;
  sourcePayload?: unknown;
}

export interface IngestionContext {
  ingestionRunId: string;
  sourceId: string;
  sourceCode: string;
  knownSourceCodes: ReadonlySet<string>;
  region: RegionConfig;
  unknownCategoryPolicy: "reject" | "review";
}

export type ValidationErrorCode =
  | "missing_ingestion_run"
  | "missing_source_linkage"
  | "unknown_source"
  | "missing_source_place_id"
  | "missing_name"
  | "invalid_latitude"
  | "invalid_longitude"
  | "invalid_country_code"
  | "invalid_currency_code"
  | "missing_timezone"
  | "invalid_website_url"
  | "invalid_source_updated_at"
  | "invalid_source_closed_at"
  | "source_marked_closed"
  | "source_quality_review"
  | "source_taxonomy_review"
  | "duplicate_in_run"
  | "unmapped_source_category";

export interface ValidationError {
  code: ValidationErrorCode;
  field: string;
  message: string;
  value?: unknown;
}

export type StagingValidationStatus = "valid" | "invalid" | "review";

export interface NormalizedStagingPlace {
  ingestionRunId: string;
  sourceId: string;
  sourceCode: string;
  sourcePlaceId: string | null;
  sourcePayload: unknown | null;
  sourceUpdatedAt: string | null;
  sourceClosedAt: string | null;
  sourceQualityFlags: readonly string[];
  name: string | null;
  categorySourceCode: string | null;
  categoryMapping: CategoryMappingResult | null;
  sourceTaxonomyDecision: FoursquarePlaceTaxonomyResult | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  currencyCode: string | null;
  websiteUrl: string | null;
  phoneNumber: string | null;
  normalizedName: string | null;
  dedupeKey: string | null;
  validationStatus: StagingValidationStatus;
  validationErrors: ValidationError[];
}

export interface PlaceSnapshot {
  sourceCode: string;
  sourcePlaceId: string;
  name: string;
  categoryCode: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  currencyCode: string;
  websiteUrl: string | null;
  phoneNumber: string | null;
  sourceUpdatedAt: string | null;
}

export interface ProductionPlaceWrite extends PlaceSnapshot {
  status: "pending";
}

export type IdempotencyDecision =
  | { action: "inserted"; reason: "new_source_identity" }
  | { action: "updated"; reason: "source_backed_fields_changed" }
  | { action: "unchanged"; reason: "identical" | "stale_source_record" };

export interface IngestionSummary {
  dryRun: boolean;
  source: string;
  region: string;
  received: number;
  valid: number;
  review: number;
  rejected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  metadata: {
    staging_valid: number;
    staging_review: number;
    staging_rejected: number;
    staging_inserted: number;
  };
}
