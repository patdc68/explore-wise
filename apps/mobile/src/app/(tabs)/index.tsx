import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';

import { AskWiseCard } from '@/components/ask-wise-card';
import { FilterChip } from '@/components/discovery/filter-chip';
import { LocationSearchSheet } from '@/components/discovery/location-search-sheet';
import { PlaceCard } from '@/components/discovery/place-card';
import { StateCard } from '@/components/discovery/state-card';
import { SectionHeader, ClaySurface, LoadingCard } from '@/components/ui/clay';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useCurrentLocation, type LocationState } from '@/providers/current-location-provider';
import { useDiscoveryCategories } from '@/hooks/use-discovery-categories';
import { useFavorites } from '@/hooks/use-favorites';
import { useNearbyPlaces } from '@/hooks/use-nearby-places';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { usePlanningHandoff } from '@/providers/planning-handoff-provider';
import type { DiscoveryCategory, PricedNearbyPlace } from '@/services/places';

const radiusOptions = [{ label: '1 km', meters: 1000 }, { label: '3 km', meters: 3000 }, { label: '5 km', meters: 5000 }, { label: '10 km', meters: 10000 }] as const;

export default function ExploreScreen() {
  const router = useRouter(); const theme = useTheme(); const location = useCurrentLocation();
  const { submitFromExplore } = usePlanningHandoff();
  const { categories, isLoading: isLoadingCategories, error: categoryError, refresh: refreshCategories } = useDiscoveryCategories();
  const { favoriteIds, toggleFavorite } = useFavorites(); const { user, queueAfterAuthentication } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<DiscoveryCategory | null>(null); const [radiusMeters, setRadiusMeters] = useState(5000); const [isLocationSearchVisible, setIsLocationSearchVisible] = useState(false); const [wisePrompt, setWisePrompt] = useState('');
  const coordinates = location.selection?.coordinates ?? null;
  const { places, isLoading, error, refresh } = useNearbyPlaces({ coordinates, radiusMeters, categoryCodes: selectedCategory?.categoryCodes });
  const handleUseCurrentLocation = () => { setIsLocationSearchVisible(false); void location.requestCurrentLocation(); };
  const handleToggleFavorite = (place: PricedNearbyPlace) => {
    if (!user) {
      queueAfterAuthentication(() => toggleFavorite(place.place_id));
      Alert.alert('Sign in to save places', 'Create an account or sign in to keep this place.', [
        { text: 'Sign In', onPress: () => router.push('/auth/sign-in') },
        { text: 'Create Account', onPress: () => router.push('/auth/sign-up') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    void toggleFavorite(place.place_id).catch(() => Alert.alert('Favorites unavailable', 'Please try again.'));
  };
  const priced = places.filter((place) => place.has_price && !['likely_exceeds', 'exceeds'].includes(place.budget_status ?? ''));
  const nearby = places.filter((place) => !priced.some((pricedPlace) => pricedPlace.place_id === place.place_id));
  const submitWise = (submittedPrompt: string) => { if (!submittedPrompt.trim()) return; submitFromExplore(submittedPrompt); router.navigate('/plan' as never); };
  return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView edges={['top']} style={styles.safeArea}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={styles.heading}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>EXPLOREWISE · METRO MANILA</ThemedText><ThemedText style={Typography.screenHeading}>Explore more.<ThemedText style={{ color: theme.textSecondary }}> Spend wisely.</ThemedText></ThemedText><ThemedText type="small" themeColor="textSecondary">Ideas that fit your moment, not just your map.</ThemedText></View>
    <LocationCard location={location} onChooseAnotherLocation={() => setIsLocationSearchVisible(true)} onUseCurrentLocation={handleUseCurrentLocation} />
    <AskWiseCard prompt={wisePrompt} onChangePrompt={setWisePrompt} onSubmit={() => submitWise(wisePrompt)} onSuggestionSubmit={submitWise} />
    <View style={styles.section}><SectionHeader eyebrow="Discover your way" title="What sounds good?" /><View style={styles.chips}><FilterChip label="Everything" selected={!selectedCategory} onPress={() => setSelectedCategory(null)} />{categories.slice(0, 5).map((category) => <FilterChip key={category.code} label={category.name} selected={selectedCategory?.code === category.code} onPress={() => setSelectedCategory(category)} />)}</View>{isLoadingCategories ? <ThemedText type="small" themeColor="textSecondary">Loading categories…</ThemedText> : null}{categoryError ? <ThemedText type="small" themeColor="textSecondary">Categories are unavailable. <ThemedText type="linkPrimary" onPress={() => void refreshCategories()}>Try again</ThemedText></ThemedText> : null}</View>
    <ClaySurface elevation="subtle" style={styles.filterCard}><View><ThemedText type="smallBold" themeColor="textSecondary">DISCOVERY RADIUS</ThemedText><ThemedText style={Typography.cardTitle}>{radiusOptions.find((radius) => radius.meters === radiusMeters)?.label} around you</ThemedText></View><View style={styles.chips}>{radiusOptions.map((radius) => <FilterChip key={radius.meters} label={radius.label} selected={radiusMeters === radius.meters} onPress={() => setRadiusMeters(radius.meters)} />)}</View></ClaySurface>
    {!coordinates ? <StateCard title="Ready when you are" message="Choose a location to see places nearby." actionLabel="Choose location" onAction={() => setIsLocationSearchVisible(true)} /> : isLoading ? <LoadingCard label="Looking for places around you…" /> : error ? <StateCard title="Couldn’t load nearby places" message="Check your connection and try again." actionLabel="Try again" onAction={() => void refresh()} /> : places.length === 0 ? <StateCard title="Nothing found in this area" message="Try a wider radius or another category." actionLabel="Use 10 km" onAction={() => setRadiusMeters(10000)} /> : <>
      {priced.length ? <Results title="Recommended for your budget" subtitle="Places with usable price evidence, nearest first." places={priced} favoriteIds={favoriteIds} onPress={(place) => openPlace(router, place)} onToggleFavorite={handleToggleFavorite} /> : null}
      <Results title={priced.length ? 'More places nearby' : 'Places nearby'} subtitle={priced.length ? 'Including places where price evidence is not available yet.' : 'Nearest places first.'} places={nearby} favoriteIds={favoriteIds} onPress={(place) => openPlace(router, place)} onToggleFavorite={handleToggleFavorite} />
    </>}
  </ScrollView><LocationSearchSheet visible={isLocationSearchVisible} onClose={() => setIsLocationSearchVisible(false)} onUseCurrentLocation={handleUseCurrentLocation} /></SafeAreaView></View>;
}
function openPlace(router: ReturnType<typeof useRouter>, place: PricedNearbyPlace) { router.push({ pathname: '/place/[id]', params: { id: place.place_id, latitude: String(place.latitude), longitude: String(place.longitude), distanceMeters: String(place.distance_meters) } } as never); }
function Results({ title, subtitle, places, favoriteIds, onPress, onToggleFavorite }: { title: string; subtitle: string; places: PricedNearbyPlace[]; favoriteIds: Set<string>; onPress: (place: PricedNearbyPlace) => void; onToggleFavorite: (place: PricedNearbyPlace) => void }) { return <View style={styles.section}><SectionHeader eyebrow={title === 'Recommended for your budget' ? 'Priced first' : undefined} title={title} /><ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText><View style={styles.results}>{places.map((place) => <PlaceCard key={place.place_id} place={place} isFavorite={favoriteIds.has(place.place_id)} onPress={() => onPress(place)} onToggleFavorite={() => onToggleFavorite(place)} />)}</View></View>; }
function LocationCard({ location, onChooseAnotherLocation, onUseCurrentLocation }: { location: LocationState; onChooseAnotherLocation: () => void; onUseCurrentLocation: () => void }) { const theme = useTheme(); const hasCurrentLocation = location.status === 'ready'; const loading = location.status === 'loading'; const denied = location.status === 'denied' || location.status === 'unavailable' || location.status === 'error'; const title = hasCurrentLocation ? location.selection.label : denied ? 'Location needs your input' : loading ? 'Finding your location…' : 'Find places near you'; const message = hasCurrentLocation ? 'Using your current location' : denied ? location.message : 'Use your device location or choose an area.'; return <ClaySurface elevation="subtle" style={styles.locationCard}><View style={[styles.locationIcon, { backgroundColor: theme.accentSoft }]}><Ionicons name="location" color={theme.text} size={18} /></View><View style={styles.locationCopy}><ThemedText style={Typography.cardTitle} numberOfLines={1}>{title}</ThemedText><ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{message}</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel={hasCurrentLocation ? 'Change location' : 'Choose location'} onPress={hasCurrentLocation || denied ? onChooseAnotherLocation : onUseCurrentLocation} style={styles.locationAction}><ThemedText type="smallBold">{hasCurrentLocation ? 'Change' : loading ? '…' : denied ? 'Choose' : 'Use mine'}</ThemedText></Pressable></ClaySurface>; }
const styles = StyleSheet.create({ screen: { flex: 1 }, safeArea: { flex: 1 }, content: { alignSelf: 'center', gap: Spacing.section, maxWidth: MaxContentWidth, paddingBottom: Spacing.six, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, width: '100%' }, heading: { gap: Spacing.xs }, eyebrow: { fontSize: 11, letterSpacing: 1.2 }, section: { gap: Spacing.sm }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, filterCard: { gap: Spacing.md }, locationCard: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md }, locationIcon: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 }, locationCopy: { flex: 1, gap: 1 }, locationAction: { borderRadius: Radius.chip, minHeight: 40, justifyContent: 'center', paddingHorizontal: Spacing.sm }, results: { gap: Spacing.sm } });
