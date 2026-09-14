/** Local artwork is category context, never evidence about a particular venue. */
const artwork = {
  restaurant: { source: require('../../assets/images/category-fallbacks/restaurant.svg') as number, accessibilityLabel: 'Restaurant category artwork' },
  cafe: { source: require('../../assets/images/category-fallbacks/cafe.svg') as number, accessibilityLabel: 'Cafe category artwork' },
  bakery: { source: require('../../assets/images/category-fallbacks/bakery.svg') as number, accessibilityLabel: 'Bakery category artwork' },
  dessert: { source: require('../../assets/images/category-fallbacks/dessert.svg') as number, accessibilityLabel: 'Dessert category artwork' },
  recreation: { source: require('../../assets/images/category-fallbacks/recreation.svg') as number, accessibilityLabel: 'Activity category artwork' },
  cinema: { source: require('../../assets/images/category-fallbacks/cinema.svg') as number, accessibilityLabel: 'Cinema category artwork' },
  entertainment: { source: require('../../assets/images/category-fallbacks/entertainment.svg') as number, accessibilityLabel: 'Entertainment category artwork' },
  outdoor: { source: require('../../assets/images/category-fallbacks/outdoor.svg') as number, accessibilityLabel: 'Outdoor category artwork' },
  culture: { source: require('../../assets/images/category-fallbacks/culture.svg') as number, accessibilityLabel: 'Culture category artwork' },
  attraction: { source: require('../../assets/images/category-fallbacks/attraction.svg') as number, accessibilityLabel: 'Attraction category artwork' },
  generic: { source: require('../../assets/images/category-fallbacks/generic.svg') as number, accessibilityLabel: 'ExploreWise discovery artwork' },
} as const;

export type CategoryVisualFamily = keyof typeof artwork;

const categoryFamilies: Readonly<Record<string, CategoryVisualFamily>> = {
  food: 'restaurant',
  'food.restaurant': 'restaurant',
  'food.cafe': 'cafe',
  'food.bakery': 'bakery',
  'food.dessert': 'dessert',
  activity: 'recreation',
  'activity.recreation': 'recreation',
  entertainment: 'entertainment',
  'entertainment.cinema': 'cinema',
  outdoor: 'outdoor',
  'outdoor.park': 'outdoor',
  attraction: 'attraction',
  'attraction.museum': 'culture',
  'attraction.culture': 'culture',
};

export function getCategoryFallbackAsset(categoryCode?: string | null) {
  let code = typeof categoryCode === 'string' ? categoryCode.trim().toLowerCase() : '';
  if (!/^[a-z]+(?:\.[a-z0-9_-]+)*$/.test(code)) code = '';
  while (code) {
    if (Object.hasOwn(categoryFamilies, code)) {
      const family = categoryFamilies[code];
      return { kind: 'artwork' as const, family, ...artwork[family] };
    }
    const separator = code.lastIndexOf('.');
    code = separator < 0 ? '' : code.slice(0, separator);
  }
  return { kind: 'artwork' as const, family: 'generic' as const, ...artwork.generic };
}

/** Transport validation only; photo provenance must be established by the caller. */
export function validPlaceImageUrl(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed) || /[\s\\\u0000-\u001f\u007f]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type PlaceVisualContext = Readonly<{
  name?: string | null;
  category_code?: string | null;
}>;

export type PlaceVisualOptions = Readonly<{
  /** Rendering input only: current ew_places and discovery RPCs have no photo field. */
  realImageUrl?: string | null;
  failedImageUrl?: string | null;
}>;

/** Shared precedence for discovery and future planner/detail consumers. Never uses name as identity. */
export function resolvePlaceVisual(place: PlaceVisualContext, options: PlaceVisualOptions = {}) {
  const uri = validPlaceImageUrl(options.realImageUrl);
  if (uri && uri !== validPlaceImageUrl(options.failedImageUrl)) {
    return {
      kind: 'photo' as const,
      source: { uri },
      accessibilityLabel: place.name?.trim() ? `Photo of ${place.name.trim()}` : 'Place photograph',
    };
  }
  return getCategoryFallbackAsset(place.category_code);
}
