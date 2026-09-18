import type { PlannerRateLimiter } from './types.ts';

export type InMemoryRateLimiterOptions = Readonly<{
  maxRequests?: number;
  windowMs?: number;
  maxTrackedClients?: number;
}>;

function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')?.trim()
    ?? request.headers.get('apikey')?.trim()
    ?? 'unknown';
}

/** Best-effort isolate-local protection; it is not durable distributed rate limiting. */
export function createInMemoryRateLimiter(options: InMemoryRateLimiterOptions = {}): PlannerRateLimiter {
  const maxRequests = options.maxRequests ?? 10;
  const windowMs = options.windowMs ?? 60_000;
  const maxTrackedClients = options.maxTrackedClients ?? 1_024;
  const windows = new Map<string, { count: number; resetAt: number; touchedAt: number }>();
  return (request) => {
    const now = Date.now();
    const key = clientKey(request);
    const existing = windows.get(key);
    if (!existing || now >= existing.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs, touchedAt: now });
    } else {
      existing.count += 1;
      existing.touchedAt = now;
      if (existing.count > maxRequests) return true;
    }
    if (windows.size > maxTrackedClients) {
      const oldest = [...windows.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0];
      if (oldest) windows.delete(oldest[0]);
    }
    return false;
  };
}
