import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, type NearbyPlace } from '@/services/places';

import { DiscoverySurface } from './discovery-surface';

type PlaceCardProps = {
  place: NearbyPlace;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
};

export function PlaceCard({ place, isFavorite, onPress, onToggleFavorite }: PlaceCardProps) {
  const theme = useTheme();
  const locality = [place.address, place.city].filter(Boolean).join(', ') || place.region;
  const distance = formatDistance(place.distance_meters);

  return (
    <DiscoverySurface style={styles.card}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" themeColor="accent" style={styles.category} numberOfLines={1}>
          {place.category_name}
        </ThemedText>
        {distance ? <ThemedText type="smallBold">{distance}</ThemedText> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View details for ${place.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.detailsPressable, pressed && styles.pressed]}>
        <ThemedText type="default" style={styles.name} numberOfLines={2}>
          {place.name}
        </ThemedText>
        {locality ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {locality}
          </ThemedText>
        ) : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? `Remove ${place.name} from favorites` : `Save ${place.name} to favorites`}
        onPress={onToggleFavorite}
        hitSlop={8}
        style={({ pressed }) => [styles.favorite, { borderColor: theme.border }, pressed && styles.pressed]}>
        <ThemedText style={[styles.favoriteIcon, { color: isFavorite ? theme.accent : theme.textSecondary }]}>
          {isFavorite ? '♥' : '♡'}
        </ThemedText>
      </Pressable>
    </DiscoverySurface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    minHeight: 132,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  category: {
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailsPressable: {
    gap: Spacing.half,
    paddingRight: 42,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  favorite: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: Spacing.three,
    top: 50,
    width: 36,
  },
  favoriteIcon: {
    fontSize: 21,
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.65,
  },
});
