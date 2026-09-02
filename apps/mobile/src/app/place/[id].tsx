import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DiscoverySurface } from '@/components/discovery/discovery-surface';
import { StateCard } from '@/components/discovery/state-card';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFavorites } from '@/hooks/use-favorites';
import { useTheme } from '@/hooks/use-theme';
import { fetchPlaceDetail, formatDistance, type PlaceDetail } from '@/services/places';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asFiniteNumber(value: string | string[] | undefined) {
  const number = Number(firstParam(value));
  return Number.isFinite(number) ? number : null;
}

export default function PlaceDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string; latitude?: string; longitude?: string; distanceMeters?: string }>();
  const placeId = firstParam(params.id);
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { favoriteIds, toggleFavorite } = useFavorites();

  const loadPlace = useCallback(async () => {
    if (!placeId) {
      setError('This place could not be found.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setPlace(await fetchPlaceDetail(placeId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Place details could not load.');
    } finally {
      setIsLoading(false);
    }
  }, [placeId]);

  useEffect(() => {
    void loadPlace();
  }, [loadPlace]);

  const latitude = asFiniteNumber(params.latitude);
  const longitude = asFiniteNumber(params.longitude);
  const distance = formatDistance(asFiniteNumber(params.distanceMeters));
  const locationLabel = useMemo(
    () => [place?.address, place?.district, place?.city, place?.region].filter(Boolean).join(', '),
    [place],
  );

  const openUrl = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Unable to open link', 'This action is not available on your device.');
      return;
    }
    await Linking.openURL(url);
  };

  const handleFavorite = () => {
    if (!placeId) return;
    void toggleFavorite(placeId).catch((favoriteError) => {
      Alert.alert(
        'Sign in to save places',
        favoriteError instanceof Error ? favoriteError.message : 'Favorites are unavailable right now.',
      );
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="smallBold" themeColor="accent">‹ Back</ThemedText>
          </Pressable>

          {isLoading ? (
            <DiscoverySurface style={styles.loadingCard}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">Loading place details…</ThemedText>
            </DiscoverySurface>
          ) : error ? (
            <StateCard title="Couldn’t load this place" message={error} actionLabel="Try again" onAction={() => void loadPlace()} />
          ) : !place ? (
            <StateCard title="Place unavailable" message="This place may no longer be active." actionLabel="Back to Explore" onAction={() => router.back()} />
          ) : (
            <>
              <View style={styles.hero}>
                {place.categoryName ? <ThemedText type="smallBold" themeColor="accent" style={styles.eyebrow}>{place.categoryName}</ThemedText> : null}
                <ThemedText type="subtitle" style={styles.name}>{place.name}</ThemedText>
                {distance ? <ThemedText type="smallBold">{distance} away</ThemedText> : null}
              </View>

              {locationLabel ? (
                <DetailSection title="Location">
                  <ThemedText type="default">{locationLabel}</ThemedText>
                </DetailSection>
              ) : null}

              {place.description ? (
                <DetailSection title="About">
                  <ThemedText type="default" themeColor="textSecondary">{place.description}</ThemedText>
                </DetailSection>
              ) : null}

              <DetailSection title="Actions">
                <View style={styles.actions}>
                  <ActionButton label={favoriteIds.has(place.id) ? 'Saved' : 'Save'} onPress={handleFavorite} />
                  {place.website_url ? <ActionButton label="Website" onPress={() => void openUrl(place.website_url!)} /> : null}
                  {place.phone_number ? <ActionButton label="Call" onPress={() => void openUrl(`tel:${place.phone_number!.replace(/\s+/g, '')}`)} /> : null}
                  {latitude !== null && longitude !== null ? (
                    <ActionButton
                      label="Directions"
                      onPress={() => void openUrl(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`)}
                    />
                  ) : null}
                </View>
              </DetailSection>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DiscoverySurface style={styles.detailSection}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </DiscoverySurface>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.actionButton}>
      <ThemedText type="smallBold" themeColor="accent">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.three, maxWidth: MaxContentWidth, padding: Spacing.three, width: '100%' },
  backButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingRight: Spacing.three },
  loadingCard: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  hero: { gap: Spacing.one, paddingVertical: Spacing.two },
  eyebrow: { letterSpacing: 1, textTransform: 'uppercase' },
  name: { fontSize: 34, lineHeight: 40 },
  detailSection: { gap: Spacing.one },
  sectionTitle: { letterSpacing: 0.8, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  actionButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: Spacing.two },
});
