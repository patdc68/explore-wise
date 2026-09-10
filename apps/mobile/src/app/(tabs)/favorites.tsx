import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';

import { StateCard } from '@/components/discovery/state-card';
import { ThemedText } from '@/components/themed-text';
import { ClaySurface, LoadingCard, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useFavorites } from '@/hooks/use-favorites';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { getFavoritePlaces, type FavoritePlace } from '@/services/favorites';

export default function FavoritesScreen() {
  const theme = useTheme(); const router = useRouter(); const { user } = useAuth(); const { isLoading, refresh, toggleFavorite } = useFavorites(); const [places, setPlaces] = useState<FavoritePlace[]>([]); const [loadingPlaces, setLoadingPlaces] = useState(false);
  const load = useCallback(async () => { if (!user) { setPlaces([]); return; } setLoadingPlaces(true); try { await refresh(); setPlaces(await getFavoritePlaces()); } catch { Alert.alert('Favorites unavailable', 'Please try again.'); } finally { setLoadingPlaces(false); } }, [refresh, user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView edges={['top']} style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}><View style={styles.heading}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>YOUR PLACES</ThemedText><ThemedText style={Typography.screenHeading}>Favorites</ThemedText><ThemedText type="small" themeColor="textSecondary">Keep the places you want to come back to.</ThemedText></View>{!user ? <ClaySurface elevation="raised" style={styles.signIn}><ThemedText style={Typography.cardTitle}>Sign in to save favorites</ThemedText><ThemedText type="small" themeColor="textSecondary">Your saved places stay with your ExploreWise account.</ThemedText><PrimaryButton label="Sign In" onPress={() => router.push('/auth/sign-in')} /><SecondaryButton label="Create Account" onPress={() => router.push('/auth/sign-up')} /></ClaySurface> : isLoading || loadingPlaces ? <LoadingCard label="Loading your saved places…" /> : !places.length ? <StateCard title="No saved places yet" message="Tap the heart on a place to add it here." /> : <View style={styles.list}>{places.map((place) => <ClaySurface key={place.id} style={styles.card}><Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } } as never)}><ThemedText type="smallBold" themeColor="textSecondary">{place.category?.name ?? 'PLACE'}</ThemedText><ThemedText style={Typography.cardTitle}>{place.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{[place.address, place.city, place.region].filter(Boolean).join(', ')}</ThemedText></Pressable><SecondaryButton label="Remove" onPress={() => void toggleFavorite(place.id).then(load).catch(() => Alert.alert('Favorites unavailable', 'Please try again.'))} /></ClaySurface>)}</View>}</ScrollView></SafeAreaView></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, safeArea: { flex: 1 }, content: { alignSelf: 'center', gap: Spacing.md, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' }, heading: { gap: Spacing.xs }, eyebrow: { fontSize: 11, letterSpacing: 1.1 }, signIn: { gap: Spacing.md }, list: { gap: Spacing.sm }, card: { gap: Spacing.md } });
