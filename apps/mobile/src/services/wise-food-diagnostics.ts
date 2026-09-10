import type { AskWiseIntent, AskWiseWireIntent } from './ask-wise-normalization.ts';
import { buildFoodCandidatePool, deriveBudgetPerPersonMinor, explicitFoodMatchLevel, isQuickService, type StageRankingContext } from './food-candidate-diversity.ts';
import type { PricedNearbyPlace } from './places.ts';

const dev = () => typeof __DEV__ !== 'undefined' && __DEV__;

export function logWiseFoodIntent(promptFoodSignal: string | null, wire: AskWiseWireIntent, intent: AskWiseIntent) {
  if (!dev()) return;
  console.log('[wise-food]', {
    prompt_food_signal: promptFoodSignal,
    wise_preferences: wire.preferences,
    normalized_explicit_food_intent: intent.foodFocus ?? null,
    context: intent.outingContext ?? 'generic',
    party: intent.partySize,
    budget_minor: intent.budgetMinor,
    budget_per_person_minor: deriveBudgetPerPersonMinor(intent.budgetMinor, intent.partySize),
  });
}

export function logFoodPipeline(stage: string, retrieved: readonly PricedNearbyPlace[], filtered: readonly PricedNearbyPlace[], context: StageRankingContext) {
  if (!dev()) return;
  const pool = buildFoodCandidatePool(filtered, context);
  const focus = pool.explicitFocus;
  console.log('[food-candidates]', {
    stage,
    retrieved: retrieved.length,
    after_filtering: filtered.length,
    explicit_match: focus ? filtered.filter((place) => explicitFoodMatchLevel(place, focus) === 'strong').length : 0,
    related_match: focus ? filtered.filter((place) => explicitFoodMatchLevel(place, focus) === 'related').length : 0,
    regular_restaurant: filtered.filter((place) => !isQuickService(place)).length,
    qsr: filtered.filter(isQuickService).length,
    unknown_price: filtered.filter((place) => !place.has_price).length,
  });
  console.log('[food-ranking]', {
    stage,
    mode: pool.mode,
    explicit_food_intent: focus,
    top: pool.eligible.slice(0, 5).map((place, index) => ({ rank: index + 1, id: place.place_id, name: place.name, match: focus ? explicitFoodMatchLevel(place, focus) : 'none', qsr: isQuickService(place), budget_status: place.budget_status })),
    broader_count: pool.broader.length,
  });
}
