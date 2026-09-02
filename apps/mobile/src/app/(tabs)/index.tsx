import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { FilterChip } from '@/components/discovery/filter-chip';
import { LocationSearchSheet } from '@/components/discovery/location-search-sheet';
import { PlaceCard } from '@/components/discovery/place-card';
import { StateCard } from '@/components/discovery/state-card';
import { DiscoverySurface } from '@/components/discovery/discovery-surface';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCurrentLocation, type LocationState } from '@/hooks/use-current-location';
import { useDiscoveryCategories } from '@/hooks/use-discovery-categories';
import { useFavorites } from '@/hooks/use-favorites';
import { useNearbyPlaces } from '@/hooks/use-nearby-places';
import { useTheme } from '@/hooks/use-theme';
import type { DiscoveryCategory, NearbyPlace } from '@/services/places';

const radiusOptions = [
  { label: '1 km', meters: 1000 },
  { label: '3 km', meters: 3000 },
  { label: '5 km', meters: 5000 },
  { label: '10 km', meters: 10000 },
] as const;

export default function ExploreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const location = useCurrentLocation();
  const { categories, isLoading: isLoadingCategories, error: categoryError, refresh: refreshCategories } =
    useDiscoveryCategories();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [selectedCategory, setSelectedCategory] = useState<DiscoveryCategory | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(5000);
  const [isLocationSearchVisible, setIsLocationSearchVisible] = useState(false);

  const coordinates = location.selection?.coordinates ?? null;
  const { places, isLoading, error, refresh } = useNearbyPlaces({
    coordinates,
    radiusMeters,
    categoryCodes: selectedCategory?.categoryCodes,
  });

  const handleUseCurrentLocation = () => {
    setIsLocationSearchVisible(false);
    void location.requestCurrentLocation();
  };

  const handleToggleFavorite = (place: NearbyPlace) => {
    void toggleFavorite(place.place_id).catch((favoriteError) => {
      Alert.alert(
        'Sign in to save places',
        favoriteError instanceof Error ? favoriteError.message : 'Favorites are unavailable right now.',
      );
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <ThemedText type="smallBold" themeColor="accent" style={styles.eyebrow}>
              EXPLOREWISE
            </ThemedText>
            <ThemedText type="subtitle">Find something good nearby.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Local discovery that starts where you are.
            </ThemedText>
          </View>

          <DiscoverySection title="Location">
            <LocationCard
              location={location}
              onChooseAnotherLocation={() => setIsLocationSearchVisible(true)}
              onUseCurrentLocation={handleUseCurrentLocation}
            />
          </DiscoverySection>

          <DiscoverySection title="What sounds good?">
            <View style={styles.chips}>
              <FilterChip label="Everything" selected={!selectedCategory} onPress={() => setSelectedCategory(null)} />
              {isLoadingCategories ? <ActivityIndicator color={theme.accent} /> : null}
              {categories.map((category) => (
                <FilterChip
                  key={category.code}
                  label={category.name}
                  selected={selectedCategory?.code === category.code}
                  onPress={() => setSelectedCategory(category)}
                />
              ))}
            </View>
            {categoryError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {categoryError} <ThemedText type="linkPrimary" onPress={() => void refreshCategories()}>Try again</ThemedText>
              </ThemedText>
            ) : null}
          </DiscoverySection>

          <DiscoverySection title="How far?">
            <View style={styles.chips}>
              {radiusOptions.map((radius) => (
                <FilterChip
                  key={radius.meters}
                  label={radius.label}
                  selected={radiusMeters === radius.meters}
                  onPress={() => setRadiusMeters(radius.meters)}
                />
              ))}
            </View>
          </DiscoverySection>

          <View style={styles.resultsHeading}>
            <View>
              <ThemedText type="subtitle" style={styles.resultsTitle}>Nearby places</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {coordinates ? 'Nearest places first' : 'Set a location to start exploring'}
              </ThemedText>
            </View>
            {coordinates && !isLoading ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh nearby places" onPress={() => void refresh()} style={styles.refreshButton}>
                <ThemedText type="smallBold" themeColor="accent">Refresh</ThemedText>
              </Pressable>
            ) : null}
          </View>

          {!coordinates ? (
            <StateCard title="Ready when you are" message="Choose a location to see places nearby." />
          ) : isLoading ? (
            <DiscoverySurface style={styles.loadingCard}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">Looking for places around you…</ThemedText>
            </DiscoverySurface>
          ) : error ? (
            <StateCard title="Couldn’t load nearby places" message={error} actionLabel="Try again" onAction={() => void refresh()} />
          ) : places.length === 0 ? (
            <StateCard
              title="Nothing found in this area"
              message="Try a wider radius or a different category."
              actionLabel="Use 10 km"
              onAction={() => setRadiusMeters(10000)}
            />
          ) : (
            <View style={styles.results}>
              {places.map((place) => (
                <PlaceCard
                  key={place.place_id}
                  place={place}
                  isFavorite={favoriteIds.has(place.place_id)}
                  onPress={() =>
                    router.push({
                      pathname: '/place/[id]',
                      params: {
                        id: place.place_id,
                        latitude: String(place.latitude),
                        longitude: String(place.longitude),
                        distanceMeters: String(place.distance_meters),
                      },
                    } as never)
                  }
                  onToggleFavorite={() => handleToggleFavorite(place)}
                />
              ))}
            </View>
          )}
        </ScrollView>
        <LocationSearchSheet
          visible={isLocationSearchVisible}
          onClose={() => setIsLocationSearchVisible(false)}
          onUseCurrentLocation={handleUseCurrentLocation}
        />
      </SafeAreaView>
    </View>
  );
}

