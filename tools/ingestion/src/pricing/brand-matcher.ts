export const BRAND_MATCHING_RULE_VERSION = 'phase1_brand_reference_v1';

export type BrandDefinition = Readonly<{
  canonicalName: string;
  code: string;
  aliases: readonly string[];
  matchingRuleVersion: typeof BRAND_MATCHING_RULE_VERSION;
}>;

export const PHASE1_BRAND_DEFINITIONS: readonly BrandDefinition[] = [
  { canonicalName: 'Jollibee', code: 'jollibee', aliases: ['Jollibee'], matchingRuleVersion: BRAND_MATCHING_RULE_VERSION },
  { canonicalName: 'KFC', code: 'kfc', aliases: ['KFC'], matchingRuleVersion: BRAND_MATCHING_RULE_VERSION },
  { canonicalName: 'Mang Inasal', code: 'mang-inasal', aliases: ['Mang Inasal'], matchingRuleVersion: BRAND_MATCHING_RULE_VERSION },
];

export function normalizeBrandName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[’']/gu, '').replace(/[^a-z0-9]+/gu, ' ').trim();
}

/**
 * Phase 1 intentionally accepts exact names and explicitly-qualified names,
 * never substring or fuzzy matches. A qualified name must start with an alias
 * at a word boundary, so "Jolly Bee Cafe" cannot inherit Jollibee pricing.
 */
export function matchesBrandName(placeName: string, definition: BrandDefinition): boolean {
  const normalizedPlace = normalizeBrandName(placeName);
  return definition.aliases.some((alias) => {
    const normalizedAlias = normalizeBrandName(alias);
    return normalizedPlace === normalizedAlias || normalizedPlace.startsWith(`${normalizedAlias} `);
  });
}

export function matchBrandName(placeName: string, definitions = PHASE1_BRAND_DEFINITIONS): BrandDefinition | null {
  const matches = definitions.filter((definition) => matchesBrandName(placeName, definition));
  return matches.length === 1 ? matches[0]! : null;
}
