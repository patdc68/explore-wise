import type { ItineraryStageType } from './itinerary';
import { logWiseBudget } from './wise-budget-diagnostics.ts';

export type ActivityFocus = 'recreation' | 'cinema' | 'museum' | 'outdoor' | 'landmark' | 'auditorium' | null;
export type FoodFocus = 'restaurant' | 'cafe' | 'dessert' | 'ramen' | 'pizza' | 'sushi' | 'burger' | 'fast_food' | null;
export type OutingContext = 'date' | 'friends_group' | 'family' | 'solo' | 'generic';
export type AskWiseIntent = { budgetMinor: number | null; partySize: number | null; location: string | null; currencyCode: string | null; timeContext: string | null; exclusions: string[]; stages: ItineraryStageType[]; inferredStages: ItineraryStageType[]; preferences: string[]; activityFocus: ActivityFocus; explicitQuickService: boolean; explicitNightlife?: boolean; foodFocus?: FoodFocus; outingContext?: OutingContext };
export type AskWiseWireIntent = { budget_minor: number | null; party_size: number | null; location: string | null; currency_code: string | null; time_context: string | null; exclusions: string[]; stages: ItineraryStageType[]; preferences: string[] };

export function normalizeAskWiseWireIntent(intent: AskWiseWireIntent): AskWiseIntent {
  logWiseBudget('wire', intent.budget_minor);
  const foodFocus = foodFocusFor('', intent.preferences);
  const normalized = { budgetMinor: intent.budget_minor, partySize: intent.party_size, location: intent.location, currencyCode: intent.currency_code, timeContext: intent.time_context, exclusions: intent.exclusions, stages: intent.stages, inferredStages: [], preferences: intent.preferences, activityFocus: null, explicitQuickService: foodFocus === 'fast_food', explicitNightlife: false, foodFocus };
  logWiseBudget('intent', normalized.budgetMinor);
  return normalized;
}

type Mention = Readonly<{ type: ItineraryStageType; index: number }>;
const mentionsFor = (prompt: string): Mention[] => {
  const text = prompt.toLowerCase();
  const patterns: readonly (readonly [ItineraryStageType, RegExp])[] = [
    ['cafe', /\b(?:coffee|café|cafe)\b/g],
    ['food_talk', /\b(?:restaurant|food|dinner|lunch|breakfast|eat|eating|kain|kainan|bar|nightlife|bistro)\b/g],
    ['activity_fun', /\b(?:activity|activities|fun|bowling|gala|museum|attraction|game|games)\b/g],
  ];
  return patterns.flatMap(([type, pattern]) => [...text.matchAll(pattern)].map((match) => ({ type, index: match.index ?? 0 }))).sort((left, right) => left.index - right.index);
};

const explicitlyLimited = (prompt: string) => /\b(?:just|only)\b/i.test(prompt) || /\b(?:kain|kainan|restaurant|food|coffee|cafe|activity|gala)\s+lang\b/i.test(prompt);
const complementary = (type: ItineraryStageType): ItineraryStageType => type === 'activity_fun' ? 'food_talk' : 'activity_fun';

export function activityFocusFor(prompt: string): ActivityFocus {
  const text = prompt.toLowerCase();
  if (/\b(?:auditorium|performance hall|concert hall)\b/.test(text)) return 'auditorium';
  if (/\b(?:bowling|arcade|escape room|karaoke|climb(?:ing)?|skate|kart(?:ing)?|game|games)\b/.test(text)) return 'recreation';
  if (/\b(?:movie|movies|cinema|film)\b/.test(text)) return 'cinema';
  if (/\b(?:museum|museums|gallery|culture|heritage)\b/.test(text)) return 'museum';
  if (/\b(?:monument|monuments|landmark|landmarks|memorial)\b/.test(text)) return 'landmark';
  if (/\b(?:park|parks|garden|gardens|outdoor)\b/.test(text)) return 'outdoor';
  return null;
}

