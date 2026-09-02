import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import type { Coordinates } from '@/services/places';

export type LocationSelection = {
  coordinates: Coordinates;
  label: string;
  source: 'current-location' | 'location-search';
};

export type LocationState =
  | { status: 'idle'; selection: null; message: null }
  | { status: 'loading'; selection: LocationSelection | null; message: null }
  | { status: 'ready'; selection: LocationSelection; message: null }
  | { status: 'denied' | 'unavailable' | 'error'; selection: null; message: string };

function friendlyLocationLabel(address: Location.LocationGeocodedAddress | undefined) {
  if (!address) return 'Your current area';

  const locality = address.city ?? address.district ?? address.subregion;
  const isMetroManila = /national capital region|metro manila|\bncr\b/iu.test(
    [address.region, address.subregion].filter(Boolean).join(' '),
  );
  const region = isMetroManila ? 'Metro Manila' : address.region ?? address.subregion;

  return [locality, region].filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ')
    || 'Your current area';
}

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({
    status: 'idle',
    selection: null,
    message: null,
  });

  const requestCurrentLocation = useCallback(async () => {
    setState((current) => ({ status: 'loading', selection: current.selection, message: null }));

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setState({
          status: 'unavailable',
          selection: null,
          message: 'Turn on location services, or choose another location.',
        });
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setState({
          status: 'denied',
          selection: null,
          message: 'Allow location access to find places near you.',
        });
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      let label = 'Your current area';

      try {
        const [address] = await Location.reverseGeocodeAsync(coordinates);
        label = friendlyLocationLabel(address);
      } catch {
        // A location fix remains useful even when the device cannot resolve a postal label.
      }

      setState({
        status: 'ready',
        selection: {
          coordinates,
          label,
          source: 'current-location',
        },
        message: null,
      });
    } catch {
      setState({
        status: 'error',
        selection: null,
        message: 'We could not get your location. Please try again or choose another location.',
      });
    }
  }, []);

  return { ...state, requestCurrentLocation };
}
