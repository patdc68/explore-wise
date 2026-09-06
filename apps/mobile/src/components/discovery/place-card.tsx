import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, type NearbyPlace, type PricedNearbyPlace } from '@/services/places';
import { PriceSummary } from './price-summary';
import { DiscoverySurface } from './discovery-surface';

type PlaceCardProps = { place: NearbyPlace | PricedNearbyPlace; isFavorite: boolean; onPress: () => void; onToggleFavorite: () => void };

export function PlaceCard({ place, isFavorite, onPress, onToggleFavorite }: PlaceCardProps) {
  const theme = useTheme();
  const locality = [place.address, place.city].filter(Boolean).join(', ') || place.region;
  const distance = formatDistance(place.distance_meters);
  return <DiscoverySurface style={styles.card}>
    <View style={styles.headerRow}>
      <View style={[styles.categoryIcon, { backgroundColor: theme.accentSoft }]}><Ionicons name="compass" size={17} color={theme.text} /></View>
      <View style={styles.categoryCopy}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.category} numberOfLines={1}>{place.category_name}</ThemedText>{distance ? <ThemedText type="smallBold">{distance}</ThemedText> : null}</View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${place.name}`} onPress={onPress} style={({ pressed }) => [styles.detailsPressable, pressed && styles.pressed]}>
      <ThemedText style={styles.name} numberOfLines={2}>{place.name}</ThemedText>
      {locality ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{locality}</ThemedText> : null}
    </Pressable>
    {'has_price' in place ? <PriceSummary place={place} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? `Remove ${place.name} from favorites` : `Save ${place.name} to favorites`} onPress={onToggleFavorite} hitSlop={8} style={({ pressed }) => [styles.favorite, { backgroundColor: theme.elevatedSurface, borderColor: theme.border }, pressed && styles.pressed]}>
      <Ionicons color={isFavorite ? theme.error : theme.textSecondary} name={isFavorite ? 'heart' : 'heart-outline'} size={20} />
    </Pressable>
  </DiscoverySurface>;
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm, minHeight: 150 },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  categoryIcon: { alignItems: 'center', borderRadius: 13, height: 38, justifyContent: 'center', width: 38 },
  categoryCopy: { flex: 1, gap: 1 },
  category: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  detailsPressable: { gap: 2, paddingRight: 42 },
  name: Typography.cardTitle,
  favorite: { alignItems: 'center', borderRadius: Radius.chip, borderWidth: 1, height: 38, justifyContent: 'center', position: 'absolute', right: Spacing.md, top: Spacing.md, width: 38 },
  pressed: { opacity: 0.76, transform: [{ translateY: 1 }] },
});
