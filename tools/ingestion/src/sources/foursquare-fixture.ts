import type { RawSourcePlace } from "../types/index.js";
import type { PlaceSourceAdapter, SourceReadOptions } from "./types.js";

export const FICTIONAL_FIXTURE_CATEGORY_MAPPINGS: Readonly<Record<string, string>> = Object.freeze({
  "test:activity": "activity",
  "test:cafe": "food.cafe",
  "test:restaurant": "food.restaurant",
});

const FICTIONAL_PLACES: readonly RawSourcePlace[] = [
  {
    sourcePlaceId: "TEST-FSQ-001",
    name: "TEST / FICTIONAL Lantern Cloud Cafe",
    categorySourceCode: "TEST:CAFE",
    countryCode: "PH",
    region: "Metro Manila",
    city: "Test City",
    district: "Fixture District",
    address: "1 Fixture Avenue",
    latitude: 14.5891,
    longitude: 121.0612,
    timezone: "Asia/Manila",
    currencyCode: "PHP",
    websiteUrl: "https://example.invalid/test-lantern-cloud",
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    sourcePayload: { testFixture: true, fictional: true },
  },
  {
    sourcePlaceId: "TEST-FSQ-002",
    name: "TEST / FICTIONAL Moonbeam Noodle Lab",
    categorySourceCode: "TEST:RESTAURANT",
    countryCode: "PH",
    region: "Metro Manila",
    city: "Test City",
    latitude: 14.5764,
    longitude: 121.0347,
    timezone: "Asia/Manila",
    currencyCode: "PHP",
    sourcePayload: { testFixture: true, fictional: true },
  },
  {
    sourcePlaceId: "TEST-FSQ-003",
    name: "TEST / FICTIONAL Riverwalk Puzzle Studio",
    categorySourceCode: "TEST:ACTIVITY",
    countryCode: "PH",
    region: "Metro Manila",
    city: "Test City",
    latitude: 14.5539,
    longitude: 121.0245,
    timezone: "Asia/Manila",
    currencyCode: "PHP",
    sourcePayload: { testFixture: true, fictional: true },
  },
  {
    sourcePlaceId: "TEST-FSQ-001",
    name: "TEST / FICTIONAL Duplicate Lantern Cloud Cafe",
    categorySourceCode: "TEST:CAFE",
    countryCode: "PH",
    latitude: 14.5891,
    longitude: 121.0612,
    timezone: "Asia/Manila",
    currencyCode: "PHP",
    sourcePayload: { testFixture: true, fictional: true, duplicate: true },
  },
  {
    sourcePlaceId: "TEST-FSQ-INVALID",
    name: "TEST / FICTIONAL Invalid Coordinate Place",
    categorySourceCode: "TEST:ACTIVITY",
    countryCode: "PH",
    latitude: 100,
    longitude: 121,
    timezone: "Asia/Manila",
    currencyCode: "PHP",
    sourcePayload: { testFixture: true, fictional: true, intentionallyInvalid: true },
  },
];

export class FoursquareFixtureSource implements PlaceSourceAdapter {
  readonly sourceCode = "foursquare_os";

  async read(options: SourceReadOptions): Promise<readonly RawSourcePlace[]> {
    const limit = options.limit ?? FICTIONAL_PLACES.length;
    return FICTIONAL_PLACES.slice(0, limit);
  }
}

