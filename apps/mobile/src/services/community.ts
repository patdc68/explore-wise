import { getSupabaseClient } from '@/lib/supabase';
import type { VisitReportInput } from './community-utils';
export { COMMUNITY_NOTE_MAX_LENGTH, COMMUNITY_SPEND_REPORT_MINIMUM, formatPesoMinor, parsePesoToMinor, spendPerPersonMinor, validateVisitReport, VISIT_TYPES, type VisitReportInput, type VisitType } from './community-utils';

export type CommunityAggregate = { place_id: string; rating_count: number; average_rating: number | null; spend_report_count: number; median_spend_per_person_minor: number | null; latest_report_at: string | null; community_spend_available: boolean };

export async function fetchCommunityAggregate(placeId: string): Promise<CommunityAggregate | null> {
  const { data, error } = await getSupabaseClient().rpc('ew_place_community_aggregates', { p_place_ids: [placeId] });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function submitVisitReport(input: VisitReportInput) {
  const { data: authData, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in to submit a visit report.');
  const { error } = await getSupabaseClient().from('ew_place_visit_reports').insert({
    place_id: input.placeId, user_id: authData.user.id, rating: input.rating, total_spend_minor: input.totalSpendMinor,
    party_size: input.partySize, currency_code: 'PHP', visit_type: input.visitType, visit_date: input.visitDate,
    short_note: input.shortNote, status: 'active',
  });
  if (error) {
    if (error.code === '23505') throw new Error('You already have an active report for this place on that date.');
    throw new Error('We could not submit your report. Please try again.');
  }
}
