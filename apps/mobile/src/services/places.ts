import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { FoodFocus } from './ask-wise-normalization';
import { composePlanningCandidatePool, coordinatesFromPostgisPoint, distanceBetweenMeters, EXPLICIT_NAME_QUERY_LIMIT, explicitNameTerms, focusedCategoryCodes, PLANNING_BUDGET_EVIDENCE_LIMIT, PLANNING_EXPLICIT_MATCH_LIMIT, withPlanningBudgetStatus } from './planning-food-retrieval';
import {
  buildNearbyPlacesArgs,
  createDiscoveryCategories,
  type DiscoveryCategory,
  type NearbyPlacesInput,
} from './discovery-utils';

export {
  buildNearbyPlacesArgs,
  categoryCodesFromKey,
  createDiscoveryCategories,
  formatDistance,
  nearbyQueryKey,
  stableCategoryCodes,
  type Coordinates,
  type DiscoveryCategory,
  type NearbyPlacesInput,
} from './discovery-utils';
export { budgetStatusForCandidate, composePlanningCandidatePool, coordinatesFromPostgisPoint, distanceBetweenMeters, withPlanningBudgetStatus } from './planning-food-retrieval';

type PlaceRow = Database['public']['Tables']['ew_places']['Row'];

export type NearbyPlace = Database['public']['Functions']['ew_nearby_places']['Returns'][number];
export type PricedNearbyPlace = Database['public']['Functions']['ew_nearby_places_priced']['Returns'][number];

export type PlaceDetail = Pick<
  PlaceRow,
  'id' | 'name' | 'description' | 'address' | 'city' | 'district' | 'region' | 'website_url' | 'phone_number'
> & {
  categoryName: string | null;
  categoryCode: string | null;
};

type ExplicitFoodRow = Readonly<{
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  region: string | null;
  country_code: string;
  website_url: string | null;
  phone_number: string | null;
  location: unknown;
  category: { code: string; name: string } | { code: string; name: string }[];
}>;

const unknownPricePlace = (row: ExplicitFoodRow, coordinates: { latitude: number; longitude: number }, distanceMeters: number): PricedNearbyPlace => {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    place_id: row.id, name: row.name, category_code: category?.code ?? 'food', category_name: category?.name ?? 'Food', address: row.address, city: row.city,
    region: row.region, country_code: row.country_code, latitude: coordinates.latitude, longitude: coordinates.longitude, website_url: row.website_url, phone_number: row.phone_number,
    distance_meters: distanceMeters, has_price: false, pricing_basis: null, pricing_status: null, pricing_unit: null, min_amount_minor: null, max_amount_minor: null,
    currency_code: null, confidence_level: null, price_precision: null, pricing_channel: null, price_source_label: 'Price not available yet', last_verified_at: null,
    effective_price_source: null, budget_status: 'unknown', estimated_group_min_minor: null, estimated_group_max_minor: null,
  };
};

async function fetchExplicitFoodNameMatches(input: NearbyPlacesInput & { foodFocus?: FoodFocus }): Promise<PricedNearbyPlace[]> {
  const terms = input.foodFocus ? explicitNameTerms[input.foodFocus] : undefined;
  if (!terms?.length) return [];
  const client = getSupabaseClient();
  let query = client.from('ew_places')
    .select('id,name,address,city,region,country_code,website_url,phone_number,location,category:ew_categories!inner(code,name)')
    .eq('status', 'active')
    .in('ew_categories.code', input.categoryCodes?.length ? input.categoryCodes : ['food', 'food.restaurant', 'food.cafe', 'food.bakery', 'food.dessert']);
  query = terms.length === 1 ? query.ilike('name', `%${terms[0]}%`) : query.or(terms.map((term) => `name.ilike.%${term}%`).join(','));
  const { data, error } = await query.limit(EXPLICIT_NAME_QUERY_LIMIT);
  if (error) throw error;
  return ((data ?? []) as unknown as ExplicitFoodRow[]).flatMap((row) => {
    const coordinates = coordinatesFromPostgisPoint(row.location);
    if (!coordinates) return [];
    const distanceMeters = distanceBetweenMeters(input.coordinates, coordinates);
    return distanceMeters !== null && distanceMeters <= input.radiusMeters ? [unknownPricePlace(row, coordinates, distanceMeters)] : [];
  }).sort((left, right) => left.distance_meters - right.distance_meters).slice(0, PLANNING_EXPLICIT_MATCH_LIMIT);
}

