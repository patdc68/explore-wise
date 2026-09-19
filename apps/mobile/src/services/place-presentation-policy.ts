import { Platform } from 'react-native';

export type PlacePresentationSurface = 'proposal' | 'customize' | 'alternatives';
export type PlaceMapProvider = 'google' | 'non_google' | 'none';

/**
 * Google Places content cannot share a surface with a non-Google map. Keep the
 * platform/provider decision here so cards never grow their own Platform.OS
 * checks. Android is configured for Google Maps; iOS currently uses the native
 * default provider. Customize has no map on its surface.
 */
export function placeMapProvider(surface: PlacePresentationSurface): PlaceMapProvider {
  if (surface === 'customize' || surface === 'alternatives') return 'none';
  if (Platform.OS === 'android') return 'google';
  if (Platform.OS === 'ios') return 'non_google';
  return 'none';
}

export function googlePresentationAllowed(surface: PlacePresentationSurface): boolean {
  return placeMapProvider(surface) !== 'non_google';
}
