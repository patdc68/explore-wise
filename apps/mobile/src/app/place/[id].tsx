import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PriceSummary } from '@/components/discovery/price-summary';
import { PlaceVisual } from '@/components/discovery/place-visual';
import { StateCard } from '@/components/discovery/state-card';
import { ItineraryMap } from '@/components/itinerary/itinerary-map';
import { ThemedText } from '@/components/themed-text';
import { ClayCard, IconButton, LoadingCard, PrimaryButton, ScreenSection, SecondaryButton, SectionHeader } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useFavorites } from '@/hooks/use-favorites';
import { useDesignTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { fetchCommunityAggregate, formatPesoMinor, type CommunityAggregate } from '@/services/community';
import { fetchPlaceDetail, fetchPricedNearbyPlaces, formatDistance, type PlaceDetail, type PricedNearbyPlace } from '@/services/places';

function firstParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function asFiniteNumber(value: string | string[] | undefined) { const number = Number(firstParam(value)); return Number.isFinite(number) ? number : null; }

export default function PlaceDetailScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const params = useLocalSearchParams<{ id: string; latitude?: string; longitude?: string; distanceMeters?: string }>();
  const placeId = firstParam(params.id);
  const latitude = asFiniteNumber(params.latitude);
  const longitude = asFiniteNumber(params.longitude);
  const distance = formatDistance(asFiniteNumber(params.distanceMeters));
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [pricedPlace, setPricedPlace] = useState<PricedNearbyPlace | null>(null);
  const [community, setCommunity] = useState<CommunityAggregate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { favoriteIds, toggleFavorite } = useFavorites();
  const { user, queueAfterAuthentication } = useAuth();

  const loadPlace = useCallback(async () => {
    if (!placeId) { setError('This place could not be found.'); setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const [detail, aggregate] = await Promise.all([fetchPlaceDetail(placeId), fetchCommunityAggregate(placeId).catch(() => null)]);
      setPlace(detail);
      setCommunity(aggregate);
      if (latitude !== null && longitude !== null) {
        try {
          const aroundPlace = await fetchPricedNearbyPlaces({ coordinates: { latitude, longitude }, radiusMeters: 80, resultLimit: 20 });
          setPricedPlace(aroundPlace.find((candidate) => candidate.place_id === placeId) ?? null);
        } catch { setPricedPlace(null); }
      }
    } catch { setError('We couldn’t load this place right now. Please try again.'); }
    finally { setIsLoading(false); }
  }, [latitude, longitude, placeId]);

  useEffect(() => { void loadPlace(); }, [loadPlace]);
  const locationLabel = useMemo(() => [place?.address, place?.district, place?.city, place?.region].filter(Boolean).join(', '), [place]);
  const openUrl = async (url: string) => { const supported = await Linking.canOpenURL(url); if (!supported) { Alert.alert('Unable to open link', 'This action is not available on your device.'); return; } await Linking.openURL(url); };
  const handleFavorite = () => {
    if (!placeId) return;
    if (!user) {
      queueAfterAuthentication(() => toggleFavorite(placeId));
      Alert.alert('Sign in to save places', 'Create an account or sign in to keep this place.', [{ text: 'Sign In', onPress: () => router.push('/auth/sign-in') }, { text: 'Create Account', onPress: () => router.push('/auth/sign-up') }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    void toggleFavorite(placeId).catch(() => Alert.alert('Favorites unavailable', 'Please try again.'));
  };
  const handleReport = () => {
    if (!placeId) return;
    const go = () => router.push({ pathname: '/place/[id]/report', params: { id: placeId, name: place?.name ?? '' } } as never);
    if (!user) {
      queueAfterAuthentication(go);
      Alert.alert('Sign in to contribute', 'Sign in to share a rating or reported spend.', [{ text: 'Sign In', onPress: () => router.push('/auth/sign-in') }, { text: 'Create Account', onPress: () => router.push('/auth/sign-up') }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    go();
  };

  return <View style={[styles.screen, { backgroundColor: theme.background.canvas }]}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()} icon={<Ionicons name="chevron-back" size={22} color={theme.text.primary} accessible={false} />} />
          <ThemedText style={Typography.label}>Place details</ThemedText>
          <View style={styles.topBarSpacer} />
        </View>
        {isLoading ? <LoadingCard label="Loading place details…" /> : error ? <StateCard title="Couldn’t load this place" message={error} actionLabel="Try again" onAction={() => void loadPlace()} /> : !place ? <StateCard title="Place unavailable" message="This place may no longer be active." actionLabel="Back to Explore" onAction={() => router.back()} /> : <>
          <View style={styles.hero}>
            <View style={styles.media}>
            <PlaceVisual place={{ name: place.name, category_code: place.categoryCode }} placeId={place.id} />
            </View>
            <View style={styles.identity}>
              {place.categoryName ? <ThemedText style={Typography.eyebrow} themeColor="textSecondary">{place.categoryName}</ThemedText> : null}
              <ThemedText accessibilityRole="header" style={Typography.screenTitle}>{place.name}</ThemedText>
              {distance ? <View style={styles.inlineMeta}><Ionicons name="navigate-outline" size={16} color={theme.text.secondary} accessible={false} /><ThemedText style={Typography.metadata} themeColor="textSecondary">{distance} away</ThemedText></View> : null}
              {locationLabel ? <View style={styles.inlineMeta}><Ionicons name="location-outline" size={16} color={theme.text.secondary} accessible={false} /><ThemedText style={[Typography.bodySecondary, styles.flexCopy]} themeColor="textSecondary">{locationLabel}</ThemedText></View> : null}
            </View>
          </View>

          {place.description ? <ScreenSection><SectionHeader title="About this place" /><ThemedText style={Typography.body} themeColor="textSecondary">{place.description}</ThemedText></ScreenSection> : null}

          <ClayCard variant="subtle" style={styles.priceCard}>
            <SectionHeader title="Price transparency" />
              {pricedPlace?.price_source_label ? <ThemedText style={Typography.caption} themeColor="muted">{pricedPlace.price_source_label.toUpperCase()}</ThemedText> : null}
              {pricedPlace ? <PriceSummary place={pricedPlace} /> : <View style={[styles.unknownPrice, { backgroundColor: theme.background.subtle }]}><ThemedText style={Typography.label}>Price not available yet</ThemedText><ThemedText style={Typography.bodySecondary} themeColor="textSecondary">ExploreWise will show official or reference price evidence here when it is available.</ThemedText></View>}
            <CommunitySections aggregate={community} onReport={handleReport} />
          </ClayCard>

          {locationLabel ? <ScreenSection>
            <SectionHeader title="Location" description={locationLabel} />
            {latitude !== null && longitude !== null ? <ClayCard variant="subtle" padding="none" style={styles.map}><ItineraryMap compact start={{ latitude, longitude, label: locationLabel }} startMarkerLabel={place.name} candidates={[]} selected={[]} highlightedId={null} onPressCandidate={() => {}} /></ClayCard> : null}
          </ScreenSection> : null}

          <View style={styles.actions}>
            <PrimaryButton label={favoriteIds.has(place.id) ? 'Saved' : 'Save place'} accessibilityState={{ selected: favoriteIds.has(place.id) }} onPress={handleFavorite} style={styles.actionMain} icon={<Ionicons name={favoriteIds.has(place.id) ? 'heart' : 'heart-outline'} size={18} color={theme.accent.onPrimary} accessible={false} />} />
            {latitude !== null && longitude !== null ? <SecondaryButton label="Navigate" onPress={() => void openUrl(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`)} style={styles.actionMain} icon={<Ionicons name="navigate-outline" size={18} color={theme.action.onSecondary} accessible={false} />} /> : null}
          </View>
          {place.website_url || place.phone_number ? <View style={styles.links}>{place.website_url ? <SecondaryButton label="Website" onPress={() => void openUrl(place.website_url!)} style={styles.linkButton} /> : null}{place.phone_number ? <SecondaryButton label="Call" onPress={() => void openUrl(`tel:${place.phone_number!.replace(/\s+/g, '')}`)} style={styles.linkButton} /> : null}</View> : null}
        </>}
      </ScrollView>
    </SafeAreaView>
  </View>;
}

function CommunitySections({ aggregate, onReport }: { aggregate: CommunityAggregate | null; onReport: () => void }) {
  const showSpend = Boolean(aggregate?.community_spend_available && aggregate.median_spend_per_person_minor !== null);
  return <ScreenSection>
    <SectionHeader title="Community reports" />
    <View style={styles.communityGrid}>
      <View style={styles.communityCard}>
        <ThemedText style={Typography.caption} themeColor="muted">REPORTED SPENDING</ThemedText>
        {showSpend ? <><ThemedText style={Typography.price}>{formatPesoMinor(aggregate!.median_spend_per_person_minor!)}/person</ThemedText><ThemedText style={Typography.caption} themeColor="muted">Median from {aggregate!.spend_report_count} recent {aggregate!.spend_report_count === 1 ? 'report' : 'reports'}</ThemedText></> : <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Not enough reports yet</ThemedText>}
      </View>
      <View style={styles.communityCard}>
        <ThemedText style={Typography.caption} themeColor="muted">COMMUNITY RATING</ThemedText>
        {aggregate?.rating_count ? <ThemedText style={Typography.cardTitle}>{aggregate.average_rating?.toFixed(1)} ★ · {aggregate.rating_count} {aggregate.rating_count === 1 ? 'rating' : 'ratings'}</ThemedText> : <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">No ratings yet</ThemedText>}
      </View>
    </View>
    <SecondaryButton label="Rate / Report Spend" onPress={onReport} fullWidth />
  </ScreenSection>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, safe: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  topBarSpacer: { height: 48, width: 48 },
  hero: { gap: Spacing.md },
  media: { overflow: 'hidden', borderRadius: Radius.hero },
  identity: { gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  inlineMeta: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.xs },
  flexCopy: { flex: 1, minWidth: 0 },
  priceCard: { gap: Spacing.sm },
  unknownPrice: { gap: Spacing.xs, padding: Spacing.mdCompact, borderRadius: 16 },
  communityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  communityCard: { flexBasis: 150, flexGrow: 1, gap: Spacing.xs, paddingVertical: Spacing.sm },
  map: { overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionMain: { flexBasis: 140, flexGrow: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  linkButton: { flexBasis: 120, flexGrow: 1 },
});
