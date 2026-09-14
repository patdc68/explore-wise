import { useFloatingTabInset } from '@/hooks/use-floating-tab-inset';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceVisual } from '@/components/discovery/place-visual';
import { StateCard } from '@/components/discovery/state-card';
import { ThemedText } from '@/components/themed-text';
import { ClayCard, IconButton, LoadingCard, PrimaryButton, ScreenSection, SecondaryButton, SectionHeader } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useFavorites } from '@/hooks/use-favorites';
import { useDesignTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { getFavoritePlaces, type FavoritePlace } from '@/services/favorites';

export default function FavoritesScreen() {
  const bottomInset = useFloatingTabInset();
  const theme = useDesignTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { isLoading, refresh, toggleFavorite } = useFavorites();
  const [places, setPlaces] = useState<FavoritePlace[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const load = useCallback(async () => {
    if (!user) { setPlaces([]); return; }
    setLoadingPlaces(true);
    try { await refresh(); setPlaces(await getFavoritePlaces()); }
    catch { Alert.alert('Favorites unavailable', 'Please try again.'); }
    finally { setLoadingPlaces(false); }
  }, [refresh, user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <View style={[styles.screen, { backgroundColor: theme.background.canvas }]}>
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <ThemedText style={Typography.eyebrow} themeColor="textSecondary">YOUR PLACES</ThemedText>
          <ThemedText accessibilityRole="header" style={Typography.screenTitle}>Favorites</ThemedText>
          <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Places you saved for later.</ThemedText>
        </View>
        {!user ? <ClayCard variant="hero" style={styles.signIn}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.accent.primarySoft }]}><Ionicons name="heart-outline" size={26} color={theme.text.primary} accessible={false} /></View>
          <ThemedText style={Typography.sectionTitle}>Sign in to save favorites</ThemedText>
          <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Your saved places stay connected to your ExploreWise account.</ThemedText>
          <PrimaryButton label="Sign In" onPress={() => router.push('/auth/sign-in')} fullWidth />
          <SecondaryButton label="Create Account" onPress={() => router.push('/auth/sign-up')} fullWidth />
        </ClayCard> : isLoading || loadingPlaces ? <LoadingCard label="Loading your saved places…" /> : !places.length ? <StateCard title="No saved places yet" message="Tap the heart on a place to add it here." actionLabel="Explore nearby" onAction={() => router.navigate('/' as never)} /> : <ScreenSection>
          <SectionHeader title="Saved places" description={`${places.length} ${places.length === 1 ? 'place' : 'places'}`} />
          <View style={styles.list}>{places.map((place) => <FavoriteCard key={place.id} place={place} onOpen={() => router.push({ pathname: '/place/[id]', params: { id: place.id } } as never)} onRemove={() => void toggleFavorite(place.id).then(load).catch(() => Alert.alert('Favorites unavailable', 'Please try again.'))} />)}</View>
        </ScreenSection>}
      </ScrollView>
    </SafeAreaView>
  </View>;
}

function FavoriteCard({ place, onOpen, onRemove }: { place: FavoritePlace; onOpen: () => void; onRemove: () => void }) {
  const theme = useDesignTheme();
  const location = [place.address, place.city, place.region].filter(Boolean).join(', ');
  return <View style={[styles.card, { borderBottomColor: theme.border.subtle }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={onOpen} style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}>
      <PlaceVisual place={{ name: place.name }} placeId={place.id} tile />
      <View style={styles.cardCopy}>
        <ThemedText style={Typography.caption} themeColor="muted">{(place.category?.name ?? 'PLACE').toUpperCase()}</ThemedText>
        <ThemedText style={Typography.cardTitle}>{place.name}</ThemedText>
        {location ? <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">{location}</ThemedText> : null}
      </View>
    </Pressable>
    <IconButton accessibilityLabel={`Remove ${place.name} from favorites`} onPress={onRemove} variant="ghost" style={styles.remove} icon={<Ionicons name="heart" size={20} color={theme.semantic.error.default} accessible={false} />} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' },
  heading: { gap: Spacing.xs },
  signIn: { alignItems: 'flex-start', gap: Spacing.md },
  emptyIcon: { alignItems: 'center', borderRadius: 999, height: 52, justifyContent: 'center', width: 52 },
  list: { gap: Spacing.mdCompact },
  card: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 1, paddingBottom: Spacing.md },
  cardMain: { flex: 1, minWidth: 0, alignItems: 'stretch', flexDirection: 'row', gap: Spacing.mdCompact, borderRadius: Radius.row },
  cardCopy: { flex: 1, gap: Spacing.xs, minWidth: 0, paddingVertical: Spacing.xs },
  remove: { borderWidth: 0, width: 44, height: 44 },
  pressed: { opacity: 0.76 },
});
