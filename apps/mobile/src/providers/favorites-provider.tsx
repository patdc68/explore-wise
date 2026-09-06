import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { addFavorite, getFavoritePlaceIds, removeFavorite } from '@/services/favorites';
import { useAuth } from '@/providers/auth-provider';

type FavoritesContextValue = {
  favoriteIds: Set<string>;
  isLoading: boolean;
  requiresAuthentication: boolean;
  refresh: () => Promise<void>;
  toggleFavorite: (placeId: string) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: PropsWithChildren) {
  const { user, initializing } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setFavoriteIds(new Set()); return; }
    setIsLoading(true);
    try { setFavoriteIds(new Set(await getFavoritePlaceIds())); }
    finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => { if (!initializing) void refresh(); }, [initializing, refresh]);

  const toggleFavorite = useCallback(async (placeId: string) => {
    if (favoriteIds.has(placeId)) {
      await removeFavorite(placeId);
      setFavoriteIds((current) => new Set([...current].filter((id) => id !== placeId)));
    } else {
      await addFavorite(placeId);
      setFavoriteIds((current) => new Set(current).add(placeId));
    }
  }, [favoriteIds]);

  const value = useMemo(() => ({ favoriteIds, isLoading, requiresAuthentication: !user, refresh, toggleFavorite }), [favoriteIds, isLoading, refresh, toggleFavorite, user]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavoritesContext() { const value = useContext(FavoritesContext); if (!value) throw new Error('useFavorites must be used within FavoritesProvider.'); return value; }
