import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.113.0';

export type PresentationPlaceRecord = Readonly<{
  ewPlaceId: string;
  googlePlaceId: string | null;
  googleMatchStatus: string;
  fallbackCategory: string | null;
}>;

type CategoryWire = Readonly<{ code: string }>;
type PlaceWire = Readonly<{
  id: string;
  google_place_id: string | null;
  google_match_status: string;
  category: CategoryWire | CategoryWire[] | null;
}>;

const PLACE_SELECT = 'id,google_place_id,google_match_status,category:ew_categories(code)';

function categoryFromWire(category: PlaceWire['category']): CategoryWire | null {
  return Array.isArray(category) ? category[0] ?? null : category;
}

export class SupabasePresentationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async readActivePlaces(placeIds: readonly string[]): Promise<readonly PresentationPlaceRecord[]> {
    if (placeIds.length === 0) return [];
    const { data, error } = await this.client
      .from('ew_places')
      .select(PLACE_SELECT)
      .eq('status', 'active')
      .in('id', [...placeIds]);
    if (error) throw error;
    return ((data ?? []) as unknown as PlaceWire[]).map((row) => {
      const category = categoryFromWire(row.category);
      return {
        ewPlaceId: row.id,
        googlePlaceId: typeof row.google_place_id === 'string' ? row.google_place_id : null,
        googleMatchStatus: row.google_match_status,
        fallbackCategory: category?.code ?? null,
      };
    });
  }
}
