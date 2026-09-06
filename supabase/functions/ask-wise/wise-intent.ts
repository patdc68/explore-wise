export const WISE_STAGE_TYPES = ['food_talk', 'activity_fun', 'discovery'] as const;
export type WiseStageType = typeof WISE_STAGE_TYPES[number];
export type WiseIntent = Readonly<{ budgetMinor: number | null; partySize: number | null; location: string | null; currencyCode: string | null; timeContext: string | null; preferences: string[]; exclusions: string[]; stages: WiseStageType[] }>;
export type WiseIntentWire = Readonly<{ budget_minor: number | null; party_size: number | null; location: string | null; currency_code: string | null; time_context: string | null; preferences: string[]; exclusions: string[]; stages: WiseStageType[] }>;
export const wiseIntentSchema = { type: 'object', additionalProperties: false, properties: { budget_minor: { type: ['integer', 'null'], minimum: 0 }, party_size: { type: ['integer', 'null'], minimum: 1 }, location: { type: ['string', 'null'], maxLength: 120 }, currency_code: { type: ['string', 'null'], maxLength: 3 }, time_context: { type: ['string', 'null'], maxLength: 100 }, preferences: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 80 } }, exclusions: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 80 } }, stages: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: WISE_STAGE_TYPES } } }, required: ['budget_minor', 'party_size', 'location', 'currency_code', 'time_context', 'preferences', 'exclusions', 'stages'] } as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const boundedText = (value: unknown, maximum: number): string | null => { if (typeof value !== 'string') return null; const normalized = value.trim().replace(/\s+/g, ' '); return normalized.length > 0 && normalized.length <= maximum ? normalized : null; };
const nullableText = (value: unknown, maximum: number): string | null | undefined => value === null ? null : boundedText(value, maximum) ?? undefined;
const boundedTexts = (value: unknown): string[] | undefined => { if (!Array.isArray(value) || value.length > 12) return undefined; const normalized = value.map((item) => boundedText(item, 80)); return normalized.every((item): item is string => item !== null) ? normalized : undefined; };
export function normalizeWiseIntent(value: unknown): WiseIntent | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort(); const expected = ['budget_minor', 'currency_code', 'exclusions', 'location', 'party_size', 'preferences', 'stages', 'time_context'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  const budgetMinor = value.budget_minor; const partySize = value.party_size; const location = nullableText(value.location, 120); const currencyCode = nullableText(value.currency_code, 3); const timeContext = nullableText(value.time_context, 100); const preferences = boundedTexts(value.preferences); const exclusions = boundedTexts(value.exclusions); const stages = value.stages;
  if ((budgetMinor !== null && (!Number.isSafeInteger(budgetMinor) || budgetMinor < 0 || budgetMinor > 50_000_000)) || (partySize !== null && (!Number.isSafeInteger(partySize) || partySize < 1 || partySize > 50)) || location === undefined || timeContext === undefined || preferences === undefined || exclusions === undefined || currencyCode === undefined || (currencyCode !== null && !/^[A-Za-z]{3}$/.test(currencyCode)) || !Array.isArray(stages) || stages.length < 1 || stages.length > 3 || !stages.every((stage): stage is WiseStageType => typeof stage === 'string' && (WISE_STAGE_TYPES as readonly string[]).includes(stage))) return null;
  return { budgetMinor: budgetMinor as number | null, partySize: partySize as number | null, location, currencyCode: currencyCode?.toUpperCase() ?? null, timeContext, preferences, exclusions, stages: [...stages] };
}
export function intentToWire(intent: WiseIntent): WiseIntentWire { return { budget_minor: intent.budgetMinor, party_size: intent.partySize, location: intent.location, currency_code: intent.currencyCode, time_context: intent.timeContext, preferences: intent.preferences, exclusions: intent.exclusions, stages: intent.stages }; }
export function validateWisePrompt(value: unknown): string | null { const prompt = typeof value === 'string' ? value.trim() : ''; return prompt.length >= 3 && prompt.length <= 1200 ? prompt : null; }

/** Explicit PHP budget text is deterministic input; the wire value is always centavos. */
export function budgetMinorFromPrompt(prompt: string): number | null {
  const match = prompt.match(/(?:\b(?:budget|spend)\s*(?:is|of|:)?\s*|(?:₱|PHP\s*))([\d,]+(?:\.\d+)?)\s*(k)?\b/i);
  if (!match) return null;
  const pesos = Number(match[1].replace(/,/g, '')) * (match[2] ? 1000 : 1);
  return Number.isFinite(pesos) && pesos >= 0 ? Math.round(pesos * 100) : null;
}

export function normalizePromptBudget(intent: WiseIntent, prompt: string): WiseIntent {
  const budgetMinor = budgetMinorFromPrompt(prompt);
  return budgetMinor === null ? intent : { ...intent, budgetMinor, currencyCode: intent.currencyCode ?? 'PHP' };
}
