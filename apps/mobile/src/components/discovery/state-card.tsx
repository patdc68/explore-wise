import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { DiscoverySurface } from './discovery-surface';

type StateCardProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function StateCard({ title, message, actionLabel, onAction }: StateCardProps) {
  return (
    <DiscoverySurface style={styles.card}>
      <View style={styles.content}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}>
          <ThemedText type="smallBold" themeColor="accent">
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </DiscoverySurface>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  content: {
    flex: 1,
    gap: Spacing.half,
  },
  action: {
    padding: Spacing.one,
  },
});
