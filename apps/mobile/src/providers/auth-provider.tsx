import type { Session, User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<'success' | 'cancelled'>;
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
  const signInWithGoogle = useCallback(async (): Promise<'success' | 'cancelled'> => {
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error(friendlyAuthError(error?.message ?? 'Google sign-in is unavailable.'));
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return 'cancelled';
    const parsed = Linking.parse(result.url); const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : null;
    const accessToken = typeof parsed.queryParams?.access_token === 'string' ? parsed.queryParams.access_token : null;
    const refreshToken = typeof parsed.queryParams?.refresh_token === 'string' ? parsed.queryParams.refresh_token : null;
    const response = code ? await getSupabaseClient().auth.exchangeCodeForSession(code) : accessToken && refreshToken ? await getSupabaseClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken }) : { error: new Error('Google sign-in did not return a session.') };
    if (response.error) throw new Error(friendlyAuthError(response.error.message));
    return 'success';
  }, []);
  const signOut = useCallback(async () => { const { error } = await getSupabaseClient().auth.signOut(); if (error) throw new Error(friendlyAuthError(error.message)); }, []);
  const queueAfterAuthentication = useCallback((action: () => void | Promise<void>) => { queuedAction.current = action; }, []);
  const completeQueuedAction = useCallback(async () => { const action = queuedAction.current; queuedAction.current = null; if (action) await action(); }, []);
  const value = useMemo(() => ({ user: session?.user ?? null, session, initializing, signIn, signUp, signInWithGoogle, signOut, queueAfterAuthentication, completeQueuedAction }), [completeQueuedAction, initializing, queueAfterAuthentication, session, signIn, signInWithGoogle, signOut, signUp]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider.'); return value; }
