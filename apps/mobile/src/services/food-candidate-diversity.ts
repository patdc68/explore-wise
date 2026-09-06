import type { AskWiseIntent, FoodFocus, OutingContext } from './ask-wise-normalization';
import type { PricedNearbyPlace } from './places';

type ChainAwarePlace = PricedNearbyPlace & { chain_id?: string | null };
export type StageRankingContext = Readonly<{
  explicitQuickService?: boolean;
  explicitNightlife?: boolean;
  activityFocus?: 'recreation' | 'cinema' | 'museum' | 'outdoor' | 'landmark' | 'auditorium' | null;
  foodFocus?: FoodFocus;
  outingContext?: OutingContext;
  budgetMinor?: number | null;
  partySize?: number | null;
  currencyCode?: string | null;
}>;

export type AffordabilityPressure = 'strong' | 'moderate' | 'normal' | 'weak';

/** Internal centavo thresholds. Add currencies here only with market-specific tuning. */
export const FOOD_AFFORDABILITY_BANDS_MINOR = Object.freeze({
  PHP: Object.freeze({ strongMax: 40_000, moderateMax: 65_000, normalMax: 100_000 }),
});

export function deriveBudgetPerPersonMinor(budgetMinor: number | null | undefined, partySize: number | null | undefined): number | null {
  if (!Number.isSafeInteger(budgetMinor) || (budgetMinor ?? -1) < 0 || !Number.isSafeInteger(partySize) || (partySize ?? 0) < 1) return null;
  return Math.floor(budgetMinor! / partySize!);
}

export function affordabilityPressureFor(budgetPerPersonMinor: number | null, currencyCode: string | null | undefined): AffordabilityPressure | null {
  if (budgetPerPersonMinor === null || currencyCode?.toUpperCase() !== 'PHP') return null;
  const bands = FOOD_AFFORDABILITY_BANDS_MINOR.PHP;
  if (budgetPerPersonMinor <= bands.strongMax) return 'strong';
  if (budgetPerPersonMinor <= bands.moderateMax) return 'moderate';
  if (budgetPerPersonMinor <= bands.normalMax) return 'normal';
  return 'weak';
}

export function stageRankingContextFromIntent(intent: Pick<AskWiseIntent, 'explicitQuickService' | 'explicitNightlife' | 'foodFocus' | 'outingContext' | 'budgetMinor' | 'partySize' | 'currencyCode'> | null | undefined, activityFocus: StageRankingContext['activityFocus'] = null): StageRankingContext {
  return {
    explicitQuickService: intent?.explicitQuickService,
    explicitNightlife: intent?.explicitNightlife,
    activityFocus,
    foodFocus: intent?.foodFocus,
    outingContext: intent?.outingContext,
    budgetMinor: intent?.budgetMinor,
    partySize: intent?.partySize,
    currencyCode: intent?.currencyCode,
  };
}

