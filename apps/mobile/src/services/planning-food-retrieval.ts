import type { FoodFocus } from './ask-wise-normalization.ts';
import type { PricedNearbyPlace } from './places.ts';
import { classifyBudgetStatus } from '../../../../packages/planning/src/budget.ts';
import { distanceBetweenCoordinates } from './distance.ts';

export const PLANNING_BUDGET_EVIDENCE_LIMIT = 12;
export const PLANNING_EXPLICIT_MATCH_LIMIT = 16;
export const EXPLICIT_NAME_QUERY_LIMIT = 600;

export const explicitNameTerms: Partial<Record<Exclude<FoodFocus, null>, readonly string[]>> = {
  ramen: ['ramen'],
  pizza: ['pizza'],
  sushi: ['sushi'],
  burger: ['burger'],
  fast_food: ['jollibee', 'kfc', 'mang inasal', 'mcdonald'],
};

export const focusedCategoryCodes: Partial<Record<Exclude<FoodFocus, null>, readonly string[]>> = {
  restaurant: ['food.restaurant'],
  cafe: ['food.cafe'],
  dessert: ['food.dessert', 'food.bakery'],
};

export const distanceBetweenMeters = distanceBetweenCoordinates;

/** PostgREST currently serializes PostGIS geography points as EWKB hex. */
export function coordinatesFromPostgisPoint(value: unknown): { latitude: number; longitude: number } | null {
  if (typeof value === 'object' && value !== null && 'coordinates' in value) {
    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(Number.isFinite)) return { longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) };
  }
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value) || value.length < 42 || value.length % 2 !== 0) return null;
  const bytes = Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  const view = new DataView(bytes.buffer);
  const littleEndian = view.getUint8(0) === 1;
  const geometryType = view.getUint32(1, littleEndian);
  const hasSrid = Boolean(geometryType & 0x20000000);
  const baseType = geometryType & 0x000000ff;
  const offset = hasSrid ? 9 : 5;
  if (baseType !== 1 || bytes.length < offset + 16) return null;
  const longitude = view.getFloat64(offset, littleEndian);
  const latitude = view.getFloat64(offset + 8, littleEndian);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export function budgetStatusForCandidate(place: Pick<PricedNearbyPlace, 'has_price' | 'pricing_basis' | 'estimated_group_min_minor' | 'estimated_group_max_minor'>, budgetMinor: number | null | undefined) {
  return classifyBudgetStatus(place, budgetMinor);
}

export function withPlanningBudgetStatus(candidates: readonly PricedNearbyPlace[], budgetMinor: number | null | undefined): PricedNearbyPlace[] {
  return candidates.map((place) => ({ ...place, budget_status: budgetStatusForCandidate(place, budgetMinor) }));
}

const uniqueByPlaceId = (candidates: readonly PricedNearbyPlace[]) => candidates.filter((place, index, all) => all.findIndex((candidate) => candidate.place_id === place.place_id) === index);

/** Reserve bounded space for relevance, nearby variety, and grounded budget evidence. */
export function composePlanningCandidatePool({ broad, budgetEvidence = [], explicitMatches = [], resultLimit }: { broad: readonly PricedNearbyPlace[]; budgetEvidence?: readonly PricedNearbyPlace[]; explicitMatches?: readonly PricedNearbyPlace[]; resultLimit: number }): PricedNearbyPlace[] {
  const explicit = uniqueByPlaceId(explicitMatches).slice(0, Math.min(PLANNING_EXPLICIT_MATCH_LIMIT, resultLimit));
  const explicitIds = new Set(explicit.map((place) => place.place_id));
  const budget = uniqueByPlaceId(budgetEvidence).filter((place) => !explicitIds.has(place.place_id)).slice(0, Math.min(PLANNING_BUDGET_EVIDENCE_LIMIT, Math.max(0, resultLimit - explicit.length)));
  const broadLimit = Math.max(0, resultLimit - explicit.length - budget.length);
  const primary = uniqueByPlaceId(broad).filter((place) => !explicitIds.has(place.place_id) && !budget.some((item) => item.place_id === place.place_id)).slice(0, broadLimit);
  const result = uniqueByPlaceId([...explicit, ...primary, ...budget]);
  for (const candidate of uniqueByPlaceId(broad)) {
    if (result.length >= resultLimit) break;
    if (!result.some((place) => place.place_id === candidate.place_id)) result.push(candidate);
  }
  return result.slice(0, resultLimit);
}
