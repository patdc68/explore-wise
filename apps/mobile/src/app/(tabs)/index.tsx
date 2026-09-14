import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';

import { AskWiseCard } from '@/components/ask-wise-card';
import { FilterChip } from '@/components/discovery/filter-chip';
import { LocationSearchSheet } from '@/components/discovery/location-search-sheet';
import { PlaceCard } from '@/components/discovery/place-card';
import { SectionHeader, ClayCard, IconButton, LoadingCard, ScreenSection, SecondaryButton, TertiaryButton } from '@/components/ui/clay';
import { useFloatingTabInset } from '@/hooks/use-floating-tab-inset';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useCurrentLocation, type LocationState } from '@/providers/current-location-provider';
import { useDiscoveryCategories } from '@/hooks/use-discovery-categories';
import { useFavorites } from '@/hooks/use-favorites';
import { useNearbyPlaces } from '@/hooks/use-nearby-places';
import { useDesignTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { usePlanningHandoff } from '@/providers/planning-handoff-provider';
import type { DiscoveryCategory, PricedNearbyPlace } from '@/services/places';

const radiusOptions = [{ label: '1 km', meters: 1000 }, { label: '3 km', meters: 3000 }, { label: '5 km', meters: 5000 }, { label: '10 km', meters: 10000 }] as const;

export default function ExploreScreen() {
  const bottomInset = useFloatingTabInset();
  const router = useRouter(); const theme = useDesignTheme(); const location = useCurrentLocation();
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
  return (
    <View style={[styles.screen, { backgroundColor: theme.background.canvas }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { backgroundColor: theme.accent.primary }]}><Ionicons name="compass" size={20} color={theme.accent.onPrimary} accessible={false} /></View>
            <View style={styles.heading}>
              <ThemedText accessibilityRole="header" style={Typography.cardTitle}>ExploreWise</ThemedText>
            </View>
          </View>

          <LocationCard location={location} onChooseAnotherLocation={() => setIsLocationSearchVisible(true)} onUseCurrentLocation={handleUseCurrentLocation} />

          <AskWiseCard prompt={wisePrompt} onChangePrompt={setWisePrompt} onSubmit={() => submitWise(wisePrompt)} />

          {!coordinates ? (
            <ThemedText type="small" themeColor="textSecondary">Choose a location above to see places nearby.</ThemedText>
          ) : isLoading ? (
            <View style={styles.pendingResults}><LoadingCard label="Looking for places around you…" /></View>
          ) : error ? (
            <ExploreState title="Couldn’t load nearby places" message="Check your connection and try again." actionLabel="Try again" onAction={() => void refresh()} />
          ) : places.length === 0 ? (
            <ExploreState title="Nothing found in this area" message="Try a wider radius or another category." actionLabel="Use 10 km" onAction={() => setRadiusMeters(10000)} />
          ) : (
            <>
              {priced.length ? <Results title="Recommended for you" subtitle="Places with price information, nearest first." places={priced} favoriteIds={favoriteIds} onPress={(place) => openPlace(router, place)} onToggleFavorite={handleToggleFavorite} /> : null}
              <Results title={priced.length ? 'More places nearby' : 'Places nearby'} subtitle={priced.length ? 'Including places where price evidence is not available yet.' : 'Nearest places first.'} places={nearby} favoriteIds={favoriteIds} onPress={(place) => openPlace(router, place)} onToggleFavorite={handleToggleFavorite} />
            </>
          )}

          <View style={[styles.planningPrompt, { backgroundColor: theme.background.subtle }]}>
            <View style={[styles.planningIcon, { backgroundColor: theme.accent.primarySoft }]}><Ionicons name="map-outline" size={22} color={theme.text.primary} accessible={false} /></View>
            <View style={styles.planningCopy}>
              <ThemedText style={Typography.label}>Planning an entire outing?</ThemedText>
              <ThemedText style={Typography.caption} themeColor="textSecondary">Put your stops together.</ThemedText>
            </View>
            <TertiaryButton label="Build plan" onPress={() => router.navigate('/plan' as never)} style={styles.planAction} />
          </View>

          <ScreenSection>
            <SectionHeader title="Discover your way" description="Browse nearby places by category." />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChips} style={styles.categoryScroll}>
              <FilterChip label="Everything" selected={!selectedCategory} onPress={() => setSelectedCategory(null)} />
              {categories.slice(0, 5).map((category) => <FilterChip key={category.code} label={category.name} selected={selectedCategory?.code === category.code} onPress={() => setSelectedCategory(category)} />)}
            </ScrollView>
            {isLoadingCategories ? <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">Loading categories…</ThemedText> : null}
            {categoryError ? <View><ThemedText type="small" themeColor="textSecondary">Categories are unavailable.</ThemedText><TertiaryButton label="Try again" accessibilityLabel="Retry loading categories" onPress={() => void refreshCategories()} style={styles.retry} /></View> : null}
          </ScreenSection>

          <ScreenSection style={[styles.radius, { borderTopColor: theme.border.subtle }]}>
            <ThemedText accessibilityRole="header" style={Typography.label}>Discovery radius</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{radiusOptions.find((radius) => radius.meters === radiusMeters)?.label} around your discovery location</ThemedText>
            <View style={styles.chips}>
              {radiusOptions.map((radius) => <FilterChip key={radius.meters} label={radius.label} accessibilityLabel={`Discovery radius: ${radius.label}`} selected={radiusMeters === radius.meters} onPress={() => setRadiusMeters(radius.meters)} />)}
            </View>
          </ScreenSection>
        </ScrollView>
        <LocationSearchSheet visible={isLocationSearchVisible} onClose={() => setIsLocationSearchVisible(false)} onUseCurrentLocation={handleUseCurrentLocation} />
      </SafeAreaView>
    </View>
  );
}

function openPlace(router: ReturnType<typeof useRouter>, place: PricedNearbyPlace) { router.push({ pathname: '/place/[id]', params: { id: place.place_id, latitude: String(place.latitude), longitude: String(place.longitude), distanceMeters: String(place.distance_meters) } } as never); }

function Results({ title, subtitle, places, favoriteIds, onPress, onToggleFavorite }: { title: string; subtitle: string; places: PricedNearbyPlace[]; favoriteIds: Set<string>; onPress: (place: PricedNearbyPlace) => void; onToggleFavorite: (place: PricedNearbyPlace) => void }) {
  if (!places.length) return null;
  return (
    <ScreenSection>
      <SectionHeader title={title} description={subtitle} />
      <View style={styles.results}>{places.map((place) => <PlaceCard key={place.place_id} place={place} isFavorite={favoriteIds.has(place.place_id)} onPress={() => onPress(place)} onToggleFavorite={() => onToggleFavorite(place)} />)}</View>
    </ScreenSection>
  );
}

function ExploreState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel: string; onAction: () => void }) {
  return (
    <ClayCard variant="subtle" style={styles.pendingResults} accessibilityLiveRegion="polite">
      <ThemedText style={Typography.cardTitle}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{message}</ThemedText>
      <SecondaryButton label={actionLabel} onPress={onAction} fullWidth />
    </ClayCard>
  );
}

