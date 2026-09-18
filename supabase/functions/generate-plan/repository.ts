import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.113.0';
import type { CatalogPlaceAnchor, PlanningCategory } from '../../../packages/planning/src/engine.ts';
import type { PricedNearbyPlace } from '../../../packages/planning/src/domain.ts';
import type {
  AnchorCandidateRequest,
  CandidateRetrievalRepository,
  CandidateSearchRequest,
  CandidateChainMembership,
} from '../../../packages/planning/src/retrieval.ts';
import type { AnchorCatalogRecord, PlanningBoundaryRepository } from './types.ts';

type CategoryWire = Readonly<{ code: string; name: string; is_active: boolean }>;
type PlaceWire = Readonly<{
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  region: string | null;
  country_code: string;
  location: unknown;
  website_url: string | null;
  phone_number: string | null;
  status: string;
  category: CategoryWire | CategoryWire[] | null;
}>;

const ANCHOR_SELECT = 'id,name,address,city,region,country_code,location,website_url,phone_number,status,category:ew_categories(code,name,is_active)';
const RPC_INTEGER_MAX = 2_147_483_647;

type RecordLike = Readonly<Record<string, unknown>>;

function recordLike(value: unknown): RecordLike | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordLike : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toPricedPlace(value: unknown): PricedNearbyPlace | null {
  const row = recordLike(value);
  if (!row || typeof row.place_id !== 'string' || typeof row.name !== 'string') return null;
  const latitude = nullableNumber(row.latitude);
  const longitude = nullableNumber(row.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    place_id: row.place_id,
    name: row.name,
    category_code: nullableString(row.resolved_category_code ?? row.category_code),
    category_name: nullableString(row.resolved_category_name ?? row.category_name),
    address: nullableString(row.address),
    city: nullableString(row.city),
    region: nullableString(row.region),
    country_code: nullableString(row.country_code),
    latitude,
    longitude,
    distance_meters: nullableNumber(row.distance_meters),
    website_url: nullableString(row.website_url),
    phone_number: nullableString(row.phone_number),
    has_price: row.has_price === true,
    pricing_basis: nullableString(row.pricing_basis),
    pricing_status: nullableString(row.pricing_status),
    pricing_unit: nullableString(row.pricing_unit),
    min_amount_minor: nullableSafeInteger(row.min_amount_minor),
    max_amount_minor: nullableSafeInteger(row.max_amount_minor),
    currency_code: nullableString(row.currency_code),
    confidence_level: nullableString(row.confidence_level),
    price_precision: nullableString(row.price_precision),
    pricing_channel: nullableString(row.pricing_channel),
    price_source_label: nullableString(row.price_source_label),
    last_verified_at: nullableString(row.last_verified_at),
    effective_price_source: nullableString(row.effective_price_source),
    budget_status: nullableString(row.budget_status),
    estimated_group_min_minor: nullableSafeInteger(row.estimated_group_min_minor),
    estimated_group_max_minor: nullableSafeInteger(row.estimated_group_max_minor),
  };
}

function coordinatesFromPostgisPoint(value: unknown): { latitude: number; longitude: number } | null {
  if (typeof value === 'object' && value !== null && 'coordinates' in value) {
    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every((item) => typeof item === 'number' && Number.isFinite(item))) {
      const longitude = Number(coordinates[0]);
      const latitude = Number(coordinates[1]);
      return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
    }
  }
  if (typeof value !== 'string' || !/^[0-9a-f]+$/iu.test(value) || value.length < 42 || value.length % 2 !== 0) return null;
  try {
    const bytes = Uint8Array.from(value.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
    if (bytes.length < 21) return null;
    const view = new DataView(bytes.buffer);
    const littleEndian = view.getUint8(0) === 1;
    const geometryType = view.getUint32(1, littleEndian);
    const hasSrid = Boolean(geometryType & 0x20000000);
    const offset = hasSrid ? 9 : 5;
    if ((geometryType & 0x000000ff) !== 1 || bytes.length < offset + 16) return null;
    const longitude = view.getFloat64(offset, littleEndian);
    const latitude = view.getFloat64(offset + 8, littleEndian);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? { latitude, longitude }
      : null;
  } catch {
    return null;
  }
}

function categoryFromWire(category: PlaceWire['category']): CategoryWire | null {
  return Array.isArray(category) ? category[0] ?? null : category;
}

