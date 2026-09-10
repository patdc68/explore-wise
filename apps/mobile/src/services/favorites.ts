import { getSupabaseClient } from '@/lib/supabase';

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Sign in is required to save favorites.');
  }
}

async function requireCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error || !data.user) throw new AuthenticationRequiredError();
  return data.user.id;
}

export async function getFavoritePlaceIds(): Promise<string[]> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabaseClient()
    .from('ew_favorites')
    .select('place_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((favorite) => favorite.place_id);
}

export type FavoritePlace = { id: string; name: string; address: string | null; city: string | null; region: string | null; category: { name: string } | null };

export async function getFavoritePlaces(): Promise<FavoritePlace[]> {
  await requireCurrentUserId();
  const { data, error } = await getSupabaseClient()
    .from('ew_favorites')
    .select('ew_places!inner(id, name, address, city, region, ew_categories(name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((favorite) => {
    const place = favorite.ew_places as unknown as { id: string; name: string; address: string | null; city: string | null; region: string | null; ew_categories: { name: string } | null } | null;
    return place ? [{ id: place.id, name: place.name, address: place.address, city: place.city, region: place.region, category: place.ew_categories }] : [];
  });
}

export async function addFavorite(placeId: string) {
  const userId = await requireCurrentUserId();
  const { error } = await getSupabaseClient()
    .from('ew_favorites')
    .upsert({ place_id: placeId, user_id: userId }, { onConflict: 'user_id,place_id', ignoreDuplicates: true });

  if (error) throw error;
}

export async function removeFavorite(placeId: string) {
  const userId = await requireCurrentUserId();
  const { error } = await getSupabaseClient()
    .from('ew_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('place_id', placeId);

  if (error) throw error;
}
