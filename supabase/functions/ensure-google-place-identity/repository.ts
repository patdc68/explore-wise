import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.113.0';
import type { GoogleMatchStatus, GooglePlaceMatchResult } from '../_shared/google-place-identity/types.ts';
import type { GoogleIdentityRepository, StoredGoogleIdentityPlace } from './service.ts';

type PlaceWire = Readonly<{
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  country_code: string;
  location: unknown;
  source: string;
  source_place_id: string;
  google_place_id: string | null;
  google_match_status: string;
  google_match_confidence: number | null;
  google_match_checked_at: string | null;
  google_place_id_refreshed_at: string | null;
  google_match_algorithm_version: string | null;
  category: { code: string } | { code: string }[] | null;
}>;

function coordinatesFromPostgisPoint(value: unknown): { latitude: number; longitude: number } | null {
  if (typeof value === 'object' && value !== null && 'coordinates' in value) {
    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(Number.isFinite)) {
      return { longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) };
    }
  }
  if (typeof value !== 'string' || !/^[0-9a-f]+$/iu.test(value) || value.length < 42 || value.length % 2 !== 0) return null;
  const bytes = Uint8Array.from(value.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
  const view = new DataView(bytes.buffer);
  const littleEndian = view.getUint8(0) === 1;
  const geometryType = view.getUint32(1, littleEndian);
  const hasSrid = Boolean(geometryType & 0x20000000);
  const offset = hasSrid ? 9 : 5;
  if ((geometryType & 0x000000ff) !== 1 || bytes.length < offset + 16) return null;
  const longitude = view.getFloat64(offset, littleEndian);
  const latitude = view.getFloat64(offset + 8, littleEndian);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function toStoredPlace(row: PlaceWire): StoredGoogleIdentityPlace {
  const coordinates = coordinatesFromPostgisPoint(row.location);
  if (!coordinates) throw new Error('Place coordinates are unavailable.');
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    district: row.district,
    region: row.region,
    countryCode: row.country_code,
    categoryCode: category?.code ?? null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    source: row.source,
    sourcePlaceId: row.source_place_id,
    googlePlaceId: row.google_place_id,
    googleMatchStatus: row.google_match_status as GoogleMatchStatus,
    googleMatchConfidence: row.google_match_confidence,
    googleMatchCheckedAt: row.google_match_checked_at,
    googlePlaceIdRefreshedAt: row.google_place_id_refreshed_at,
    googleMatchAlgorithmVersion: row.google_match_algorithm_version,
  };
}

const PLACE_SELECT = 'id,name,address,city,district,region,country_code,location,source,source_place_id,google_place_id,google_match_status,google_match_confidence,google_match_checked_at,google_place_id_refreshed_at,google_match_algorithm_version,category:ew_categories(code)';

export class SupabaseGoogleIdentityRepository implements GoogleIdentityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async readPlaces(placeIds: readonly string[]): Promise<readonly StoredGoogleIdentityPlace[]> {
    const { data, error } = await this.client
      .from('ew_places')
      .select(PLACE_SELECT)
      .eq('status', 'active')
      .in('id', [...placeIds]);
    if (error) throw error;
    return ((data ?? []) as unknown as PlaceWire[]).map(toStoredPlace);
  }

  async persistIfStatus(
    place: StoredGoogleIdentityPlace,
    expectedStatus: 'not_checked' | 'error',
    result: GooglePlaceMatchResult,
    checkedAt: string,
  ): Promise<StoredGoogleIdentityPlace> {
    const googlePlaceId = result.status === 'matched' ? result.bestGooglePlaceId : null;
    if (result.status === 'matched' && !googlePlaceId) throw new Error('Matched result is missing its Google Place ID.');
    const { data, error } = await this.client
      .from('ew_places')
      .update({
        google_place_id: googlePlaceId,
        google_match_status: result.status,
        google_match_confidence: result.confidence,
        google_match_checked_at: checkedAt,
        google_place_id_refreshed_at: result.status === 'matched' ? checkedAt : null,
        google_match_algorithm_version: result.algorithmVersion,
      })
      .eq('id', place.id)
      .eq('google_match_status', expectedStatus)
      .select('id');
    if (error) throw error;
    if ((data ?? []).length > 0) return {
      ...place,
      googlePlaceId,
      googleMatchStatus: result.status,
      googleMatchConfidence: result.confidence,
      googleMatchCheckedAt: checkedAt,
      googlePlaceIdRefreshedAt: result.status === 'matched' ? checkedAt : null,
      googleMatchAlgorithmVersion: result.algorithmVersion,
    };
    const current = (await this.readPlaces([place.id]))[0];
    if (!current) throw new Error('Place identity changed while matching and could not be reloaded.');
    return current;
  }
}
