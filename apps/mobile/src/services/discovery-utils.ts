export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type DiscoveryCategory = {
  code: string;
  name: string;
  categoryCodes: string[];
};

export type NearbyPlacesInput = {
  coordinates: Coordinates;
  radiusMeters: number;
  categoryCodes?: string[];
  resultLimit?: number;
};

export type NearbyPlacesArguments = {
  p_latitude: number;
  p_longitude: number;
  p_radius_meters: number;
  p_category_codes?: string[];
  p_result_limit: number;
};

export function stableCategoryCodes(categoryCodes?: readonly string[]) {
  return [...new Set(categoryCodes ?? [])].sort().join('\u0000');
}

export function categoryCodesFromKey(categoryCodesKey: string) {
  return categoryCodesKey ? categoryCodesKey.split('\u0000') : [];
}

export function nearbyQueryKey({
  latitude,
  longitude,
  radiusMeters,
  categoryCodesKey,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  categoryCodesKey: string;
}) {
  if (latitude === null || longitude === null) return null;

  return `${latitude}|${longitude}|${radiusMeters}|${categoryCodesKey}`;
}

type CategoryData = {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export function buildNearbyPlacesArgs({
  coordinates,
  radiusMeters,
  categoryCodes = [],
  resultLimit = 30,
}: NearbyPlacesInput): NearbyPlacesArguments {
  return {
    p_latitude: coordinates.latitude,
    p_longitude: coordinates.longitude,
    p_radius_meters: radiusMeters,
    ...(categoryCodes.length > 0 ? { p_category_codes: [...new Set(categoryCodes)] } : {}),
    p_result_limit: resultLimit,
  };
}

export function formatDistance(distanceMeters: number | null | undefined) {
  if (distanceMeters === null || distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    return null;
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0)} km`;
}

export function createDiscoveryCategories(categories: CategoryData[]): DiscoveryCategory[] {
  const activeCategories = categories.filter((category) => category.is_active);
  const childrenByParentId = new Map<string, typeof activeCategories>();

  for (const category of activeCategories) {
    if (!category.parent_id) continue;
    const children = childrenByParentId.get(category.parent_id) ?? [];
    children.push(category);
    childrenByParentId.set(category.parent_id, children);
  }

  const collectCodes = (category: (typeof activeCategories)[number]): string[] => [
    category.code,
    ...(childrenByParentId.get(category.id) ?? []).flatMap(collectCodes),
  ];

  return activeCategories
    .filter((category) => category.parent_id === null)
    .map((category) => ({
      code: category.code,
      name: category.name,
      categoryCodes: collectCodes(category),
    }));
}