function LocationCard({
  location,
  onChooseAnotherLocation,
  onUseCurrentLocation,
}: {
  location: LocationState;
  onChooseAnotherLocation: () => void;
  onUseCurrentLocation: () => void;
}) {
  const isLoading = location.status === 'loading';
  const hasCurrentLocation = location.status === 'ready';
  const isDenied = location.status === 'denied';
  const isUnavailable = location.status === 'unavailable' || location.status === 'error';
  const title = hasCurrentLocation
    ? location.selection.label
    : isDenied
      ? 'Location access is off'
      : isUnavailable
        ? 'We couldn’t get your location'
        : isLoading
          ? 'Finding your location…'
          : 'Find places near you';
  const description = hasCurrentLocation
    ? 'Using your current location'
    : isDenied || isUnavailable
      ? location.message
      : 'Use your device location or choose another area.';

  return (
    <DiscoverySurface style={styles.locationCard}>
      <View style={styles.locationCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{description}</ThemedText>
      </View>
      {isLoading ? <ActivityIndicator accessibilityLabel="Finding current location" /> : null}
      {hasCurrentLocation ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Change location" onPress={onChooseAnotherLocation} style={styles.locationButton}>
          <ThemedText type="smallBold" themeColor="accent">Change</ThemedText>
        </Pressable>
      ) : (
        <View style={styles.locationActions}>
          {(isDenied || isUnavailable) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Choose another location" onPress={onChooseAnotherLocation} style={styles.locationButton}>
              <ThemedText type="smallBold" themeColor="accent">Choose another location</ThemedText>
            </Pressable>
          ) : null}
          {!isLoading ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Use my current location" onPress={onUseCurrentLocation} style={styles.locationButton}>
              <ThemedText type="smallBold" themeColor="accent">{isDenied || isUnavailable ? 'Try again' : 'Use my location'}</ThemedText>
            </Pressable>
          ) : null}
          {!isDenied && !isUnavailable && !isLoading ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Search another location" onPress={onChooseAnotherLocation} style={styles.locationButton}>
              <ThemedText type="smallBold" themeColor="accent">Search another location</ThemedText>
            </Pressable>
          ) : null}
        </View>
      )}
    </DiscoverySurface>
  );
}

function DiscoverySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    paddingBottom: Spacing.six,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    width: '100%',
  },
  heading: { gap: Spacing.one },
  eyebrow: { letterSpacing: 1.4 },
  locationCard: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  locationCopy: { flex: 1, gap: Spacing.half },
  locationActions: { alignItems: 'flex-end', gap: Spacing.half },
  locationButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: Spacing.one },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  resultsHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  resultsTitle: { fontSize: 26, lineHeight: 32 },
  refreshButton: { padding: Spacing.one },
  results: { gap: Spacing.two },
  loadingCard: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  pressed: { opacity: 0.65 },
});
