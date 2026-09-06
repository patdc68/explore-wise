import { getSupabaseClient } from '@/lib/supabase';
import { enrichWiseIntent, foodFocusFor, normalizeAskWiseWireIntent, type AskWiseIntent, type AskWiseWireIntent } from './ask-wise-normalization';
import { logWiseFoodIntent } from './wise-food-diagnostics';
export { type AskWiseIntent } from './ask-wise-normalization';
export class AskWiseError extends Error { constructor(readonly retryable: boolean) { super("Wise isn't available right now. You can still explore places manually."); } }
export async function parseAskWise(prompt: string): Promise<AskWiseIntent> {
  const { data, error } = await getSupabaseClient().functions.invoke('ask-wise', { body: { prompt: prompt.trim() } });
  const failure = data?.error;
  if (error || failure || !data?.intent) throw new AskWiseError(Boolean(failure?.retryable));
  const intent = data.intent as AskWiseWireIntent;
  const normalized = enrichWiseIntent(normalizeAskWiseWireIntent(intent), prompt);
  logWiseFoodIntent(foodFocusFor(prompt, intent.preferences), intent, normalized);
  return normalized;
}
