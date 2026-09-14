import type { Session, SupabaseClient } from '@supabase/supabase-js';

export const OAUTH_CALLBACK_ERROR = 'Google sign-in could not be completed. Please try again.';
export const OAUTH_CALLBACK_PATH = '/auth/callback';
type Credentials = { code: string } | { access_token: string; refresh_token: string };
type AuthClient = Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'setSession' | 'getSession'>;

export function isOAuthCallbackUrl(input: string, redirectTo: string) {
  // Compare the entire destination, not a prefix such as auth/callback-elsewhere.
  const destination = input.split(/[?#]/, 1)[0];
  return [redirectTo, 'explorewise://auth/callback', 'explorewise:///auth/callback', OAUTH_CALLBACK_PATH].includes(destination);
}

export function parseOAuthCallback(input: string, redirectTo: string): Credentials {
  try {
    if (!isOAuthCallbackUrl(input, redirectTo) || /\s/.test(input)) throw new Error();
    // URLSearchParams tolerates broken percent escapes; reject them explicitly.
    decodeURIComponent(input);
    const url = new URL(input, 'explorewise://');
    const query = url.searchParams;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const read = (name: string) => {
      const values = [...query.getAll(name), ...fragment.getAll(name)];
      if (values.length > 1 || values.some((value) => !value || /\s|[\u0000-\u001f\u007f]/.test(value))) throw new Error();
      return values[0];
    };
    if (query.has('error') || fragment.has('error') || query.has('error_description') || fragment.has('error_description')) throw new Error();
    const code = read('code');
    if (code) return { code };
    const access_token = read('access_token');
    const refresh_token = read('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
    throw new Error();
  } catch {
    // Never forward provider error descriptions, URLs, or credentials to the UI.
    throw new Error(OAUTH_CALLBACK_ERROR);
  }
}

export function createOAuthCallbackFlow(fingerprint: (value: string) => Promise<string>) {
  type Attempt = { id: string; credentials?: Credentials; completion?: Promise<string>; handled: boolean };
  const attempts = new Map<string, Attempt>();
  let sequence = 0;
  return {
    async capture(url: string, redirectTo: string) {
      const credentials = parseOAuthCallback(url, redirectTo);
      const key = await fingerprint(JSON.stringify(credentials));
      let attempt = attempts.get(key);
      if (!attempt) {
        // Only hashes and short-lived credentials are held in memory. No URL storage.
        attempt = { id: String(++sequence), credentials, handled: false };
        attempts.set(key, attempt);
        if (attempts.size > 16) attempts.delete(attempts.keys().next().value!);
      }
      return attempt.id;
    },
    async complete(id: string, auth: AuthClient): Promise<Session> {
      const attempt = [...attempts.values()].find((entry) => entry.id === id);
      if (!attempt) return Promise.reject(new Error(OAUTH_CALLBACK_ERROR));
      // Route remounts and duplicate native/browser deliveries share one exchange.
      attempt.completion ??= (async () => {
        try {
          const credentials = attempt.credentials!;
          const { data, error } = 'code' in credentials
            ? await auth.exchangeCodeForSession(credentials.code)
            : await auth.setSession(credentials);
          if (error || !data.session?.user) throw new Error();
          return data.session.user.id;
        } catch {
          throw new Error(OAUTH_CALLBACK_ERROR);
        } finally {
          delete attempt.credentials;
        }
      })();
      try {
        const userId = await attempt.completion;
        const { data, error } = await auth.getSession();
        // Read the persisted session, including token refreshes. A late duplicate
        // must never restore a cached session after the user has signed out.
        if (error || !data.session || data.session.user.id !== userId) throw new Error();
        return data.session;
      } catch {
        throw new Error(OAUTH_CALLBACK_ERROR);
      }
    },
    isHandled(id: string) { return [...attempts.values()].some((entry) => entry.id === id && entry.handled); },
    claimNavigation(id: string) {
      const attempt = [...attempts.values()].find((entry) => entry.id === id);
      if (!attempt || attempt.handled) return false;
      attempt.handled = true;
      return true;
    },
  };
}
