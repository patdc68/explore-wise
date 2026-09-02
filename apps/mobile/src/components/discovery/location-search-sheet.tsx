import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isLocationSearchAvailable } from '@/services/location-search';

import { DiscoverySurface } from './discovery-surface';

type LocationSearchSheetProps = {
  visible: boolean;
  onClose: () => void;
  onUseCurrentLocation: () => void;
};

export function LocationSearchSheet({
  visible,
  onClose,
  onUseCurrentLocation,
}: LocationSearchSheetProps) {
  const theme = useTheme();

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <DiscoverySurface style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>Choose a location</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close location search" onPress={onClose} style={styles.closeButton}>
              <ThemedText type="smallBold" themeColor="accent">Close</ThemedText>
            </Pressable>
          </View>

          <ThemedText type="default" themeColor="textSecondary">
            {isLocationSearchAvailable
              ? 'Search for a city or area.'
              : 'Location search is being prepared for ExploreWise. For now, use your current location.'}
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            onPress={onUseCurrentLocation}
            style={[styles.primaryAction, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="smallBold" themeColor="accent">Use my current location</ThemedText>
          </Pressable>
        </DiscoverySurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.32)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, gap: Spacing.three, paddingBottom: Spacing.five },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 26, lineHeight: 32 },
  closeButton: { minHeight: 44, justifyContent: 'center', paddingLeft: Spacing.two },
  primaryAction: { alignItems: 'center', borderRadius: 14, minHeight: 52, justifyContent: 'center', paddingHorizontal: Spacing.three },
});
