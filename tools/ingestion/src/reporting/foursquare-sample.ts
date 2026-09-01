import { resolveFoursquareCategory } from "../../../../data/category-mappings/foursquare.js";
import type {
  NormalizedStagingPlace,
  RawSourcePlace,
  RegionConfig,
} from "../types/index.js";
import type { FoursquarePlaceRow } from "../sources/foursquare.js";

interface CategoryReportRow {
  sourceCategoryId: string;
  sourceCategoryLabel: string | null;
  samplePlaces: number;
  proposedExploreWiseCategory: string | null;
  decision: "include" | "exclude" | "review";
}

interface FlagReportRow {
  flag: string;
  samplePlaces: number;
  exampleSourcePlaceIds: readonly string[];
}

export interface FoursquareSampleReport {
  sourceRowsExamined: number;
  rowsSelected: number;
  valid: number;
  review: number;
  rejected: number;
  closed: number;
  duplicateSourceIds: number;
  missingNames: number;
  missingCoordinates: number;
  invalidCoordinates: number;
  missingAddress: number;
  missingLocality: number;
  missingRegion: number;
  missingPostcode: number;
  missingPhone: number;
  missingWebsite: number;
  categoryCoverage: number;
  unmappedCategoryCount: number;
  multipleCategoryPlaces: number;
  sourceUpdatedAtCoverage: number;
  unresolvedFlagCoverage: number;
  normalizationChanges: {
    recordsWithSourceFieldChanges: number;
    normalizedComparisonKeysCreated: number;
    fields: Readonly<Record<string, number>>;
  };
  coordinates: {
    minLatitude: number | null;
    maxLatitude: number | null;
    minLongitude: number | null;
    maxLongitude: number | null;
    outlierSourcePlaceIds: readonly string[];
  };
  validationErrorCounts: Readonly<Record<string, number>>;
  categories: readonly CategoryReportRow[];
  exploreWiseCategoryDistribution: Readonly<Record<string, number>>;
  unresolvedFlags: readonly FlagReportRow[];
}

export interface FoursquareStagingDatabaseRow {
  ingestion_run_id: string;
  source_id: string;
  source_place_id: string | null;
  source_payload: unknown | null;
  source_updated_at: string | null;
  name: string | null;
  category_source_code: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  currency_code: string | null;
  website_url: string | null;
  phone_number: string | null;
  validation_status: NormalizedStagingPlace["validationStatus"];
  validation_errors: NormalizedStagingPlace["validationErrors"];
  normalized_name: string | null;
  dedupe_key: string | null;
}

function asPayload(record: RawSourcePlace): FoursquarePlaceRow {
  return record.sourcePayload !== null && typeof record.sourcePayload === "object"
    ? record.sourcePayload as FoursquarePlaceRow
    : {};
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim().length === 0);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function coordinateExtent(values: readonly number[]): { min: number | null; max: number | null } {
  return values.length === 0
    ? { min: null, max: null }
    : { min: Math.min(...values), max: Math.max(...values) };
}

