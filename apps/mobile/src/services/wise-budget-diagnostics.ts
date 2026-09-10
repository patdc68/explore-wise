/** Development-only, amount-only diagnostics. Never pass request or auth data here. */
export function logWiseBudget(stage: 'wire' | 'intent' | 'proposal' | 'itinerary' | 'review', budgetMinor: number | null) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[wise-budget] ${stage}=${budgetMinor ?? 'null'}`);
}
