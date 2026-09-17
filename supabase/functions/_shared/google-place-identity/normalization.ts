const COMPANY_SUFFIXES = new Set(["inc", "incorporated", "corp", "corporation", "ltd", "limited", "llc"]);

const GENERIC_NAME_DESCRIPTORS = new Set([
  "bakery",
  "bar",
  "branch",
  "cafe",
  "coffee",
  "garden",
  "grill",
  "grille",
  "grocery",
  "restaurant",
  "restobar",
  "store",
  "tea",
  "theater",
  "theatre",
  "and",
  "at",
  "in",
  "of",
  "the",
]);

const CHAIN_BRANDS = [
  "the coffee bean and tea leaf",
  "macao imperial tea",
  "coco fresh tea and juice",
  "army navy burger and burrito",
  "seattles best coffee",
  "mang inasal",
  "burger king",
  "pizza hut",
  "pancake house",
  "yellow cab",
  "shakeys pizza",
  "the french baker",
  "maxs restaurant",
  "pickup coffee",
  "zus coffee",
  "chatime",
  "serenitea",
  "infinitea",
  "mercury drug",
  "watsons",
  "southstar drug",
  "rose pharmacy",
  "generika drugstore",
  "the generics pharmacy",
  "uncle johns",
  "familymart",
  "alfamart",
  "ministop",
  "anytime fitness",
  "fitness first",
  "golds gym",
  "surge fitness",
  "sm cinema",
  "ayala malls cinemas",
  "robinsons movieworld",
  "vista cinemas",
  "megaworld cinemas",
  "jollibee",
  "mcdonalds",
  "mc donalds",
  "kfc",
  "starbucks",
  "chowking",
  "burger king",
  "seven eleven",
  "7 eleven",
] as const;

const BRANCH_GENERIC_TOKENS = new Set([...GENERIC_NAME_DESCRIPTORS, "cinema", "gym"]);

