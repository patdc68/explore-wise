import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClayCard, IconButton } from '@/components/ui/clay';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { formatDistance, type NearbyPlace, type PricedNearbyPlace } from '@/services/places';
import { PriceSummary } from './price-summary';
import { PlaceVisual } from './place-visual';

type PlaceCardProps = { place: NearbyPlace | PricedNearbyPlace; realImageUrl?: string | null; isFavorite: boolean; onPress: () => void; onToggleFavorite: () => void };

export function PlaceCard({ place, realImageUrl, isFavorite, onPress, onToggleFavorite }: PlaceCardProps) {
  const theme = useDesignTheme();
  const locality = place.city || place.region;
  const distance = formatDistance(place.distance_meters);
  return (
    <ClayCard variant="subtle" padding="none" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View details for ${place.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.details, pressed && styles.pressed]}>
        <PlaceVisual place={place} placeId={place.place_id} realImageUrl={realImageUrl} tile />
        <View style={styles.content}>
          <View style={styles.identity}>
            <ThemedText style={Typography.metadata} themeColor="muted">{place.category_name}</ThemedText>
            <ThemedText style={Typography.cardTitle}>{place.name}</ThemedText>
          </View>
          {locality ? <ThemedText style={Typography.caption} themeColor="textSecondary">{locality}</ThemedText> : null}
          <View style={[styles.metadata, { backgroundColor: theme.background.canvas }]}>
            {'has_price' in place ? <View style={styles.price}><PriceSummary place={place} compact /></View> : null}
            {distance ? (
              <View style={styles.distance}>
                <Ionicons name="navigate-outline" color={theme.text.secondary} size={14} accessible={false} />
                <ThemedText style={styles.distanceText} themeColor="textSecondary">{distance}</ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.favorite}>
        <IconButton
          accessibilityLabel={isFavorite ? `Remove ${place.name} from favorites` : `Save ${place.name} to favorites`}
          selected={isFavorite}
          onPress={onToggleFavorite}
          variant="ghost"
          style={styles.heart}
          icon={<Ionicons accessible={false} color={isFavorite ? theme.semantic.error.default : theme.text.secondary} name={isFavorite ? 'heart' : 'heart-outline'} size={20} />}
        />
      </View>
    </ClayCard>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: Radius.card },
  identity: { paddingRight: TouchTarget.minimum - Spacing.sm },
  heart: { borderWidth: 0, width: TouchTarget.minimum, height: TouchTarget.minimum },
  favorite: { position: 'absolute', right: Spacing.sm, top: Spacing.sm },
  content: { flex: 1, gap: Spacing.xs, minWidth: 0 },
  details: { alignItems: 'stretch', flexDirection: 'row', gap: Spacing.mdCompact, minHeight: TouchTarget.comfortable, minWidth: 0, padding: Spacing.sm },
  metadata: { borderRadius: Radius.row, padding: Spacing.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: Spacing.sm, rowGap: Spacing.xs },
  price: { flexGrow: 1, maxWidth: '100%' },
  distance: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, maxWidth: '100%', paddingVertical: Spacing.half },
  distanceText: { ...Typography.metadata, flexShrink: 1 },
  pressed: { opacity: 0.76 },
});