function toAnchorRecord(row: PlaceWire): AnchorCatalogRecord {
  const category = categoryFromWire(row.category);
  const coordinates = coordinatesFromPostgisPoint(row.location);
  const place: CatalogPlaceAnchor | null = coordinates && category
    ? {
        place_id: row.id,
        name: row.name,
        category_code: category.code,
        category_name: category.name,
        address: row.address,
        city: row.city,
        region: row.region,
        country_code: row.country_code,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        website_url: row.website_url,
        phone_number: row.phone_number,
        has_price: false,
        pricing_basis: null,
        pricing_status: null,
        pricing_unit: null,
        min_amount_minor: null,
        max_amount_minor: null,
        currency_code: null,
        confidence_level: null,
        price_precision: null,
        pricing_channel: null,
        price_source_label: null,
        last_verified_at: null,
        effective_price_source: null,
        budget_status: null,
        estimated_group_min_minor: null,
        estimated_group_max_minor: null,
      }
    : null;
  return {
    placeId: row.id,
    status: row.status,
    categoryCode: category?.code ?? null,
    categoryName: category?.name ?? null,
    categoryActive: category?.is_active === true,
    place,
  };
}

export class SupabasePlanningRepository implements PlanningBoundaryRepository, CandidateRetrievalRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async readAnchors(placeIds: readonly string[]): Promise<readonly AnchorCatalogRecord[]> {
    if (placeIds.length === 0) return [];
    const { data, error } = await this.client
      .from('ew_places')
      .select(ANCHOR_SELECT)
      .in('id', [...placeIds]);
    if (error) throw error;
    return ((data ?? []) as unknown as PlaceWire[])
      .map(toAnchorRecord)
      .sort((left, right) => left.placeId.localeCompare(right.placeId));
  }

  async findActivePlaces(placeIds: readonly string[]): Promise<readonly CatalogPlaceAnchor[]> {
    const records = await this.readAnchors(placeIds);
    return records
      .filter((record): record is AnchorCatalogRecord & { place: CatalogPlaceAnchor } => record.status === 'active' && record.categoryActive && record.place !== null)
      .map((record) => record.place);
  }

  async findActiveCategories(categoryCodes: readonly string[]): Promise<readonly PlanningCategory[]> {
    if (categoryCodes.length === 0) return [];
    const { data, error } = await this.client
      .from('ew_categories')
      .select('code,name,is_active')
      .eq('is_active', true)
      .in('code', [...categoryCodes])
      .order('code', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as CategoryWire[]).map((category) => ({ code: category.code, name: category.name, isActive: category.is_active }));
  }

  /**
   * Candidate retrieval deliberately uses the existing bounded, active-catalog
   * pricing RPC. Geography, exclusions, currency truthfulness and strict
   * budget eligibility remain deterministic shared-planner checks.
   */
  async findNearbyCandidates(request: CandidateSearchRequest): Promise<readonly PricedNearbyPlace[]> {
    const { data, error } = await this.client.rpc('ew_nearby_places_priced', {
      p_latitude: request.origin.latitude,
      p_longitude: request.origin.longitude,
      p_radius_meters: request.radiusMeters,
      p_category_codes: request.categoryCodes.length > 0 ? [...request.categoryCodes] : null,
      p_result_limit: request.resultLimit,
      // The production RPC accepts a 32-bit integer. Large normalized budgets
      // are still evaluated locally; passing null avoids an avoidable overflow
      // while preserving unknown-at-RPC ordering semantics.
      p_budget_minor: request.budgetMinor !== null && request.budgetMinor <= RPC_INTEGER_MAX ? request.budgetMinor : null,
      p_party_size: request.partySize,
    });
    if (error) throw error;
    return ((data ?? []) as unknown[])
      .map(toPricedPlace)
      .filter((place): place is PricedNearbyPlace => place !== null)
      .slice(0, request.resultLimit);
  }

  async findAnchorCandidate(request: AnchorCandidateRequest): Promise<PricedNearbyPlace | null> {
    const anchorPlace = request.anchor.place;
    if (!anchorPlace) return null;
    const candidates = await this.findNearbyCandidates({
      origin: { latitude: anchorPlace.latitude, longitude: anchorPlace.longitude },
      radiusMeters: 100,
      categoryCodes: anchorPlace.category_code ? [anchorPlace.category_code] : [],
      resultLimit: 50,
      budgetMinor: request.budgetMinor,
      partySize: request.partySize,
      pool: 'broad',
    });
    const anchorId = request.anchor.placeId.toLowerCase();
    return candidates.find((candidate) => candidate.place_id.toLowerCase() === anchorId) ?? null;
  }

  async findChainMemberships(placeIds: readonly string[]): Promise<readonly CandidateChainMembership[]> {
    const ids = [...new Set(placeIds.map((placeId) => placeId.toLowerCase()).filter(Boolean))];
    if (ids.length === 0) return [];
    const { data, error } = await this.client
      .from('ew_place_chain_memberships')
      .select('place_id,chain_id')
      .in('place_id', ids)
      .eq('identity_status', 'CONFIRMED_CHAIN');
    if (error) throw error;
    return ((data ?? []) as unknown[])
      .map((value) => {
        const row = recordLike(value);
        return row && typeof row.place_id === 'string' && typeof row.chain_id === 'string'
          ? { placeId: row.place_id, chainId: row.chain_id }
          : null;
      })
      .filter((membership): membership is CandidateChainMembership => membership !== null);
  }
}