export function hasExplicitQuickServiceIntent(prompt: string): boolean {
  return /\b(?:fast[ -]?food|quick[ -]?service|qsr|cheap quick meal|jollibee|kfc|mang inasal|mcdonald'?s)\b/i.test(prompt);
}

export function hasExplicitNightlifeIntent(prompt: string): boolean {
  return /\b(?:bar|nightlife|pub|cocktail)\b/i.test(prompt);
}

/** Prompt-owned context only influences category/venue-type ordering, never venue claims. */
export function outingContextFor(prompt: string): OutingContext {
  const text = prompt.toLowerCase();
  if (/\b(?:date night|on a date|my date|a date|date tonight|date)\b/.test(text)) return 'date';
  if (/\b(?:friends?|group|barkada)\b/.test(text)) return 'friends_group';
  if (/\b(?:family|kids?|children)\b/.test(text)) return 'family';
  if (/\b(?:just me|by myself|solo)\b/.test(text)) return 'solo';
  return 'generic';
}

/** Explicit food wording has priority over distance or price metadata in client ranking. */
export function foodFocusFor(prompt: string, preferences: readonly string[] = []): FoodFocus {
  const text = `${preferences.join(' ')} ${prompt}`.toLowerCase();
  if (/\b(?:fast[ -]?food|quick[ -]?service|qsr)\b/.test(text)) return 'fast_food';
  if (/\bramen\b/.test(text)) return 'ramen';
  if (/\bpizza\b/.test(text)) return 'pizza';
  if (/\bsushi\b/.test(text)) return 'sushi';
  if (/\bburgers?\b/.test(text)) return 'burger';
  if (/\b(?:dessert|ice cream|cake|sweet|sweets)\b/.test(text)) return 'dessert';
  if (/\b(?:coffee|cafÃ©|cafe|tambay\s+sa\s+cafe|coffee date)\b/.test(text)) return 'cafe';
  if (/\b(?:restaurant|dinner|lunch|meal|eat somewhere|kain|dinner spot)\b/.test(text)) return 'restaurant';
  return null;
}

/** Product-owned enrichment runs after Wise extracts intent; it never asks Wise to invent stages or places. */
export function enrichWiseIntent(intent: AskWiseIntent, prompt: string): AskWiseIntent {
  const mentions = mentionsFor(prompt);
  const afterIndex = prompt.toLowerCase().search(/\bafter\b/);
  const beforeAfter = afterIndex >= 0 ? mentions.filter((mention) => mention.index < afterIndex).map((mention) => mention.type) : [];
  const afterAfter = afterIndex >= 0 ? mentions.filter((mention) => mention.index > afterIndex).map((mention) => mention.type) : [];
  const mentionedSequence = beforeAfter.length && afterAfter.length
    ? [afterAfter[0], beforeAfter[0]]
    : mentions.map((mention) => mention.type).filter((type, index, all) => all.indexOf(type) === index);
  const canonicalSpecific = intent.stages.filter((stage) => stage !== 'discovery');
  const limited = explicitlyLimited(prompt);
  let stages: ItineraryStageType[];
  if (mentionedSequence.length >= 2) stages = mentionedSequence;
  else if (mentionedSequence.length === 1) stages = mentionedSequence;
  else if (canonicalSpecific.length >= 2) stages = canonicalSpecific;
  else stages = ['food_talk', 'activity_fun'];
  const foodFocus = intent.foodFocus ?? foodFocusFor(prompt, intent.preferences);
  const context = { activityFocus: activityFocusFor(prompt), explicitQuickService: intent.explicitQuickService || foodFocus === 'fast_food' || hasExplicitQuickServiceIntent(prompt), explicitNightlife: hasExplicitNightlifeIntent(prompt), foodFocus, outingContext: outingContextFor(prompt) };
  if (limited) return { ...intent, ...context, stages, inferredStages: [] };
  if (stages.length === 1) {
    const first = stages[0];
    return { ...intent, ...context, stages: [first, complementary(first)], inferredStages: [complementary(first)] };
  }
  return { ...intent, ...context, stages, inferredStages: [] };
}
