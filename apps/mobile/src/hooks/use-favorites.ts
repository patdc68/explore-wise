import { useCallback, useEffect, useState } from 'react';

import {
  addFavorite,
  AuthenticationRequiredError,
  getFavoritePlaceIds,
  removeFavorite,
} from '@/services/favorites';

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [requiresAuthentication, setRequiresAuthentication] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setFavoriteIds(new Set(await getFavoritePlaceIds()));
      setRequiresAuthentication(false);
    } catch (error) {
      setFavoriteIds(new Set());
      setRequiresAuthentication(error instanceof AuthenticationRequiredError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleFavorite = useCallback(
    async (placeId: string) => {
      const isFavorite = favoriteIds.has(placeId);
      try {
        if (isFavorite) {
          await removeFavorite(placeId);
          setFavoriteIds((current) => new Set([...current].filter((id) => id !== placeId)));
        } else {
          await addFavorite(placeId);
          setFavoriteIds((current) => new Set(current).add(placeId));
        }
        setRequiresAuthentication(false);
      } catch (error) {
        if (error instanceof AuthenticationRequiredError) setRequiresAuthentication(true);
        throw error;
      }
    },
    [favoriteIds],
  );

  return { favoriteIds, isLoading, requiresAuthentication, refresh, toggleFavorite };
}
