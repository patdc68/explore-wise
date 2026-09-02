import type { Coordinates } from '@/services/places';

export type LocationSearchResult = {
  label: string;
  coordinates: Coordinates;
  source: 'geocoder' | 'curated-area';
};

export interface LocationSearchProvider {
  search(query: string): Promise<LocationSearchResult[]>;
}

// Free-text location search intentionally remains unconfigured until a production-safe provider is selected.
export const locationSearchProvider: LocationSearchProvider | null = null;

export const isLocationSearchAvailable = locationSearchProvider !== null;
