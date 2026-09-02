import { Alert, ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateCard } from '@/components/discovery/state-card';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFavorites } from '@/hooks/use-favorites';
import { useTheme } from '@/hooks/use-theme';

export default function FavoritesScreen() {
  const theme = useTheme();
  const { favoriteIds, isLoading, requiresAuthentication, refresh } = useFavorites();

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="subtitle">Favorites</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Keep the places you want to come back to.
          </ThemedText>
          {isLoading ? (
            <ActivityIndicator color={theme.accent} style={styles.loading} />
          ) : requiresAuthentication ? (
            <StateCard
              title="Sign in to save favorites"
              message="Favorites are protected by your ExploreWise account. Sign-in will be added in the next account milestone."
              actionLabel="Check again"
              onAction={() => void refresh()}
            />
          ) : favoriteIds.size === 0 ? (
            <StateCard title="No saved places yet" message="Tap the heart on a place to add it here." />
          ) : (
            <StateCard
              title={`${favoriteIds.size} saved ${favoriteIds.size === 1 ? 'place' : 'places'}`}
              message="A full saved-place list will appear here as sign-in is connected."
              actionLabel="Refresh"
              onAction={() => void refresh().catch(() => Alert.alert('Favorites unavailable', 'Please try again.'))}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', flex: 1, gap: Spacing.two, maxWidth: MaxContentWidth, padding: Spacing.three, width: '100%' },
  loading: { marginTop: Spacing.four },
});
