export type PlanningStageFamily = 'food' | 'cafe' | 'dessert' | 'recreation' | 'cinema' | 'outdoor' | 'attraction' | 'culture' | 'entertainment' | 'activity' | 'unknown';

/** Taxonomy-only family mapping; no venue suitability is inferred here. */
export function stageFamilyForCategoryCode(categoryCode: string | null | undefined): PlanningStageFamily {
  if (!categoryCode) return 'unknown';
  if (categoryCode === 'food.cafe') return 'cafe';
  if (categoryCode === 'food.dessert' || categoryCode === 'food.bakery') return 'dessert';
  if (categoryCode === 'food' || categoryCode.startsWith('food.')) return 'food';
  if (categoryCode === 'activity.recreation' || categoryCode.startsWith('activity.recreation.')) return 'recreation';
  if (categoryCode === 'entertainment.cinema' || categoryCode.startsWith('entertainment.cinema.')) return 'cinema';
  if (categoryCode === 'outdoor' || categoryCode.startsWith('outdoor.')) return 'outdoor';
  if (categoryCode === 'attraction.museum' || categoryCode.startsWith('attraction.museum.') || categoryCode === 'attraction.culture' || categoryCode.startsWith('attraction.culture.')) return 'culture';
  if (categoryCode === 'attraction' || categoryCode.startsWith('attraction.')) return 'attraction';
  if (categoryCode === 'entertainment' || categoryCode.startsWith('entertainment.')) return 'entertainment';
  if (categoryCode === 'activity' || categoryCode.startsWith('activity.')) return 'activity';
  return 'unknown';
}

export function stageFamilyForCategoryCodes(categoryCodes: readonly string[]): PlanningStageFamily {
  const families = categoryCodes.map(stageFamilyForCategoryCode).filter((family) => family !== 'unknown');
  return families[0] ?? 'unknown';
}

/** Compatibility mapping used by the existing manual catalog-place flow. */
export function selectionConstraintForCategoryCode(categoryCode: string | null | undefined): string {
  if (categoryCode === 'food.cafe') return 'cafe';
  if (categoryCode === 'food.dessert' || categoryCode === 'food.bakery') return 'dessert';
  if (categoryCode?.startsWith('food')) return 'food';
  if (categoryCode === 'activity.recreation') return 'recreation';
  if (categoryCode === 'entertainment.cinema') return 'cinema';
  if (categoryCode?.startsWith('outdoor')) return 'outdoor';
  if (categoryCode?.startsWith('attraction')) return 'attraction';
  if (categoryCode?.startsWith('entertainment')) return 'entertainment';
  return 'generic_activity';
}

/** Alternates requested families without creating additional unsupported stages. */
export function alternateStageFamilies(families: readonly PlanningStageFamily[], maxStages: number): PlanningStageFamily[] {
  if (!Number.isSafeInteger(maxStages) || maxStages <= 0) return [];
  const result: PlanningStageFamily[] = [];
  for (const family of families) {
    if (result.length >= maxStages) break;
    if (result.at(-1) === family && families.length > result.length) {
      const next = families.find((candidate, index) => index >= result.length && candidate !== family);
      if (next) { result.push(next); continue; }
    }
    result.push(family);
  }
  return result;
}