const knownQuickServicePrefix = /^(jollibee|kfc|mang inasal|mcdonald'?s)\b/i;

/** Existing chain metadata wins. The compact fallback is limited to known QSR brands. */
export function foodChainKey(place: ChainAwarePlace): string | null {
  if (place.chain_id) return place.chain_id;
  const namedBrand = place.name.match(knownQuickServicePrefix)?.[1];
  return namedBrand?.toLowerCase().replace(/['’]/g, '') ?? null;
}

export function isQuickService(place: PricedNearbyPlace): boolean {
  const category = `${place.category_code ?? ''} ${place.category_name ?? ''}`.toLowerCase();
  return /fast\s*food|quick\s*service|\bqsr\b/.test(category) || Boolean(place.name.match(knownQuickServicePrefix));
}

const isRelevantFood = (place: PricedNearbyPlace) => {
  const category = `${place.category_code ?? ''} ${place.category_name ?? ''}`.toLowerCase();
  return category.includes('food') || /restaurant|cafe|café|bakery|dessert|dining/.test(category);
};

const uniquePlaces = (candidates: readonly PricedNearbyPlace[]) => candidates.filter((place, index, all) => all.findIndex((candidate) => candidate.place_id === place.place_id) === index);

const deferDuplicateChains = (candidates: readonly PricedNearbyPlace[]) => {
  const first: PricedNearbyPlace[] = [];
  const duplicates: PricedNearbyPlace[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const chain = foodChainKey(candidate);
    if (chain && seen.has(chain)) duplicates.push(candidate);
    else { if (chain) seen.add(chain); first.push(candidate); }
  }
  return [...first, ...duplicates];
};

type FoodVenueKind = 'restaurant' | 'meal' | 'cafe' | 'bakery' | 'dessert' | 'other';
const foodVenueKind = (place: PricedNearbyPlace): FoodVenueKind => {
  const category = `${place.category_code ?? ''} ${place.category_name ?? ''}`.toLowerCase();
  if (/food\.restaurant|\brestaurant\b/.test(category)) return 'restaurant';
  if (/\bdining\b|\bmeal\b/.test(category)) return 'meal';
  if (/food\.cafe|\bcaf(?:e|Ã©)\b/.test(category)) return 'cafe';
  if (/food\.bakery|\bbakery\b/.test(category)) return 'bakery';
  if (/food\.dessert|\bdessert\b|ice cream|\bsweet\b/.test(category)) return 'dessert';
  return 'other';
};

export type ExplicitFoodMatchLevel = 'strong' | 'related' | 'none';

const foodEvidence = (place: PricedNearbyPlace) => `${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`.toLowerCase();
const explicitFoodTerm: Record<Exclude<FoodFocus, null | 'restaurant' | 'cafe' | 'dessert' | 'fast_food'>, RegExp> = {
  ramen: /\bramen\b/i,
  pizza: /\bpizza\b/i,
  sushi: /\bsushi\b/i,
  burger: /\bburgers?\b/i,
};

/** Match only evidence carried by the place record; never infer venue claims. */
export function explicitFoodMatchLevel(place: PricedNearbyPlace, focus: Exclude<FoodFocus, null>): ExplicitFoodMatchLevel {
  const kind = foodVenueKind(place);
  const evidence = foodEvidence(place);
  if (focus === 'fast_food') return isQuickService(place) ? 'strong' : 'none';
  if (focus === 'restaurant') return !isQuickService(place) && (kind === 'restaurant' || kind === 'meal') ? 'strong' : 'none';
  if (focus === 'cafe') return kind === 'cafe' || /\b(?:coffee|cafe|cafÃ©)\b/i.test(evidence) ? 'strong' : 'none';
  if (focus === 'dessert') return kind === 'dessert' || kind === 'bakery' || /\b(?:dessert|ice cream|cake|sweets?)\b/i.test(evidence) ? 'strong' : 'none';
  if (explicitFoodTerm[focus].test(evidence)) return 'strong';
  if ((focus === 'ramen' || focus === 'sushi') && /\bjapanese\b/i.test(evidence) && !isQuickService(place)) return 'related';
  return 'none';
}

export const foodFocusLabel = (focus: Exclude<FoodFocus, null>) => focus === 'fast_food' ? 'fast food' : focus;

const foodRelevance = (place: PricedNearbyPlace, focus: FoodFocus = null) => {
  const kind = foodVenueKind(place);
  const order: Record<FoodVenueKind, number> = focus === 'cafe'
    ? { cafe: 0, restaurant: 1, meal: 2, dessert: 3, bakery: 4, other: 5 }
    : focus === 'dessert'
      ? { dessert: 0, bakery: 1, cafe: 2, restaurant: 3, meal: 4, other: 5 }
      : { restaurant: 0, meal: 1, cafe: 2, bakery: 3, dessert: 4, other: 5 };
  return order[kind];
};

const stableFoodRelevanceOrder = (candidates: readonly PricedNearbyPlace[], focus: FoodFocus) => candidates
  .map((place, index) => ({ place, index }))
  .sort((left, right) => {
    if (focus === 'ramen') {
      const ramen = (place: PricedNearbyPlace) => /\bramen\b/i.test(`${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`) ? 0 : foodVenueKind(place) === 'restaurant' ? 1 : 2;
      return ramen(left.place) - ramen(right.place) || left.index - right.index;
    }
    return foodRelevance(left.place, focus) - foodRelevance(right.place, focus) || left.index - right.index;
  })
  .map(({ place }) => place);

/**
 * Generic food is restaurant-led. Price evidence stays available to the budget
 * layer, but it is not a proxy for relevance when the user did not ask for QSR.
 */
const adultOrientedType = /\b(?:bar|nightclub|night club|adult entertainment|casino)\b/i;
const contextualFoodOrder = (candidates: readonly PricedNearbyPlace[], context: Pick<StageRankingContext, 'outingContext' | 'explicitNightlife'>) => candidates.map((place, index) => {
  const kind = foodVenueKind(place);
  const type = `${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`;
  let score = 0;
  if (context.outingContext === 'date') {
    score += kind === 'restaurant' ? 3 : kind === 'cafe' ? 2 : isQuickService(place) ? -2 : 0;
    if (adultOrientedType.test(type) && !context.explicitNightlife) score -= 2;
  }
  if (context.outingContext === 'family' && adultOrientedType.test(type)) score -= 20;
  return { place, index, score };
}).sort((left, right) => right.score - left.score || left.index - right.index).map(({ place }) => place);

const groundedBudgetStatus = (place: PricedNearbyPlace) => place.has_price && place.estimated_group_min_minor !== null && place.estimated_group_max_minor !== null ? place.budget_status : 'unknown';
const foodDistance = (place: PricedNearbyPlace) => Number.isFinite(place.distance_meters) ? place.distance_meters : Number.POSITIVE_INFINITY;

const explicitFoodScore = (place: PricedNearbyPlace, context: StageRankingContext) => {
  const focus = context.explicitQuickService ? 'fast_food' : context.foodFocus;
  if (!focus) return 0;
  const level = explicitFoodMatchLevel(place, focus);
  return level === 'strong' ? 1_000 : level === 'related' ? 500 : 0;
};

const categoryScore = (place: PricedNearbyPlace, focus: FoodFocus) => {
  const relevance = focus === 'ramen'
    ? (/\bramen\b/i.test(`${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`) ? 0 : foodVenueKind(place) === 'restaurant' ? 1 : 2)
    : foodRelevance(place, focus);
  return (5 - relevance) * 8;
};

const contextFoodScore = (place: PricedNearbyPlace, context: StageRankingContext) => {
  const kind = foodVenueKind(place);
  const quick = isQuickService(place);
  const type = `${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`;
  let score = 0;
  if (context.outingContext === 'date') {
    score += quick ? -8 : kind === 'restaurant' || kind === 'meal' ? 28 : kind === 'cafe' ? 20 : 0;
    if (adultOrientedType.test(type) && !context.explicitNightlife) score -= 20;
  }
  if (context.outingContext === 'family' && adultOrientedType.test(type)) score -= 100;
  return score;
};

const budgetFoodScore = (place: PricedNearbyPlace, context: StageRankingContext, pressure: AffordabilityPressure) => {
  const quick = isQuickService(place);
  const status = groundedBudgetStatus(place);
  const fits = status === 'fits' || status === 'likely_fits';
  const mayExceed = status === 'may_exceed';
  const exceeds = status === 'exceeds' || status === 'likely_exceeds';
  let score = 0;
  if (pressure === 'strong') score += fits ? 30 : mayExceed ? -18 : exceeds ? -50 : -15;
  else if (pressure === 'moderate') score += fits ? 22 : mayExceed ? -12 : exceeds ? -40 : 0;
  else if (pressure === 'normal') score += fits ? 8 : mayExceed ? -8 : exceeds ? -28 : 0;
  else score += fits ? 3 : mayExceed ? -5 : exceeds ? -20 : 0;
  if (quick) score += pressure === 'strong' ? 34 : pressure === 'moderate' ? 34 : pressure === 'normal' ? -5 : -12;
  if (quick && context.partySize !== null && context.partySize !== undefined && context.partySize >= 4 && (pressure === 'strong' || pressure === 'moderate')) score += 8;
  return score;
};

const scoredFoodOrder = (candidates: readonly PricedNearbyPlace[], context: StageRankingContext, pressure: AffordabilityPressure) => candidates
  .map((place, index) => ({
    place,
    index,
    score: explicitFoodScore(place, context) + categoryScore(place, context.foodFocus ?? null) + contextFoodScore(place, context) + budgetFoodScore(place, context, pressure),
  }))
  .sort((left, right) => right.score - left.score || foodDistance(left.place) - foodDistance(right.place) || left.index - right.index)
  .map(({ place }) => place);

/** No-budget pricing is deliberately last: it can only break an otherwise contextual distance tie. */
const noBudgetFoodOrder = (candidates: readonly PricedNearbyPlace[], context: StageRankingContext) => candidates
  .map((place, index) => ({ place, index }))
  .sort((left, right) => explicitFoodScore(right.place, context) - explicitFoodScore(left.place, context)
    || categoryScore(right.place, context.foodFocus ?? null) - categoryScore(left.place, context.foodFocus ?? null)
    || contextFoodScore(right.place, context) - contextFoodScore(left.place, context)
    || foodDistance(left.place) - foodDistance(right.place)
    || Number(groundedBudgetStatus(right.place) !== 'unknown') - Number(groundedBudgetStatus(left.place) !== 'unknown')
    || left.index - right.index)
  .map(({ place }) => place);

const limitQuickServiceRun = (ranked: readonly PricedNearbyPlace[]) => {
  const quick = ranked.filter(isQuickService);
  const regular = ranked.filter((place) => !isQuickService(place));
  if (!quick.length || !regular.length) return [...ranked];
  const result: PricedNearbyPlace[] = [];
  let quickIndex = 0; let regularIndex = 0; let quickRun = 0;
  for (const candidate of ranked) {
    if (result.includes(candidate)) continue;
    if (isQuickService(candidate) && quickRun >= 2 && regular[regularIndex]) {
      result.push(regular[regularIndex++]!); quickRun = 0;
      while (quickIndex < quick.length && result.includes(quick[quickIndex]!)) quickIndex += 1;
    }
    if (!result.includes(candidate)) {
      result.push(candidate);
      if (isQuickService(candidate)) { quickRun += 1; quickIndex += 1; }
      else { quickRun = 0; regularIndex += 1; }
    }
  }
  return result;
};

export function diversifyFoodCandidates(candidates: readonly PricedNearbyPlace[], context: StageRankingContext = {}): PricedNearbyPlace[] {
  const uniqueFood = uniquePlaces(candidates).filter(isRelevantFood);
  const budgetPerPersonMinor = deriveBudgetPerPersonMinor(context.budgetMinor, context.partySize);
  const pressure = affordabilityPressureFor(budgetPerPersonMinor, context.currencyCode);
  const ranked = deferDuplicateChains(pressure
    ? scoredFoodOrder(uniqueFood, context, pressure)
    : context.budgetMinor === null || context.budgetMinor === undefined
      ? noBudgetFoodOrder(uniqueFood, context)
      : contextualFoodOrder(stableFoodRelevanceOrder(uniqueFood, context.foodFocus ?? null), context));
  const quickService = ranked.filter(isQuickService);
  const regular = ranked.filter((place) => !isQuickService(place));
  if (context.explicitQuickService) return [...quickService, ...regular];

  if (pressure === 'strong' || pressure === 'moderate') return limitQuickServiceRun(ranked);

  // Three regular restaurants lead a generic outing when inventory permits;
  // a QSR remains a valid varied option rather than the default whole list.
  const leadingRegular = regular.slice(0, 3);
  const rest: PricedNearbyPlace[] = [...leadingRegular];
  if (quickService[0]) rest.push(quickService[0]);
  rest.push(...regular.slice(3), ...quickService.slice(1));
  return rest;
}

export type FoodCandidatePool = Readonly<{
  mode: 'generic_food' | 'explicit_food' | 'explicit_food_related' | 'explicit_food_no_match';
  explicitFocus: Exclude<FoodFocus, null> | null;
  eligible: PricedNearbyPlace[];
  broader: PricedNearbyPlace[];
  ordered: PricedNearbyPlace[];
}>;

/** Explicit food intent defines the primary eligible pool before any score is calculated. */
export function buildFoodCandidatePool(candidates: readonly PricedNearbyPlace[], context: StageRankingContext = {}, stageFocus: FoodFocus = null): FoodCandidatePool {
  const uniqueFood = uniquePlaces(candidates).filter(isRelevantFood);
  const explicitFocus = context.explicitQuickService ? 'fast_food' : context.foodFocus ?? null;
  const effectiveContext = { ...context, foodFocus: context.foodFocus ?? stageFocus };
  if (!explicitFocus) {
    const eligible = diversifyFoodCandidates(uniqueFood, effectiveContext);
    return { mode: 'generic_food', explicitFocus: null, eligible, broader: [], ordered: eligible };
  }

  const strong = uniqueFood.filter((place) => explicitFoodMatchLevel(place, explicitFocus) === 'strong');
  const related = strong.length ? [] : uniqueFood.filter((place) => explicitFoodMatchLevel(place, explicitFocus) === 'related');
  const matchPool = strong.length ? strong : related;
  const matchedIds = new Set(matchPool.map((place) => place.place_id));
  const eligible = diversifyFoodCandidates(matchPool, effectiveContext);
  const broader = diversifyFoodCandidates(uniqueFood.filter((place) => !matchedIds.has(place.place_id)), { ...context, explicitQuickService: false, foodFocus: stageFocus });
  const mode = strong.length ? 'explicit_food' : related.length ? 'explicit_food_related' : 'explicit_food_no_match';
  return { mode, explicitFocus, eligible, broader, ordered: [...eligible, ...broader] };
}

export const ACTIVITY_CATEGORY_CODES = ['activity.recreation', 'entertainment', 'entertainment.cinema', 'outdoor', 'outdoor.park', 'attraction', 'attraction.museum', 'attraction.culture'] as const;
export type ActivityFamily = 'recreation' | 'entertainment' | 'cinema' | 'outdoor' | 'attraction' | 'culture';

export function activityFamily(place: Pick<PricedNearbyPlace, 'category_code'>): ActivityFamily | null {
  const code = place.category_code ?? '';
  if (code === 'activity.recreation' || code.startsWith('activity.recreation.')) return 'recreation';
  if (code === 'entertainment.cinema' || code.startsWith('entertainment.cinema.')) return 'cinema';
  if (code === 'entertainment' || code.startsWith('entertainment.')) return 'entertainment';
  if (code === 'outdoor' || code.startsWith('outdoor.')) return 'outdoor';
  if (code === 'attraction.museum' || code.startsWith('attraction.museum.') || code === 'attraction.culture' || code.startsWith('attraction.culture.')) return 'culture';
  if (code === 'attraction' || code.startsWith('attraction.')) return 'attraction';
  return null;
}

const administrativeDestination = /\b(barangay hall|city hall|municipal hall|government (?:office|service|building)|administrative office|public works|social welfare|permit(?:s)? office|tax office)\b/i;
const institutionalContext = /\b(?:university|college|school|academy|campus|faculty|medical(?:\s+sciences|\s+school)?|hospital|clinic|health(?:care)?|department|government|barangay|municipal|administrative|corporate|company|utility|infrastructure)\b/i;
const institutionalFacility = /\b(?:auditorium|lecture hall|hall|office|building|facility|center)\b/i;
const publicLeisureEvidence = /\b(?:cinema|movie(?: theater)?|theat(?:re|er)|performing arts|concert|museum|gallery|visitor(?:s)? center|tourist|public exhibit|cultural attraction)\b/i;
const consumerLeisureType = /\b(museum|cinema|movie(?: theater)?|gallery|monument|landmark|heritage|tourist|visitor(?:s)? center|cultural (?:center|attraction)|park|recreation|bowling|arcade|amusement|sports? (?:center|complex|venue)|theat(?:re|er)|entertainment)\b/i;
const specificLeisureType = /\b(museum|cinema|movie(?: theater)?|gallery|monument|landmark|heritage|tourist|visitor(?:s)? center|cultural (?:center|attraction)|park|bowling|arcade|amusement|sports? (?:center|complex|venue)|theat(?:re|er))\b/i;
const ambiguousBusinessType = /\b(?:studio|office|headquarters|hq|corporate)\b/i;
const landmarkType = /\b(?:monument|landmark|memorial)\b/i;
const meaningfulLandmarkType = /\b(?:heritage|historic(?:al)?|national|tourist(?:\s+attraction)?|visitor(?:s)? center|landmark)\b/i;

/** Taxonomy answers eligibility; this deterministic layer ranks consumer outing suitability. */
export function outingSuitabilityScore(place: Pick<PricedNearbyPlace, 'name' | 'category_name' | 'category_code'>): number {
  const category = `${place.category_name ?? ''} ${place.category_code ?? ''}`;
  const name = place.name ?? '';
  const family = activityFamily(place);
  const categoryClearlyLeisure = specificLeisureType.test(category) || family === 'cinema';
  const nameClearlyLeisure = consumerLeisureType.test(name);
  if (administrativeDestination.test(category) || (administrativeDestination.test(name) && !categoryClearlyLeisure && !nameClearlyLeisure)) return -50;
  const combined = `${name} ${category}`;
  const categoryScore: Record<ActivityFamily | 'other', number> = { cinema: 70, culture: 62, outdoor: 56, entertainment: 64, recreation: 66, attraction: 52, other: 15 };
  let score = categoryScore[family ?? 'other'];
  // A monument/marker is eligible, but a name-only marker is usually a weaker
  // generic destination than consumer leisure inventory. Tourism/heritage
  // evidence preserves meaningful landmarks without maintaining name lists.
  if (landmarkType.test(combined) && !meaningfulLandmarkType.test(combined)) score -= 28;
  if (meaningfulLandmarkType.test(combined)) score += 8;
  if (nameClearlyLeisure) score += 6;
  // A name is only a weak fallback. It cannot turn an unqualified business into a strong outing destination.
  if (ambiguousBusinessType.test(name) && !categoryClearlyLeisure && !nameClearlyLeisure) score -= 28;
  // "Auditorium" alone remains valid. We defer it only where the surrounding
  // name/category metadata identifies an institutional facility and provides
  // no public-performance or visitor evidence.
  if (institutionalContext.test(combined) && institutionalFacility.test(combined) && !publicLeisureEvidence.test(combined)) score -= 48;
  return score;
}

const contextualActivityScore = (place: PricedNearbyPlace, outingContext: OutingContext | undefined) => {
  const family = activityFamily(place);
  const type = `${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`;
  if (outingContext === 'family' && adultOrientedType.test(type)) return -30;
  if (outingContext === 'date') return family === 'cinema' || family === 'culture' || family === 'attraction' ? 5 : family === 'entertainment' || family === 'outdoor' || family === 'recreation' ? 3 : 0;
  if (outingContext === 'friends_group') return family === 'recreation' || family === 'entertainment' || family === 'cinema' ? 5 : family === 'culture' || family === 'outdoor' || family === 'attraction' ? 3 : 0;
  return 0;
};

export function rankOutingSuitability(candidates: readonly PricedNearbyPlace[], context: Pick<StageRankingContext, 'outingContext'> = {}): PricedNearbyPlace[] {
  return candidates.map((place, index) => ({ place, index })).sort((left, right) => outingSuitabilityScore(right.place) + contextualActivityScore(right.place, context.outingContext) - outingSuitabilityScore(left.place) - contextualActivityScore(left.place, context.outingContext) || left.index - right.index).map(({ place }) => place);
}

const focusedActivityFamily = (focus: StageRankingContext['activityFocus']): ActivityFamily | null => focus === 'museum' ? 'culture' : focus === 'landmark' ? 'attraction' : focus === 'auditorium' ? 'entertainment' : focus ?? null;
const matchesExplicitActivityFocus = (place: PricedNearbyPlace, focus: NonNullable<StageRankingContext['activityFocus']>) => {
  if (focus === 'landmark') return landmarkType.test(`${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`);
  if (focus === 'auditorium') return /\b(?:auditorium|performance hall|concert hall)\b/i.test(`${place.name} ${place.category_name ?? ''} ${place.category_code ?? ''}`);
  return activityFamily(place) === focusedActivityFamily(focus);
};

const diversifyActivityTier = (candidates: readonly PricedNearbyPlace[]): PricedNearbyPlace[] => {
  const buckets = new Map<ActivityFamily | 'other', PricedNearbyPlace[]>();
  for (const candidate of candidates) {
    const family = activityFamily(candidate) ?? 'other';
    const bucket = buckets.get(family) ?? [];
    bucket.push(candidate);
    buckets.set(family, bucket);
  }
  const families = [...buckets.keys()];
  const result: PricedNearbyPlace[] = [];
  for (let index = 0; result.length < candidates.length; index += 1) for (const family of families) {
    const candidate = buckets.get(family)?.[index];
    if (candidate) result.push(candidate);
  }
  return result;
};

/** Round-robin category families, retaining supplied relevance/distance order within each family. */
export function diversifyActivityCandidates(candidates: readonly PricedNearbyPlace[], context: Pick<StageRankingContext, 'activityFocus' | 'outingContext'> = {}): PricedNearbyPlace[] {
  const unique = uniquePlaces(candidates);
  const focus = focusedActivityFamily(context.activityFocus);
  if (focus && context.activityFocus) return [...rankOutingSuitability(unique.filter((place) => matchesExplicitActivityFocus(place, context.activityFocus!)), context), ...rankOutingSuitability(unique.filter((place) => !matchesExplicitActivityFocus(place, context.activityFocus!)), context)];
  const ranked = rankOutingSuitability(unique, context);
  // Diversity belongs inside a confidence tier. Otherwise a weak first member
  // of a family can displace a stronger leisure destination from Wise's top 8.
  const strong = ranked.filter((place) => outingSuitabilityScore(place) >= 52);
  const eligible = ranked.filter((place) => outingSuitabilityScore(place) >= 0 && outingSuitabilityScore(place) < 52);
  const weak = ranked.filter((place) => outingSuitabilityScore(place) < 0);
  return [...diversifyActivityTier(strong), ...diversifyActivityTier(eligible), ...diversifyActivityTier(weak)];
}

export const isFoodStage = (categoryCodes: readonly string[]) => categoryCodes.some((code) => code === 'food' || code.startsWith('food.'));
export const isActivityStage = (categoryCodes: readonly string[]) => categoryCodes.some((code) => ACTIVITY_CATEGORY_CODES.includes(code as typeof ACTIVITY_CATEGORY_CODES[number]));
const foodFocusFromStage = (categoryCodes: readonly string[]): FoodFocus => {
  if (categoryCodes.includes('food.cafe') && !categoryCodes.includes('food.restaurant')) return 'cafe';
  if ((categoryCodes.includes('food.dessert') || categoryCodes.includes('food.bakery')) && !categoryCodes.includes('food.restaurant')) return 'dessert';
  return null;
};

/** The shared proposal, Customize, and Try another policy. */
export function orderStageCandidates(categoryCodes: readonly string[], candidates: readonly PricedNearbyPlace[], context: StageRankingContext = {}): PricedNearbyPlace[] {
  const unique = uniquePlaces(candidates);
  if (isFoodStage(categoryCodes)) return buildFoodCandidatePool(unique, context, foodFocusFromStage(categoryCodes)).ordered;
  if (isActivityStage(categoryCodes)) return diversifyActivityCandidates(unique, context);
  return unique;
}

export function eligibleStageCandidates(categoryCodes: readonly string[], candidates: readonly PricedNearbyPlace[], context: StageRankingContext = {}): PricedNearbyPlace[] {
  if (isFoodStage(categoryCodes)) return buildFoodCandidatePool(candidates, context, foodFocusFromStage(categoryCodes)).eligible;
  return orderStageCandidates(categoryCodes, candidates, context);
}

export const CUSTOMIZE_CANDIDATE_LIMIT = 8;
export const STAGE_CANDIDATE_POOL_LIMIT = 50;
export const ALTERNATIVES_PAGE_SIZE = 16;

export function visibleStageCandidates(categoryCodes: readonly string[], candidates: readonly PricedNearbyPlace[], limit = CUSTOMIZE_CANDIDATE_LIMIT, context: StageRankingContext = {}): PricedNearbyPlace[] {
  return eligibleStageCandidates(categoryCodes, candidates, context).slice(0, limit);
}

/** Keep the selected out-of-shortlist place visible without turning Customize into a long carousel. */
export function shortlistWithSelectedCandidate(categoryCodes: readonly string[], candidates: readonly PricedNearbyPlace[], selectedId: string | null, limit = CUSTOMIZE_CANDIDATE_LIMIT, context: StageRankingContext = {}): PricedNearbyPlace[] {
  const ordered = orderStageCandidates(categoryCodes, candidates, context);
  const eligible = eligibleStageCandidates(categoryCodes, candidates, context);
  const selected = selectedId ? ordered.find((place) => place.place_id === selectedId) : undefined;
  if (!selected) return eligible.slice(0, limit);
  const shortlist = eligible.slice(0, limit);
  if (shortlist.some((place) => place.place_id === selected.place_id)) return shortlist;
  return [selected, ...shortlist.filter((place) => place.place_id !== selected.place_id)].slice(0, limit);
}

export function chooseFoodProposalCandidate(candidates: readonly PricedNearbyPlace[], context: StageRankingContext = {}): PricedNearbyPlace | undefined {
  return buildFoodCandidatePool(candidates, context).eligible[0];
}
