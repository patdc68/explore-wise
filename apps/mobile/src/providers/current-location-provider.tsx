import { createContext, useContext, type ReactNode } from 'react';

import { useCurrentLocation as useLocationState, type LocationState } from '@/hooks/use-current-location';

type CurrentLocationContextValue = LocationState & { requestCurrentLocation: () => Promise<import('@/hooks/use-current-location').LocationSelection | null> };
const CurrentLocationContext = createContext<CurrentLocationContextValue | null>(null);

export function CurrentLocationProvider({ children }: { children: ReactNode }) {
  const location = useLocationState();
  return <CurrentLocationContext.Provider value={location}>{children}</CurrentLocationContext.Provider>;
}

export function useCurrentLocation() {
  const location = useContext(CurrentLocationContext);
  if (!location) throw new Error('useCurrentLocation must be used within CurrentLocationProvider');
  return location;
}

export type { LocationState } from '@/hooks/use-current-location';
