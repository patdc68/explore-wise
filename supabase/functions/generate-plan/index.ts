import { createClient } from 'npm:@supabase/supabase-js@2.113.0';
import { createRequestAuthenticator } from './auth.ts';
import { createGeneratePlanHandler } from './handler.ts';
import { deferredPlannerGenerator } from './generator.ts';
import { SupabasePlanningRepository } from './repository.ts';
import { createInMemoryRateLimiter } from './rate-limit.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();

function configuredDatabaseKey(): string | undefined {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (direct) return direct;
  const configured = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!configured) return undefined;
  try {
    const parsed = JSON.parse(configured) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const fallback = (parsed as Record<string, unknown>).default;
    return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : undefined;
  } catch {
    return undefined;
  }
}

function requiredConfiguration(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = configuredDatabaseKey();
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Generate-plan server configuration is unavailable.');
  return { url: supabaseUrl, serviceRoleKey };
}

const configuration = requiredConfiguration();
const adminClient = createClient(configuration.url, configuration.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repository = new SupabasePlanningRepository(adminClient);
const authenticate = createRequestAuthenticator(
  Deno.env.toObject(),
  async (token) => {
    const { data, error } = await adminClient.auth.getUser(token);
    return error || !data.user ? null : { userId: data.user.id };
  },
);

const handleRequest = createGeneratePlanHandler({
  repository,
  generator: deferredPlannerGenerator,
  authorize: authenticate,
  rateLimiter: createInMemoryRateLimiter(),
});

Deno.serve(handleRequest);
