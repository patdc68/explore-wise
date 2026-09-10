import assert from 'node:assert/strict';
import test from 'node:test';
import { GroqWiseProvider, WiseProviderError } from './groq-wise-provider.ts';
import { createWiseProvider } from './wise-provider-config.ts';

const wire = { budget_minor: 300000, party_size: 4, location: 'BGC', currency_code: 'PHP', time_context: 'tonight', preferences: ['conversation-friendly'], exclusions: ['bar'], stages: ['food_talk', 'activity_fun'] };
const provider = (fetcher: typeof fetch) => new GroqWiseProvider({ apiKey: 'test-key', model: 'openai/gpt-oss-20b', fetcher });
test('uses Groq OpenAI-compatible chat structured output with low reasoning', async () => {
  let request: Record<string, unknown> | undefined;
  const intent = await provider(async (_url, init) => { request = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(wire) } }] }), { status: 200 }); }).extractIntent({ prompt: 'Four friends in BGC, 3k, no bars' });
  assert.equal(intent.budgetMinor, 300000); assert.equal(intent.partySize, 4); assert.equal(request?.reasoning_effort, 'low'); assert.equal(request?.include_reasoning, false); assert.equal((request?.response_format as any).json_schema.strict, true); assert.equal((request?.response_format as any).json_schema.schema.additionalProperties, false);
  assert.match(String((request?.messages as any)?.[0]?.content), /1500 pesos = 150000/);
});
test('rejects missing secret, unsupported provider, rate limits, and upstream failures', async () => {
  assert.throws(() => createWiseProvider({ get: (name) => name === 'WISE_AI_PROVIDER' ? 'groq' : name === 'WISE_AI_MODEL' ? 'openai/gpt-oss-20b' : undefined }), (error: unknown) => error instanceof WiseProviderError && error.code === 'ask_wise_not_configured');
  assert.throws(() => createWiseProvider({ get: () => 'other' }), (error: unknown) => error instanceof WiseProviderError && error.code === 'invalid_provider_config');
  await assert.rejects(() => provider(async () => new Response('', { status: 429 })).extractIntent({ prompt: 'test' }), (error: unknown) => error instanceof WiseProviderError && error.code === 'rate_limited');
  await assert.rejects(() => provider(async () => new Response('', { status: 503 })).extractIntent({ prompt: 'test' }), (error: unknown) => error instanceof WiseProviderError && error.code === 'intent_unavailable');
});
test('maps aborted fetches to a timeout without network access', async () => { await assert.rejects(() => provider(async () => { throw new DOMException('aborted', 'AbortError'); }).extractIntent({ prompt: 'test' }), (error: unknown) => error instanceof WiseProviderError && error.code === 'request_timeout'); });
test('accepts deterministic Groq fixture output with ramen preserved as a preference', async () => {
  const ramenWire = { ...wire, budget_minor: 200000, party_size: 2, location: 'Makati', preferences: ['ramen'], exclusions: [], stages: ['food_talk'] };
  const intent = await provider(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ramenWire) } }] }), { status: 200 })).extractIntent({ prompt: 'Ramen date in Makati, budget 2000 for two' });
  assert.equal(intent.partySize, 2);
  assert.equal(intent.budgetMinor, 200000);
  assert.deepEqual(intent.preferences, ['ramen']);
});
