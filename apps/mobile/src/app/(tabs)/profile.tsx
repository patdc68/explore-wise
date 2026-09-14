import { useFloatingTabInset } from '@/hooks/use-floating-tab-inset';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppearanceSetting } from '@/components/appearance-setting';
import { ThemedText } from '@/components/themed-text';
import { ClayCard, PrimaryButton, ScreenSection, SecondaryButton, SectionHeader, TertiaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const bottomInset = useFloatingTabInset();
  const theme = useDesignTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const leave = async () => { try { await signOut(); } catch { Alert.alert('Could not sign out', 'Please try again.'); } };
  return <View style={[styles.screen, { backgroundColor: theme.background.canvas }]}>
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <ThemedText style={Typography.eyebrow} themeColor="textSecondary">YOUR EXPLOREWISE</ThemedText>
          <ThemedText accessibilityRole="header" style={Typography.screenTitle}>Profile</ThemedText>
          <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Your account and appearance preferences.</ThemedText>
        </View>

        <View style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: theme.accent.primary }]}><Ionicons name="person" size={26} color={theme.accent.onPrimary} accessible={false} /></View>
          <View style={styles.copy}>
            <ThemedText style={Typography.cardTitle}>{user ? user.user_metadata.display_name || 'ExploreWise member' : 'ExploreWise Profile'}</ThemedText>
            <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">{user ? user.email ?? 'Signed in' : 'Sign in to keep favorites and community contributions connected to your account.'}</ThemedText>
          </View>
        </View>

        {!user ? <View style={styles.authActions}><PrimaryButton label="Sign In" onPress={() => router.push('/auth/sign-in')} fullWidth /><SecondaryButton label="Create Account" onPress={() => router.push('/auth/sign-up')} fullWidth /></View> : <ScreenSection>
          <SectionHeader title="Your places" />
          <ClayCard variant="subtle" interactive onPress={() => router.push('/favorites')} style={styles.row} accessibilityLabel="Open Favorites">
            <View style={[styles.rowIcon, { backgroundColor: theme.accent.primarySoft }]}><Ionicons name="heart-outline" size={20} color={theme.text.primary} accessible={false} /></View>
            <View style={styles.copy}><ThemedText style={Typography.label}>Favorites</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Revisit the places you saved.</ThemedText></View>
            <Ionicons name="chevron-forward" size={20} color={theme.text.muted} accessible={false} />
          </ClayCard>
        </ScreenSection>}

        <AppearanceSetting />

        {user ? <ScreenSection><SectionHeader title="Account" /><TertiaryButton label="Sign Out" onPress={() => void leave()} fullWidth /></ScreenSection> : null}
      </ScrollView>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, safe: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' },
  heading: { gap: Spacing.xs },
  profile: { paddingVertical: Spacing.lg, alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  avatar: { alignItems: 'center', borderRadius: Radius.pill, height: 58, justifyContent: 'center', width: 58 },
  copy: { flex: 1, gap: Spacing.xs, minWidth: 0 },
  authActions: { gap: Spacing.sm },
  row: { borderRadius: Radius.row, alignItems: 'center', flexDirection: 'row', gap: Spacing.mdCompact },
  rowIcon: { alignItems: 'center', borderRadius: Radius.small, height: 42, justifyContent: 'center', width: 42 },
});
