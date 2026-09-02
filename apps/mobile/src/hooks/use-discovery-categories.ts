import { useCallback, useEffect, useState } from 'react';

import { discoveryErrorMessage } from '@/lib/discovery-errors';
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
      setError(discoveryErrorMessage(requestError, 'categories'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, isLoading, error, refresh };
}
