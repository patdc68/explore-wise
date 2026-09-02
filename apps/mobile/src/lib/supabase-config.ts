const expectedProjectHost = 'wkgvnpamnhesmmbyikml.supabase.co';

function normalizedValue(value: string | undefined) {
  return value?.trim() || undefined;
}

export function normalizeExploreWiseProjectUrl(value: string | undefined) {
  const url = normalizedValue(value);
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== expectedProjectHost) return undefined;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function normalizePublishableKey(value: string | undefined) {
  const key = normalizedValue(value);
  if (!key) return undefined;

  // New Supabase publishable keys are opaque (`sb_publishable_...`). Keep legacy
  // anon JWTs working during the platform's transition, but never accept secret keys.
  const isModernPublishableKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  const isLegacyAnonJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);
  return isModernPublishableKey || isLegacyAnonJwt ? key : undefined;
}
