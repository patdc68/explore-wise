import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';

import { createOAuthCallbackFlow, isOAuthCallbackUrl, OAUTH_CALLBACK_PATH } from './oauth-callback';

export const googleOAuth = createOAuthCallbackFlow((value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value));
export const googleRedirectUrl = () => Linking.createURL('auth/callback');

// Native intents and the browser result only deliver credentials. The callback
// screen is the sole owner of session completion and post-auth navigation.
export async function googleCallbackRoute(url: string) {
  try {
    const attempt = await googleOAuth.capture(url, googleRedirectUrl());
    return { pathname: OAUTH_CALLBACK_PATH, params: { attempt } } as const;
  } catch {
    return { pathname: OAUTH_CALLBACK_PATH, params: { attempt: 'invalid' } } as const;
  }
}

export async function redirectOAuthSystemPath(path: string) {
  if (!isOAuthCallbackUrl(path, googleRedirectUrl())) return path;
  const route = await googleCallbackRoute(path);
  // Strip credentials before Expo Router puts the link into navigation state.
  return `${route.pathname}?attempt=${route.params.attempt}`;
}
