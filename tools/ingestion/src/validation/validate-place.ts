import type { CategoryMappingResult } from "../../../../data/category-mappings/types.js";
import { createPrimarySourceIdentity } from "../normalization/identity.js";
import {
  isValidLatitude,
  isValidLongitude,
  normalizeCountryCode,
  normalizeCurrencyCode,
  toFiniteNumber,
} from "../normalization/location.js";
import { normalizeSourceUpdatedAt } from "../normalization/date.js";
import {
  normalizeName,
  normalizeOptionalText,
  preserveSourceId,
} from "../normalization/text.js";
import { normalizeUrl } from "../normalization/url.js";
import type {
  IngestionContext,
  NormalizedStagingPlace,
  RawSourcePlace,
  ValidationError,
} from "../types/index.js";
import { RunDuplicateTracker } from "./duplicate-tracker.js";

export type CategoryResolver = (sourceCategory: string) => CategoryMappingResult;

function error(
  code: ValidationError["code"],
  field: string,
  message: string,
  value?: unknown,
): ValidationError {
  return value === undefined ? { code, field, message } : { code, field, message, value };
}

export function normalizeAndValidatePlace(
  raw: RawSourcePlace,
  context: IngestionContext,
  categoryResolver: CategoryResolver,
  duplicateTracker: RunDuplicateTracker,
): NormalizedStagingPlace {
  const errors: ValidationError[] = [];
  const sourcePlaceId = preserveSourceId(raw.sourcePlaceId);
  const name = normalizeOptionalText(raw.name);
  const categorySourceCode = normalizeOptionalText(raw.categorySourceCode);
  const countryCode = normalizeCountryCode(raw.countryCode);
  const rawTimezone = normalizeOptionalText(raw.timezone);
  const timezone = rawTimezone ?? normalizeOptionalText(context.region.timezone);
  const rawCurrencyCode = normalizeCurrencyCode(raw.currencyCode);
  const currencyCode = raw.currencyCode === null || raw.currencyCode === undefined
    ? normalizeCurrencyCode(context.region.currency)
    : rawCurrencyCode;
  const latitude = toFiniteNumber(raw.latitude);
  const longitude = toFiniteNumber(raw.longitude);
  const websiteUrl = normalizeUrl(raw.websiteUrl);
  const sourceUpdatedAt = normalizeSourceUpdatedAt(raw.sourceUpdatedAt);

  if (!context.ingestionRunId) {
    errors.push(error("missing_ingestion_run", "ingestionRunId", "An ingestion run ID is required."));
  }
  if (!context.sourceId || !context.sourceCode) {
    errors.push(error("missing_source_linkage", "source", "Source ID and code are required."));
  } else if (!context.knownSourceCodes.has(context.sourceCode)) {
    errors.push(error("unknown_source", "sourceCode", "The source is not registered or active.", context.sourceCode));
  }
  if (sourcePlaceId === null) {
    errors.push(error("missing_source_place_id", "sourcePlaceId", "A non-blank source place ID is required."));
  }
  if (name === null) {
    errors.push(error("missing_name", "name", "A non-blank source name is required."));
  }
  if (!isValidLatitude(latitude)) {
    errors.push(error("invalid_latitude", "latitude", "Latitude must be between -90 and 90.", raw.latitude));
  }
  if (!isValidLongitude(longitude)) {
    errors.push(error("invalid_longitude", "longitude", "Longitude must be between -180 and 180.", raw.longitude));
  }
  if (countryCode === null) {
    errors.push(error("invalid_country_code", "countryCode", "Country code must be two ASCII letters.", raw.countryCode));
  }
  if (currencyCode === null) {
    errors.push(error("invalid_currency_code", "currencyCode", "Currency code must be three ASCII letters.", raw.currencyCode));
  }
  if (timezone === null) {
    errors.push(error("missing_timezone", "timezone", "A non-blank IANA timezone is required."));
  }
  if (raw.websiteUrl !== null && raw.websiteUrl !== undefined && websiteUrl === null) {
    errors.push(error("invalid_website_url", "websiteUrl", "Website URL must use HTTP or HTTPS.", raw.websiteUrl));
  }
  if (raw.sourceUpdatedAt !== null && raw.sourceUpdatedAt !== undefined && sourceUpdatedAt === null) {
    errors.push(error("invalid_source_updated_at", "sourceUpdatedAt", "Source update time must be a valid date.", raw.sourceUpdatedAt));
  }

  const dedupeKey = sourcePlaceId === null
    ? null
    : createPrimarySourceIdentity(context.sourceCode, sourcePlaceId);
  if (dedupeKey !== null && duplicateTracker.checkAndAdd(dedupeKey)) {
    errors.push(error("duplicate_in_run", "sourcePlaceId", "This source identity already appeared in the ingestion run.", sourcePlaceId));
  }

  const categoryMapping = categorySourceCode === null ? null : categoryResolver(categorySourceCode);
  if (categoryMapping === null || categoryMapping.status !== "mapped") {
    errors.push(error(
      "unmapped_source_category",
      "categorySourceCode",
      "The source category has no verified ExploreWise category mapping.",
      categorySourceCode,
    ));
  }

  const hasCategoryReview = errors.some((item) => item.code === "unmapped_source_category");
  const hasHardFailure = errors.some((item) => item.code !== "unmapped_source_category");
  const validationStatus = hasHardFailure || (hasCategoryReview && context.unknownCategoryPolicy === "reject")
    ? "invalid"
    : hasCategoryReview
      ? "review"
      : "valid";

  return {
    ingestionRunId: context.ingestionRunId,
    sourceId: context.sourceId,
    sourceCode: context.sourceCode,
    sourcePlaceId,
    sourcePayload: raw.sourcePayload ?? null,
    sourceUpdatedAt,
    name,
    categorySourceCode,
    categoryMapping,
    countryCode,
    region: normalizeOptionalText(raw.region),
    city: normalizeOptionalText(raw.city),
    district: normalizeOptionalText(raw.district),
    address: normalizeOptionalText(raw.address),
    latitude,
    longitude,
    timezone,
    currencyCode,
    websiteUrl,
    phoneNumber: normalizeOptionalText(raw.phoneNumber),
    normalizedName: name === null ? null : normalizeName(name),
    dedupeKey,
    validationStatus,
    validationErrors: errors,
  };
}