function LocationCard({ location, onChooseAnotherLocation, onUseCurrentLocation }: { location: LocationState; onChooseAnotherLocation: () => void; onUseCurrentLocation: () => void }) {
  const theme = useDesignTheme();
  const hasCurrentLocation = location.status === 'ready';
  const loading = location.status === 'loading';
  const denied = location.status === 'denied' || location.status === 'unavailable' || location.status === 'error';
  const title = hasCurrentLocation ? location.selection.label : loading ? 'Finding your location…' : 'Choose a location';
  const message = hasCurrentLocation ? 'Your planning and discovery area' : denied ? location.message : 'Use your device location or choose an area.';
  return (
    <View style={styles.locationCard}>
      <View style={styles.locationActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={hasCurrentLocation ? 'Change location' : 'Choose location'} onPress={onChooseAnotherLocation} style={[styles.locationHeader, { backgroundColor: theme.background.surface, borderColor: theme.border.subtle }]}>
        <View style={[styles.locationIcon, { backgroundColor: theme.accent.primarySoft }]}><Ionicons name="location-outline" color={theme.text.primary} size={20} accessible={false} /></View>
        <View style={styles.locationCopy}>
          <ThemedText style={Typography.metadata} themeColor="muted">{hasCurrentLocation ? 'CURRENT LOCATION' : 'DISCOVERY LOCATION'}</ThemedText>
          <ThemedText style={Typography.label}>{title}</ThemedText>
        </View>
        <Ionicons name="chevron-down" color={theme.text.muted} size={16} accessible={false} />
      </Pressable>
      <IconButton accessibilityLabel="Use my current location" onPress={onUseCurrentLocation} disabled={loading} variant="ghost" style={styles.locateControl} icon={<Ionicons name="locate-outline" size={20} color={theme.text.secondary} accessible={false} />} />
      </View>
      {!hasCurrentLocation ? <ThemedText style={Typography.caption} themeColor="textSecondary" accessibilityLiveRegion="polite">{message}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.section, maxWidth: MaxContentWidth, paddingBottom: Spacing.six, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, width: '100%' },
  heading: { gap: Spacing.xs, flex: 1 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  brandMark: { alignItems: 'center', borderRadius: Radius.pill, height: 38, justifyContent: 'center', width: 38 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryScroll: { marginHorizontal: -Spacing.md },
  categoryChips: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  radius: { borderTopWidth: 1, paddingTop: Spacing.lg },
  locationCard: { gap: Spacing.xs },
  locationHeader: { flex: 1, minWidth: 0, minHeight: 52, padding: Spacing.sm, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  locationIcon: { alignItems: 'center', borderRadius: Radius.small, height: 36, justifyContent: 'center', width: 36 },
  locationCopy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  locationActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  locateControl: { borderWidth: 0, height: 44, width: 44 },
  locationAction: { flexBasis: 120, flexGrow: 1, flexShrink: 0, paddingHorizontal: Spacing.sm },
  results: { gap: Spacing.mdCompact },
  planningPrompt: { borderRadius: Radius.row, padding: Spacing.mdCompact, alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  planningIcon: { alignItems: 'center', borderRadius: Radius.pill, height: 44, justifyContent: 'center', width: 44 },
  planningCopy: { flexBasis: 120, flexGrow: 1, gap: Spacing.xs, minWidth: 0 },
  planAction: { minHeight: 44, paddingHorizontal: Spacing.sm },
  pendingResults: { minHeight: 180, justifyContent: 'center', gap: Spacing.mdCompact },
  retry: { alignSelf: 'flex-start' },
});
