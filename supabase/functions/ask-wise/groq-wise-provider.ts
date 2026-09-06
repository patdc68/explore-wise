import { normalizeWiseIntent, wiseIntentSchema, type WiseIntent } from './wise-intent.ts';
export type WiseProvider = { extractIntent(input: { prompt: string }): Promise<WiseIntent> };
export type GroqProviderConfig = Readonly<{ apiKey: string; model: string; baseUrl?: string; fetcher?: typeof fetch }>;
export class WiseProviderError extends Error {
  readonly code: 'ask_wise_not_configured' | 'invalid_provider_config' | 'rate_limited' | 'request_timeout' | 'intent_unavailable';
  readonly retryable: boolean;
  constructor(code: 'ask_wise_not_configured' | 'invalid_provider_config' | 'rate_limited' | 'request_timeout' | 'intent_unavailable', retryable: boolean) { super(code); this.code = code; this.retryable = retryable; }
}
const SYSTEM_PROMPT = 'You extract ExploreWise planning intent only. Return no place names, business names, activity names, prices, cost estimates, ratings, coordinates, distances, opening hours, availability, directions, or recommendations. Do not search for places. Extract only location text, party size, budget, currency, time context, preferences, exclusions, and requested itinerary stages. Use only food_talk for food/cafe/a place to talk, activity_fun for fun/recreation, and discovery for a single general outing. Preserve explicit negatives in exclusions. For Philippine/Taglish prompts, treat ₱, PHP, and a contextual 2k/2.5k/3k budget as PHP and express it in centavos. Never convert currencies or estimate money. A missing value is null or an empty array. Use food_talk then activity_fun only where the requested order implies it.';
const MONEY_INVARIANT = 'budget_minor is an INTEGER PHP centavo amount: 15 pesos = 1500, 150 pesos = 15000, 1500 pesos = 150000, 2k = 200000, 2.5k = 250000, and PHP 1500 = 150000. Never return whole pesos in budget_minor.';
export class GroqWiseProvider implements WiseProvider {
  private readonly baseUrl: string; private readonly fetcher: typeof fetch;
  private readonly config: GroqProviderConfig;
  constructor(config: GroqProviderConfig) { this.config = config; if (!config.apiKey.trim()) throw new WiseProviderError('ask_wise_not_configured', false); if (!config.model.trim() || /\s/.test(config.model)) throw new WiseProviderError('invalid_provider_config', false); this.baseUrl = (config.baseUrl ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, ''); this.fetcher = config.fetcher ?? fetch; }
  async extractIntent({ prompt }: { prompt: string }): Promise<WiseIntent> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000); const startedAt = Date.now(); let statusClass = 'network';
    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.config.model, reasoning_effort: 'low', include_reasoning: false, max_completion_tokens: 450, messages: [{ role: 'system', content: `${SYSTEM_PROMPT} ${MONEY_INVARIANT}` }, { role: 'user', content: prompt }], response_format: { type: 'json_schema', json_schema: { name: 'explorewise_wise_intent', strict: true, schema: wiseIntentSchema } } }) });
      statusClass = `${Math.floor(response.status / 100)}xx`;
      if (!response.ok) { const error = response.status === 429 ? new WiseProviderError('rate_limited', true) : new WiseProviderError('intent_unavailable', response.status >= 500); console.log(JSON.stringify({ event: 'ask_wise_provider', provider: 'groq', model: this.config.model, success: false, status_class: statusClass, latency_ms: Date.now() - startedAt })); throw error; }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> }; const content = payload.choices?.[0]?.message?.content; const intent = typeof content === 'string' ? normalizeWiseIntent(JSON.parse(content)) : null;
      console.log(JSON.stringify({ event: 'ask_wise_provider', provider: 'groq', model: this.config.model, success: intent !== null, status_class: statusClass, latency_ms: Date.now() - startedAt, domain_valid: intent !== null }));
      if (!intent) throw new WiseProviderError('intent_unavailable', true); return intent;
    } catch (error) { if (error instanceof WiseProviderError) throw error; const timedOut = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError'); console.log(JSON.stringify({ event: 'ask_wise_provider', provider: 'groq', model: this.config.model, success: false, status_class: timedOut ? 'timeout' : statusClass, latency_ms: Date.now() - startedAt, domain_valid: false })); throw new WiseProviderError(timedOut ? 'request_timeout' : 'intent_unavailable', true); } finally { clearTimeout(timer); }
  }
}
