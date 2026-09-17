import { isValidCoordinates } from './distance.ts';

export const GOOGLE_MATCH_STATUSES = ['not_checked', 'matched', 'ambiguous', 'unmatched', 'needs_review', 'error'] as const;
export type GoogleMatchStatus = typeof GOOGLE_MATCH_STATUSES[number];

export type GoogleMapsNavigationPlace = Readonly<{
  name?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  googleMatchStatus?: GoogleMatchStatus | null;
}>;

const text = (value: string | null | undefined) => value?.trim() || null;

function uniqueText(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = text(value);
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) return [];
    seen.add(normalized.toLocaleLowerCase());
    return [normalized];
  });
}

function mapsDirectionsUrl(destination: string, googlePlaceId?: string | null): string {
  const parameters = [`api=1`, `destination=${encodeURIComponent(destination)}`];
  if (googlePlaceId) parameters.push(`destination_place_id=${encodeURIComponent(googlePlaceId)}`);
  return `https://www.google.com/maps/dir/?${parameters.join('&')}`;
}

/** Builds a universal Google Maps URL without making a Places API request. */
export function googleMapsDirectionsUrl(place: GoogleMapsNavigationPlace): string {
  const name = text(place.name);
  const locality = uniqueText([place.address, place.district, place.city, place.region]);
  const coordinates = isValidCoordinates(place) ? `${place.latitude},${place.longitude}` : null;
  const humanDestination = uniqueText([name, ...locality]).join(', ');
  const trustedPlaceId = place.googleMatchStatus === 'matched' ? text(place.googlePlaceId) : null;

  if (trustedPlaceId) return mapsDirectionsUrl(humanDestination || coordinates || trustedPlaceId, trustedPlaceId);
  if (name && locality.length > 0) return mapsDirectionsUrl(humanDestination);
  if (name && coordinates) return mapsDirectionsUrl(`${name}, ${coordinates}`);
  if (coordinates) return mapsDirectionsUrl(coordinates);
  if (name) return mapsDirectionsUrl(name);
  throw new Error('A Google Maps destination requires a name or valid coordinates.');
}
