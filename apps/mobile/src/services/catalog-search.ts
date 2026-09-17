import type { PricedNearbyPlace } from './places';

export type CatalogSearchCandidate = PricedNearbyPlace & Readonly<{
  name_match_score: number;
  locality_match_score: number;
}>;

export type CatalogSearchRequest = Readonly<{
  query: string;
  localityHint?: string | null;
  coordinates?: { latitude: number; longitude: number } | null;
  budgetMinor?: number | null;
  partySize?: number;
  resultLimit?: number;
}>;

const venueCue = /\b(?:at|visit|try|to)\s+(.+?)(?=\s+(?:in|near|around|for|with|after|before|under|within|tonight|today|tomorrow)\b|[,.;!?]|$)/i;
const quotedVenue = /["“]([^"”]{2,120})["”]/;
const genericVenueTokens = new Set([
  'a', 'an', 'and', 'at', 'breakfast', 'brunch', 'cafe', 'coffee', 'date', 'dinner',
  'drinks', 'eat', 'food', 'for', 'go', 'in', 'lunch', 'meal', 'near', 'place',
  'restaurant', 'spot', 'the', 'to', 'tonight', 'try', 'visit', 'with',
]);

export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/['’`]+/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isDistinctiveVenueQuery(value: string, localityHint?: string | null): boolean {
  const normalized = normalizeCatalogText(value).replace(/^(?:a|an|the)\s+/, '');
  if (!normalized || normalized === normalizeCatalogText(localityHint ?? '')) return false;
  return normalized.split(' ').some((token) => token.length >= 3 && !genericVenueTokens.has(token) && !/^\d+$/.test(token));
}

/** Extract only phrases introduced as a venue, leaving generic prompts on normal Ask Wise. */
export function explicitVenueQueryFromPrompt(prompt: string, localityHint?: string | null): string | null {
  const quoted = prompt.match(quotedVenue)?.[1];
  const cued = quoted ?? prompt.match(venueCue)?.[1];
  if (!cued) return null;
  const candidate = cued.trim().replace(/^(?:a|an|the)\s+/i, '');
  return isDistinctiveVenueQuery(candidate, localityHint) ? candidate : null;
}

function tokenCoverage(query: string, candidateName: string): number {
  const queryTokens = normalizeCatalogText(query).split(' ').filter((token) => token && !genericVenueTokens.has(token));
  if (!queryTokens.length) return 0;
  const candidateTokens = new Set(normalizeCatalogText(candidateName).split(' '));
  return queryTokens.filter((token) => candidateTokens.has(token)).length / queryTokens.length;
}

export function hasStrongCatalogNameEvidence(query: string, candidate: CatalogSearchCandidate): boolean {
  const normalizedQuery = normalizeCatalogText(query);
  const normalizedName = normalizeCatalogText(candidate.name);
  if (!normalizedQuery || !normalizedName) return false;
  if (normalizedQuery === normalizedName) return true;
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const compactName = normalizedName.replace(/\s+/g, '');
  if (compactQuery.length >= 4 && compactName.includes(compactQuery)) return true;
  if (normalizedName.includes(normalizedQuery) && normalizedQuery.length >= 4 && tokenCoverage(query, candidate.name) >= 0.75) return true;
  return candidate.name_match_score >= 0.72 && tokenCoverage(query, candidate.name) >= 0.75;
}

/** Reject weak fuzzy matches; requested geography chooses among strong catalog names. */
export function chooseConfidentCatalogAnchor(
  query: string,
  candidates: readonly CatalogSearchCandidate[],
  hasRequestedGeography: boolean,
): CatalogSearchCandidate | null {
  const strong = candidates.filter((candidate) => hasStrongCatalogNameEvidence(query, candidate));
  if (!strong.length) return null;
  const geographicallyPlausible = hasRequestedGeography
    ? strong.filter((candidate) => candidate.locality_match_score >= 0.70 || (candidate.distance_meters !== null && candidate.distance_meters <= 25_000))
    : strong;
  if (!geographicallyPlausible.length) return null;
  return [...geographicallyPlausible].sort((left, right) => {
    if (hasRequestedGeography && right.locality_match_score !== left.locality_match_score) return right.locality_match_score - left.locality_match_score;
    if (right.name_match_score !== left.name_match_score) return right.name_match_score - left.name_match_score;
    return (left.distance_meters ?? Number.POSITIVE_INFINITY) - (right.distance_meters ?? Number.POSITIVE_INFINITY);
  })[0] ?? null;
}

export async function resolveNamedCatalogPlace({
  prompt,
  localityHint,
  coordinates,
  budgetMinor,
  partySize,
  search,
}: Readonly<{
  prompt: string;
  localityHint?: string | null;
  coordinates?: { latitude: number; longitude: number } | null;
  budgetMinor?: number | null;
  partySize?: number;
  search: (request: CatalogSearchRequest) => Promise<CatalogSearchCandidate[]>;
}>): Promise<CatalogSearchCandidate | null> {
  const query = explicitVenueQueryFromPrompt(prompt, localityHint);
  if (!query) return null;
  const candidates = await search({ query, localityHint, coordinates, budgetMinor, partySize, resultLimit: 8 });
  return chooseConfidentCatalogAnchor(query, candidates, Boolean(localityHint?.trim()));
}
