import type { Session, User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { googleCallbackRoute, googleOAuth, googleRedirectUrl } from '@/services/google-oauth';
import { OAUTH_CALLBACK_ERROR } from '@/services/oauth-callback';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<'redirected' | 'cancelled'>;
  completeGoogleCallback: (attempt: string) => Promise<Session>;
  signOut: () => Promise<void>;
  queueAfterAuthentication: (action: () => void | Promise<void>) => void;
  completeQueuedAction: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function bootstrapProfile(user: User | null) {
  if (!user) return;
  // The auth trigger handles new sign-ups. This idempotent fallback covers
  // accounts created before the trigger existed without using metadata for auth.
  await getSupabaseClient().from('ew_profiles').upsert({
    id: user.id,
    display_name: typeof user.user_metadata.display_name === 'string' ? user.user_metadata.display_name : null,
  }, { onConflict: 'id', ignoreDuplicates: true });
}

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'Email or password is not correct.';
  if (lower.includes('email not confirmed')) return 'Please confirm your email, then sign in.';
  if (lower.includes('already registered')) return 'An account already exists for this email. Try signing in.';
  if (lower.includes('password should')) return 'Use a stronger password with at least 8 characters.';
  if (lower.includes('network') || lower.includes('fetch')) return 'We could not reach ExploreWise. Check your connection and try again.';
  return 'We could not complete that account action. Please try again.';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const queuedAction = useRef<null | (() => void | Promise<void>)>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setInitializing(false); return; }
    const client = getSupabaseClient();
    let mounted = true;
    void client.auth.getSession().then(({ data }) => { void bootstrapProfile(data.session?.user ?? null); if (mounted) { setSession(data.session); setInitializing(false); } }).catch(() => mounted && setInitializing(false));
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => { void bootstrapProfile(nextSession?.user ?? null); if (mounted) { setSession(nextSession); setInitializing(false); } });
    client.auth.startAutoRefresh();
    const appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh(); });
    return () => { mounted = false; subscription.subscription.unsubscribe(); appStateSubscription.remove(); client.auth.stopAutoRefresh(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => { const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password }); if (error) throw new Error(friendlyAuthError(error.message)); }, []);
  const signUp = useCallback(async (email: string, password: string, displayName?: string) => { const { data, error } = await getSupabaseClient().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: 'https://explore-wise.fun/auth/confirm', data: displayName?.trim() ? { display_name: displayName.trim() } : {} } }); if (error) throw new Error(friendlyAuthError(error.message)); return { needsEmailConfirmation: !data.session }; }, []);
  const signInWithGoogle = useCallback(async (): Promise<'redirected' | 'cancelled'> => {
    try {
      const redirectTo = googleRedirectUrl();
      const { data, error } = await getSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw new Error();
      // SDK 57 owns Android's browser/Linking subscription and its cleanup.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return 'cancelled';
      const route = await googleCallbackRoute(result.url);
      if (!googleOAuth.isHandled(route.params.attempt)) router.navigate(route);
      return 'redirected';
    } catch {
      throw new Error(OAUTH_CALLBACK_ERROR);
    }
  }, []);
  const completeGoogleCallback = useCallback(async (attempt: string) => {
    const nextSession = await googleOAuth.complete(attempt, getSupabaseClient().auth);
    // Supabase also emits SIGNED_IN; explicitly synchronize context before the
    // callback screen resumes any queued action after its next render.
    setSession(nextSession);
    setInitializing(false);
    return nextSession;
  }, []);
  const signOut = useCallback(async () => { const { error } = await getSupabaseClient().auth.signOut(); if (error) throw new Error(friendlyAuthError(error.message)); }, []);
  const queueAfterAuthentication = useCallback((action: () => void | Promise<void>) => { queuedAction.current = action; }, []);
  const completeQueuedAction = useCallback(async () => { const action = queuedAction.current; queuedAction.current = null; if (action) await action(); }, []);
  const value = useMemo(() => ({ user: session?.user ?? null, session, initializing, signIn, signUp, signInWithGoogle, completeGoogleCallback, signOut, queueAfterAuthentication, completeQueuedAction }), [completeGoogleCallback, completeQueuedAction, initializing, queueAfterAuthentication, session, signIn, signInWithGoogle, signOut, signUp]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider.'); return value; }