export function normalizeGoogleMatchingText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("und")
    .replace(/[\u00b4\u02bc\u2018\u2019`]/gu, "'")
    .replace(/([\p{L}\p{N}])'([\p{L}\p{N}])/gu, "$1$2")
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeGooglePlaceName(value: string | null | undefined): string {
  const tokens = normalizeGoogleMatchingText(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens.at(-1)!)) tokens.pop();
  return tokens.join(" ");
}

export function tokenizeGoogleMatchingText(value: string | null | undefined): readonly string[] {
  return normalizeGoogleMatchingText(value).split(" ").filter(Boolean);
}

function dice(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const remaining = [...right];
  let common = 0;
  for (const item of left) {
    const index = remaining.indexOf(item);
    if (index >= 0) {
      common += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * common) / (left.length + right.length);
}

function bigrams(value: string): readonly string[] {
  if (value.length < 2) return value ? [value] : [];
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
}

function compactName(value: string): string {
  return value.replace(/[^\p{L}\p{N}]/gu, "");
}

function descriptorWeight(token: string): number {
  return GENERIC_NAME_DESCRIPTORS.has(token) ? 0.2 : 1;
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 5) return 0;
  const score = dice(bigrams(left), bigrams(right));
  return score >= 0.8 ? score : 0;
}

function weightedTokenSupport(left: readonly string[], right: readonly string[]): number {
  const totalWeight = left.reduce((total, token) => total + descriptorWeight(token), 0);
  if (totalWeight === 0 || right.length === 0) return 0;
  const remaining = [...right];
  let matchedWeight = 0;
  for (const token of left) {
    let bestIndex = -1;
    let bestSimilarity = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      const similarity = tokenSimilarity(token, remaining[index]!);
      if (similarity > bestSimilarity) {
        bestIndex = index;
        bestSimilarity = similarity;
      }
    }
    if (bestIndex >= 0) {
      matchedWeight += descriptorWeight(token) * bestSimilarity;
      remaining.splice(bestIndex, 1);
    }
  }
  return matchedWeight / totalWeight;
}

function informativeTokens(tokens: readonly string[]): readonly string[] {
  return tokens.filter((token) => !GENERIC_NAME_DESCRIPTORS.has(token));
}

function containmentSimilarity(left: readonly string[], right: readonly string[]): number {
  const leftSupport = weightedTokenSupport(left, right);
  const rightSupport = weightedTokenSupport(right, left);
  const leftWeight = left.reduce((total, token) => total + descriptorWeight(token), 0);
  const rightWeight = right.reduce((total, token) => total + descriptorWeight(token), 0);
  const shorterSupport = leftWeight <= rightWeight ? leftSupport : rightSupport;
  const longerSupport = leftWeight <= rightWeight ? rightSupport : leftSupport;
  return shorterSupport * (0.82 + (0.18 * longerSupport));
}

function leadingCoreSimilarity(
  normalizedLeft: string,
  normalizedRight: string,
  compactLeft: string,
  compactRight: string,
  leftTokens: readonly string[],
  rightTokens: readonly string[],
): number {
  const shorterNormalized = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight;
  const longerNormalized = normalizedLeft.length <= normalizedRight.length ? normalizedRight : normalizedLeft;
  if (longerNormalized.startsWith(`${shorterNormalized} `)) return 0.96;

  const shorterCompact = compactLeft.length <= compactRight.length ? compactLeft : compactRight;
  const longerCompact = compactLeft.length <= compactRight.length ? compactRight : compactLeft;
  const shorterTokens = compactLeft.length <= compactRight.length ? leftTokens : rightTokens;
  const sufficientlyDistinctive = shorterCompact.length >= 8 || shorterTokens.length >= 2;
  return sufficientlyDistinctive && longerCompact.startsWith(shorterCompact) ? 0.92 : 0;
}

export function googlePlaceNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeGooglePlaceName(left);
  const normalizedRight = normalizeGooglePlaceName(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  const leftTokens = normalizedLeft.split(" ");
  const rightTokens = normalizedRight.split(" ");
  if (informativeTokens(leftTokens).length === 0 || informativeTokens(rightTokens).length === 0) {
    return normalizedLeft === normalizedRight ? 0.25 : 0;
  }
  if (normalizedLeft === normalizedRight) return 1;

  const compactLeft = compactName(normalizedLeft);
  const compactRight = compactName(normalizedRight);
  if (compactLeft === compactRight) return 1;

  const normalizedCharacterScore = dice(bigrams(normalizedLeft), bigrams(normalizedRight));
  const compactCharacterScore = dice(bigrams(compactLeft), bigrams(compactRight));
  const balancedTokenScore = (weightedTokenSupport(leftTokens, rightTokens) + weightedTokenSupport(rightTokens, leftTokens)) / 2;
  const baseScore = (normalizedCharacterScore * 0.35) + (compactCharacterScore * 0.35) + (balancedTokenScore * 0.30);
  const informativeSupport = Math.max(
    weightedTokenSupport(informativeTokens(leftTokens), informativeTokens(rightTokens)),
    weightedTokenSupport(informativeTokens(rightTokens), informativeTokens(leftTokens)),
  );
  const leadingCoreScore = leadingCoreSimilarity(
    normalizedLeft,
    normalizedRight,
    compactLeft,
    compactRight,
    leftTokens,
    rightTokens,
  );
  if (informativeSupport === 0 && leadingCoreScore === 0) return roundScore(Math.min(baseScore, 0.35));
  return roundScore(Math.max(baseScore, containmentSimilarity(leftTokens, rightTokens), leadingCoreScore));
}

export function knownChainBrand(value: string): string | null {
  const normalized = normalizeGooglePlaceName(value);
  return CHAIN_BRANDS.find((brand) => normalized === brand || normalized.startsWith(`${brand} `) || normalized.includes(` ${brand} `)) ?? null;
}

export function branchTokens(value: string): readonly string[] {
  const normalized = normalizeGooglePlaceName(value);
  const brand = knownChainBrand(normalized);
  const brandTokens = new Set(brand?.split(" ") ?? []);
  return normalized.split(" ").filter((token) => token && !brandTokens.has(token) && !BRANCH_GENERIC_TOKENS.has(token));
}

export function tokenOverlap(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length / left.length;
}

export function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}
