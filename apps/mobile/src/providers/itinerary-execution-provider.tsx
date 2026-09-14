import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';

import { createItineraryExecutionStore } from '@/services/itinerary-execution-storage';

const ExecutionContext = createContext<ReturnType<typeof createItineraryExecutionStore> | null>(null);

export function ItineraryExecutionProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => createItineraryExecutionStore(AsyncStorage));
  const { ready } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.hydrate(); }, [store]);
  // Restore before mounting Plan, including before consuming an Explore handoff.
  return <ExecutionContext.Provider value={store}>{ready ? children : null}</ExecutionContext.Provider>;
}

export function useItineraryExecution() {
  const store = useContext(ExecutionContext);
  if (!store) throw new Error('useItineraryExecution must be used within ItineraryExecutionProvider');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snapshot, store };
}
