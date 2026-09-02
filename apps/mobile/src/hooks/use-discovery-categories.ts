import { useCallback, useEffect, useState } from 'react';

import { fetchDiscoveryCategories, type DiscoveryCategory } from '@/services/places';

export function useDiscoveryCategories() {
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setCategories(await fetchDiscoveryCategories());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Categories could not load.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, isLoading, error, refresh };
}
