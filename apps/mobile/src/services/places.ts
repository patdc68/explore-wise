import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/types/database';
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

type PlaceRow = Database['public']['Tables']['ew_places']['Row'];

export type NearbyPlace = Database['public']['Functions']['ew_nearby_places']['Returns'][number];

export type PlaceDetail = Pick<
  PlaceRow,
  'id' | 'name' | 'description' | 'address' | 'city' | 'district' | 'region' | 'website_url' | 'phone_number'
> & {
  categoryName: string | null;
  categoryCode: string | null;
};

export async function fetchNearbyPlaces(input: NearbyPlacesInput): Promise<NearbyPlace[]> {
  const { data, error } = await getSupabaseClient().rpc(
    'ew_nearby_places',
    buildNearbyPlacesArgs(input),
  );

  if (error) throw error;
  return data ?? [];
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
