import type { PlannerAuthContext, PlannerAuthenticator } from './types.ts';

type EnvironmentLike = Readonly<Record<string, string | undefined>>;

function configuredClientKeys(environment: EnvironmentLike): readonly string[] {
  const keys = new Set<string>();
  for (const name of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']) {
    const value = environment[name]?.trim();
    if (value) keys.add(value);
  }
  const configured = environment.SUPABASE_PUBLISHABLE_KEYS;
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const value of Object.values(parsed as Record<string, unknown>)) {
          if (typeof value === 'string' && value.trim()) keys.add(value.trim());
        }
      }
    } catch {
      // Invalid platform configuration fails closed by leaving this source empty.
    }
  }
  return [...keys];
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')?.trim() ?? '';
  if (!/^bearer\s+\S+$/iu.test(value)) return null;
  return value.replace(/^bearer\s+/iu, '').trim() || null;
}

export type BearerVerifier = (token: string) => Promise<Readonly<{ userId: string }> | null>;

export function createRequestAuthenticator(
  environment: EnvironmentLike,
  verifyBearer?: BearerVerifier,
): PlannerAuthenticator {
  const allowedKeys = new Set(configuredClientKeys(environment));
  return async (request): Promise<PlannerAuthContext | null> => {
    const supplied = request.headers.get('apikey')?.trim();
    if (!supplied || !allowedKeys.has(supplied)) return null;
    const token = bearerToken(request);
    if (!token || !verifyBearer) return { authClass: 'anonymous' };
    try {
      const verified = await verifyBearer(token);
      return verified ? { authClass: 'authenticated', userId: verified.userId } : { authClass: 'anonymous' };
    } catch {
      // An invalid/stale optional session must not remove anonymous planning.
      return { authClass: 'anonymous' };
    }
  };
}

export function authContextForTests(authClass: PlannerAuthContext['authClass'] = 'anonymous'): PlannerAuthContext {
  return { authClass };
}
