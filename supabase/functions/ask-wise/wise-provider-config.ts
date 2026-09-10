import { GroqWiseProvider, WiseProviderError, type WiseProvider } from './groq-wise-provider.ts';

export type WiseEnvironment = Readonly<{ get(name: string): string | undefined }>;
export function createWiseProvider(env: WiseEnvironment): WiseProvider {
  const provider = env.get('WISE_AI_PROVIDER')?.trim().toLowerCase();
  if (provider !== 'groq') throw new WiseProviderError('invalid_provider_config', false);
  return new GroqWiseProvider({ apiKey: env.get('GROQ_API_KEY') ?? '', model: env.get('WISE_AI_MODEL') ?? '', baseUrl: env.get('GROQ_BASE_URL') || undefined });
}