export async function fetchNearbyPlaces(input: NearbyPlacesInput): Promise<NearbyPlace[]> {
  const { data, error } = await getSupabaseClient().rpc(
    'ew_nearby_places',
    buildNearbyPlacesArgs(input),
  );

  if (error) throw error;
  return data ?? [];
}

export async function fetchPricedNearbyPlaces(input: NearbyPlacesInput & { budgetMinor?: number | null; partySize?: number }): Promise<PricedNearbyPlace[]> {
  const { data, error } = await getSupabaseClient().rpc('ew_nearby_places_priced', {
    ...buildNearbyPlacesArgs(input),
    p_budget_minor: input.budgetMinor ?? null,
    p_party_size: input.partySize ?? 1,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Planning retrieval is relevance/distance-first. A small price-evidence slice
 * is merged before local budget classification, so RPC truncation cannot turn
 * known pricing into candidate eligibility.
 */
export async function fetchPlanningNearbyPlaces(input: NearbyPlacesInput & { budgetMinor?: number | null; partySize?: number; foodFocus?: FoodFocus }): Promise<PricedNearbyPlace[]> {
  const resultLimit = input.resultLimit ?? 30;
  const focusedCodes = input.foodFocus ? focusedCategoryCodes[input.foodFocus] : undefined;
  const broadRequest = fetchPricedNearbyPlaces({ ...input, resultLimit, budgetMinor: null });
  const budgetRequest = input.budgetMinor === null || input.budgetMinor === undefined
    ? Promise.resolve([] as PricedNearbyPlace[])
    : fetchPricedNearbyPlaces({ ...input, resultLimit: Math.min(PLANNING_BUDGET_EVIDENCE_LIMIT, resultLimit), budgetMinor: input.budgetMinor });
  const focusedRequest = focusedCodes?.length
    ? fetchPricedNearbyPlaces({ ...input, categoryCodes: [...focusedCodes], resultLimit: Math.min(PLANNING_EXPLICIT_MATCH_LIMIT, resultLimit), budgetMinor: null })
    : fetchExplicitFoodNameMatches(input);
  const [broad, budgetEvidence, explicitMatches] = await Promise.all([broadRequest, budgetRequest, focusedRequest]);
  const merged = composePlanningCandidatePool({ broad, budgetEvidence, explicitMatches, resultLimit });
  return withPlanningBudgetStatus(merged, input.budgetMinor);
}

export async function fetchDiscoveryCategories(): Promise<DiscoveryCategory[]> {
  const { data, error } = await getSupabaseClient()
    .from('ew_categories')
    .select('id, parent_id, code, name, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  return createDiscoveryCategories(data ?? []);
}

export async function fetchPlaceDetail(placeId: string): Promise<PlaceDetail | null> {
  const client = getSupabaseClient();
  const { data: place, error: placeError } = await client
    .from('ew_places')
    .select('id, name, description, address, city, district, region, website_url, phone_number, category_id')
    .eq('id', placeId)
    .maybeSingle();

  if (placeError) throw placeError;
  if (!place) return null;

  const { data: category, error: categoryError } = place.category_id
    ? await client.from('ew_categories').select('code, name').eq('id', place.category_id).maybeSingle()
    : { data: null, error: null };

  if (categoryError) throw categoryError;

  return {
    id: place.id,
    name: place.name,
    description: place.description,
    address: place.address,
    city: place.city,
    district: place.district,
    region: place.region,
    website_url: place.website_url,
    phone_number: place.phone_number,
    categoryName: category?.name ?? null,
    categoryCode: category?.code ?? null,
  };
}