export function buildFoursquareSampleReport(
  rawRecords: readonly RawSourcePlace[],
  stagingRecords: readonly NormalizedStagingPlace[],
  region: RegionConfig,
): FoursquareSampleReport {
  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();
  const categoryCounts = new Map<string, {
    id: string;
    label: string | null;
    count: number;
    decision: "include" | "exclude" | "review";
    exploreWiseCategoryCode: string | null;
  }>();
  const flagCounts = new Map<string, { count: number; examples: string[] }>();
  const validationErrorCounts = new Map<string, number>();
  const normalizationFieldCounts = new Map<string, number>();
  const latitudes: number[] = [];
  const longitudes: number[] = [];
  const outlierSourcePlaceIds: string[] = [];
  let recordsWithSourceFieldChanges = 0;

  for (let index = 0; index < stagingRecords.length; index += 1) {
    const raw = rawRecords[index] ?? {};
    const staged = stagingRecords[index];
    if (!staged) continue;
    const payload = asPayload(raw);
    const sourcePlaceId = staged.sourcePlaceId;

    if (sourcePlaceId !== null) {
      if (seenIds.has(sourcePlaceId)) duplicateIds.add(sourcePlaceId);
      seenIds.add(sourcePlaceId);
    }

    const ids = stringArray(payload.fsq_category_ids);
    const labels = stringArray(payload.fsq_category_labels);
    const classifications = raw.sourceCategoryClassifications ?? [];
    const seenCategoryPairs = new Set<string>();
    ids.forEach((id, categoryIndex) => {
      const label = labels[categoryIndex] ?? null;
      const key = `${id}\u0000${label ?? ""}`;
      if (seenCategoryPairs.has(key)) return;
      seenCategoryPairs.add(key);
      const existing = categoryCounts.get(key);
      const classification = classifications.find((item) => item.categoryId === id);
      const directMapping = resolveFoursquareCategory(id);
      categoryCounts.set(key, {
        id,
        label,
        count: (existing?.count ?? 0) + 1,
        decision: classification?.decision
          ?? (directMapping.status === "mapped" ? "include" : "review"),
        exploreWiseCategoryCode: classification?.exploreWiseCategoryCode
          ?? directMapping.exploreWiseCategoryCode,
      });
    });

    for (const flag of new Set(stringArray(payload.unresolved_flags))) {
      const existing = flagCounts.get(flag) ?? { count: 0, examples: [] };
      existing.count += 1;
      if (sourcePlaceId !== null && existing.examples.length < 3) existing.examples.push(sourcePlaceId);
      flagCounts.set(flag, existing);
    }

    for (const validationError of staged.validationErrors) {
      increment(validationErrorCounts, validationError.code);
    }

    const comparisons: ReadonlyArray<[string, unknown, unknown]> = [
      ["name", payload.name, staged.name],
      ["country", payload.country, staged.countryCode],
      ["region", payload.region, staged.region],
      ["locality", payload.locality, staged.city],
      ["admin_region", payload.admin_region, staged.district],
      ["address", payload.address, staged.address],
      ["website", payload.website, staged.websiteUrl],
      ["telephone", payload.tel, staged.phoneNumber],
      ["date_refreshed", payload.date_refreshed, staged.sourceUpdatedAt],
    ];
    let recordChanged = false;
    for (const [field, sourceValue, normalizedValue] of comparisons) {
      if (!isMissing(sourceValue) && sourceValue !== normalizedValue) {
        increment(normalizationFieldCounts, field);
        recordChanged = true;
      }
    }
    if (recordChanged) recordsWithSourceFieldChanges += 1;

    if (staged.latitude !== null) latitudes.push(staged.latitude);
    if (staged.longitude !== null) longitudes.push(staged.longitude);
    const bounds = region.geographicBounds;
    if (
      sourcePlaceId !== null
      && bounds
      && staged.latitude !== null
      && staged.longitude !== null
      && (
        staged.latitude < bounds.minLatitude
        || staged.latitude > bounds.maxLatitude
        || staged.longitude < bounds.minLongitude
        || staged.longitude > bounds.maxLongitude
      )
    ) {
      outlierSourcePlaceIds.push(sourcePlaceId);
    }
  }

  const latitudeExtent = coordinateExtent(latitudes);
  const longitudeExtent = coordinateExtent(longitudes);
  const payloads = rawRecords.map(asPayload);

  return {
    sourceRowsExamined: rawRecords.length,
    rowsSelected: stagingRecords.length,
    valid: stagingRecords.filter((record) => record.validationStatus === "valid").length,
    review: stagingRecords.filter((record) => record.validationStatus === "review").length,
    rejected: stagingRecords.filter((record) => record.validationStatus === "invalid").length,
    closed: stagingRecords.filter((record) => record.sourceClosedAt !== null).length,
    duplicateSourceIds: duplicateIds.size,
    missingNames: payloads.filter((payload) => isMissing(payload.name)).length,
    missingCoordinates: payloads.filter((payload) => isMissing(payload.latitude) || isMissing(payload.longitude)).length,
    invalidCoordinates: stagingRecords.filter((record) => record.validationErrors.some((item) => item.code === "invalid_latitude" || item.code === "invalid_longitude")).length,
    missingAddress: payloads.filter((payload) => isMissing(payload.address)).length,
    missingLocality: payloads.filter((payload) => isMissing(payload.locality)).length,
    missingRegion: payloads.filter((payload) => isMissing(payload.region)).length,
    missingPostcode: payloads.filter((payload) => isMissing(payload.postcode)).length,
    missingPhone: payloads.filter((payload) => isMissing(payload.tel)).length,
    missingWebsite: payloads.filter((payload) => isMissing(payload.website)).length,
    categoryCoverage: payloads.filter((payload) => stringArray(payload.fsq_category_ids).length > 0).length,
    unmappedCategoryCount: stagingRecords.filter((record) => record.categoryMapping?.status !== "mapped").length,
    multipleCategoryPlaces: payloads.filter((payload) => stringArray(payload.fsq_category_ids).length > 1).length,
    sourceUpdatedAtCoverage: stagingRecords.filter((record) => record.sourceUpdatedAt !== null).length,
    unresolvedFlagCoverage: payloads.filter((payload) => stringArray(payload.unresolved_flags).length > 0).length,
    normalizationChanges: {
      recordsWithSourceFieldChanges,
      normalizedComparisonKeysCreated: stagingRecords.filter((record) => record.normalizedName !== null).length,
      fields: Object.fromEntries([...normalizationFieldCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    },
    coordinates: {
      minLatitude: latitudeExtent.min,
      maxLatitude: latitudeExtent.max,
      minLongitude: longitudeExtent.min,
      maxLongitude: longitudeExtent.max,
      outlierSourcePlaceIds,
    },
    validationErrorCounts: Object.fromEntries([...validationErrorCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    categories: [...categoryCounts.values()]
      .map(({ id, label, count, decision, exploreWiseCategoryCode }) => ({
        sourceCategoryId: id,
        sourceCategoryLabel: label,
        samplePlaces: count,
        proposedExploreWiseCategory: exploreWiseCategoryCode,
        decision,
      }))
      .sort((left, right) => right.samplePlaces - left.samplePlaces || left.sourceCategoryId.localeCompare(right.sourceCategoryId)),
    exploreWiseCategoryDistribution: Object.fromEntries(
      [...stagingRecords.reduce((counts, record) => {
        const categoryCode = record.categoryMapping?.exploreWiseCategoryCode;
        if (record.categoryMapping?.status === "mapped" && categoryCode) {
          counts.set(categoryCode, (counts.get(categoryCode) ?? 0) + 1);
        }
        return counts;
      }, new Map<string, number>()).entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    unresolvedFlags: [...flagCounts.entries()]
      .map(([flag, details]) => ({ flag, samplePlaces: details.count, exampleSourcePlaceIds: details.examples }))
      .sort((left, right) => right.samplePlaces - left.samplePlaces || left.flag.localeCompare(right.flag)),
  };
}

export function toFoursquareStagingDatabaseRow(
  record: NormalizedStagingPlace,
): FoursquareStagingDatabaseRow {
  return {
    ingestion_run_id: record.ingestionRunId,
    source_id: record.sourceId,
    source_place_id: record.sourcePlaceId,
    source_payload: record.sourcePayload,
    source_updated_at: record.sourceUpdatedAt,
    name: record.name,
    category_source_code: record.categorySourceCode,
    country_code: record.countryCode,
    region: record.region,
    city: record.city,
    district: record.district,
    address: record.address,
    latitude: record.latitude,
    longitude: record.longitude,
    timezone: record.timezone,
    currency_code: record.currencyCode,
    website_url: record.websiteUrl,
    phone_number: record.phoneNumber,
    validation_status: record.validationStatus,
    validation_errors: record.validationErrors,
    normalized_name: record.normalizedName,
    dedupe_key: record.dedupeKey,
  };
}
