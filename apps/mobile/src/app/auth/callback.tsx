import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ClaySurface, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { googleOAuth } from '@/services/google-oauth';
import { OAUTH_CALLBACK_ERROR } from '@/services/oauth-callback';

export default function GoogleCallbackScreen() {
  const { attempt } = useLocalSearchParams<{ attempt?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { user, initializing, completeGoogleCallback, completeQueuedAction } = useAuth();
  const [completedUserId, setCompletedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigatedAttempt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setCompletedUserId(null);
    setError(null);
    if (typeof attempt !== 'string') { setError(OAUTH_CALLBACK_ERROR); return; }
    void completeGoogleCallback(attempt).then((session) => {
      if (active) setCompletedUserId(session.user.id);
    }).catch(() => { if (active) setError(OAUTH_CALLBACK_ERROR); });
    return () => { active = false; };
  }, [attempt, completeGoogleCallback]);

  useEffect(() => {
    // Wait for AuthProvider's committed signed-in render, including consumers
    // such as Favorites, before running the existing one-shot queued action.
    if (!attempt || initializing || !completedUserId || user?.id !== completedUserId || navigatedAttempt.current === attempt) return;
    navigatedAttempt.current = attempt;
    const state = navigation.getState();
    let previous = (state?.index ?? 0) - 1;
    while (state && previous >= 0 && state.routes[previous].name.startsWith('auth/')) previous--;
    if (state && previous >= 0) router.dismiss(state.index - previous);
    else router.replace('/(tabs)/profile');
    // Dismiss auth screens first so a queued contribution route remains on top.
    if (googleOAuth.claimNavigation(attempt)) {
      void completeQueuedAction().catch(() => {
        Alert.alert('You are signed in', 'We could not finish your saved action. Please try that action again.');
      });
    }
  }, [attempt, completedUserId, completeQueuedAction, initializing, navigation, router, user?.id]);

  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
    <View style={styles.content}><ClaySurface elevation="raised" style={styles.card}>
      <ThemedText type="subtitle">{error ? 'Unable to sign in' : 'Finishing sign-in'}</ThemedText>
      {error ? <>
        <ThemedText type="small" style={{ color: theme.error }}>{error}</ThemedText>
        <PrimaryButton label="Retry" onPress={() => router.replace('/auth/sign-in')} />
        <SecondaryButton label="Back to Profile" onPress={() => router.replace('/(tabs)/profile')} />
      </> : <><ActivityIndicator color={theme.accent} /><ThemedText type="small" themeColor="textSecondary">Connecting your ExploreWise account…</ThemedText></>}
    </ClaySurface></View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', maxWidth: MaxContentWidth, padding: Spacing.md, width: '100%' },
  card: { gap: Spacing.md },
});
