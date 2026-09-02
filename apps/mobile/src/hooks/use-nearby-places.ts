import { useCallback, useEffect, useRef, useState } from 'react';

import { discoveryErrorMessage } from '@/lib/discovery-errors';
import {
  categoryCodesFromKey,
  fetchNearbyPlaces,
  nearbyQueryKey,
  stableCategoryCodes,
  type Coordinates,
  type NearbyPlace,
  type NearbyPlacesInput,
} from '@/services/places';

export function useNearbyPlaces({
  coordinates,
  radiusMeters,
  categoryCodes = [],
}: {
  coordinates: Coordinates | null;
  radiusMeters: number;
  categoryCodes?: string[];
}) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const hadDiscoveryInputs = useRef(false);

  const latitude = coordinates?.latitude ?? null;
  const longitude = coordinates?.longitude ?? null;
  const categoryCodesKey = stableCategoryCodes(categoryCodes);
  const queryKey = nearbyQueryKey({ latitude, longitude, radiusMeters, categoryCodesKey });

  const refresh = useCallback(async () => {
    if (latitude === null || longitude === null) return;

    const request: NearbyPlacesInput = {
      coordinates: { latitude, longitude },
      radiusMeters,
      categoryCodes: categoryCodesFromKey(categoryCodesKey),
    };
    const version = ++requestVersion.current;

    setIsLoading(true);
    setError(null);
    try {
      const nearbyPlaces = await fetchNearbyPlaces(request);
      if (version === requestVersion.current) setPlaces(nearbyPlaces);
    } catch (requestError) {
      if (version === requestVersion.current) {
        setPlaces([]);
        setError(discoveryErrorMessage(requestError, 'nearby places'));
      }
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [categoryCodesKey, latitude, longitude, radiusMeters]);

  useEffect(() => {
    if (!queryKey) {
      if (hadDiscoveryInputs.current) {
        hadDiscoveryInputs.current = false;
        requestVersion.current += 1;
        setPlaces([]);
        setError(null);
        setIsLoading(false);
      }
      return;
    }

    hadDiscoveryInputs.current = true;
    void refresh();
  }, [queryKey, refresh]);

  return { places, isLoading, error, refresh };
}
