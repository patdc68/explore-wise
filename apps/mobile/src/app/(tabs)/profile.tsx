import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { StateCard } from '@/components/discovery/state-card';
import { ThemedText } from '@/components/themed-text';
import { ClaySurface, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const theme = useTheme(); const router = useRouter(); const { user, signOut } = useAuth();
  const leave = async () => { try { await signOut(); } catch { Alert.alert('Could not sign out', 'Please try again.'); } };
  return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView edges={['top']} style={styles.safe}><ScrollView contentContainerStyle={styles.content}><View style={styles.heading}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>YOUR EXPLOREWISE</ThemedText><ThemedText style={Typography.screenHeading}>Profile</ThemedText><ThemedText type="small" themeColor="textSecondary">Favorites and community contributions stay connected to your account.</ThemedText></View>{!user ? <><ClaySurface elevation="raised" style={styles.profile}><View style={[styles.avatar, { backgroundColor: theme.accent }]}><Ionicons name="person" size={26} color={theme.accentText} /></View><View style={styles.copy}><ThemedText style={Typography.cardTitle}>ExploreWise Profile</ThemedText><ThemedText type="small" themeColor="textSecondary">Sign in to save favorites, contribute ratings and prices, and keep future plans.</ThemedText></View></ClaySurface><PrimaryButton label="Sign In" onPress={() => router.push('/auth/sign-in')} /><SecondaryButton label="Create Account" onPress={() => router.push('/auth/sign-up')} /></> : <><ClaySurface elevation="raised" style={styles.profile}><View style={[styles.avatar, { backgroundColor: theme.accent }]}><Ionicons name="person" size={26} color={theme.accentText} /></View><View style={styles.copy}><ThemedText style={Typography.cardTitle}>{user.user_metadata.display_name || 'ExploreWise member'}</ThemedText><ThemedText type="small" themeColor="textSecondary">{user.email ?? 'Signed in'}</ThemedText></View></ClaySurface><StateCard title="Your saved places" message="Open Favorites to revisit the places you saved." actionLabel="Favorites" onAction={() => router.push('/favorites')} /><SecondaryButton label="Sign Out" onPress={() => void leave()} /></>}</ScrollView></SafeAreaView></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, safe: { flex: 1 }, content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, padding: Spacing.md, width: '100%' }, heading: { gap: Spacing.xs }, eyebrow: { fontSize: 11, letterSpacing: 1.1 }, profile: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md }, avatar: { alignItems: 'center', borderRadius: 20, height: 58, justifyContent: 'center', width: 58 }, copy: { flex: 1, gap: 2 } });
