import { WiseProviderError } from './groq-wise-provider.ts';
import { createWiseProvider } from './wise-provider-config.ts';
import { intentToWire, normalizePromptBudget, validateWisePrompt } from './wise-intent.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const errorResponse = (code: string, status: number, retryable = false) => json({ error: { code, message: code === 'invalid_prompt' ? 'Enter a short planning request to Ask Wise.' : "Wise isn't available right now. You can still explore places manually.", retryable } }, status);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const body = await request.json().catch(() => null) as { prompt?: unknown } | null;
  const prompt = validateWisePrompt(body?.prompt);
  if (!prompt) return errorResponse('invalid_prompt', 400);
  try {
    const intent = normalizePromptBudget(await createWiseProvider(Deno.env).extractIntent({ prompt }), prompt);
    return json({ intent: intentToWire(intent) });
  } catch (error) {
    if (error instanceof WiseProviderError) {
      const status = error.code === 'ask_wise_not_configured' || error.code === 'invalid_provider_config' ? 503 : error.code === 'rate_limited' ? 429 : error.code === 'request_timeout' ? 504 : 502;
      return errorResponse(error.code, status, error.retryable);
    }
    console.log(JSON.stringify({ event: 'ask_wise_unexpected_error', success: false }));
    return errorResponse('intent_unavailable', 502, true);
  }
});
