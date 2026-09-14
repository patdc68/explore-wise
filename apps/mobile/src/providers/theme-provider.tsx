import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import { createThemePreferenceStore } from '@/services/theme-preference';

const ThemeContext = createContext<ReturnType<typeof createThemePreferenceStore> | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createThemePreferenceStore(AsyncStorage));
  const { ready } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => { void store.hydrate(); }, [store]);

  // The existing native splash remains visible until the saved preference is known.
  return <ThemeContext.Provider value={store}>{ready ? children : null}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const store = useContext(ThemeContext);
  if (!store) throw new Error('useThemePreference must be used within ThemeProvider');
  const { preference } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { preference, setPreference: store.setPreference };
}
