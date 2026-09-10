import type { LocationSelection } from '@/hooks/use-current-location';

export type PlanLocationResolution = Readonly<{ selection: LocationSelection | null; reason: 'explicit' | 'current' | 'requested' | 'explicit-unavailable' | 'unavailable' }>;

/** Location selection is local application logic; Wise only supplies optional location text. */
export async function resolvePlanLocation({ explicitLocation, currentLocation, requestCurrentLocation, resolveExplicitLocation }: { explicitLocation: string | null; currentLocation: LocationSelection | null; requestCurrentLocation: () => Promise<LocationSelection | null>; resolveExplicitLocation: (query: string) => Promise<LocationSelection | null> }): Promise<PlanLocationResolution> {
  const query = explicitLocation?.trim();
  if (query) {
    const selection = await resolveExplicitLocation(query);
    return { selection, reason: selection ? 'explicit' : 'explicit-unavailable' };
  }
  if (currentLocation) return { selection: currentLocation, reason: 'current' };
  const selection = await requestCurrentLocation();
  return { selection, reason: selection ? 'requested' : 'unavailable' };
}
