import { StyleSheet } from 'react-native';

import { SecondaryButton } from '@/components/ui/clay';
import { Spacing } from '@/constants/theme';
import { START_OVER_LABEL } from '@/services/planning-session';

/** A single reset control for every active itinerary lifecycle state. */
export function StartOverAction({ onPress }: { onPress: () => void }) {
  return <SecondaryButton label={START_OVER_LABEL} accessibilityLabel={START_OVER_LABEL} labelNumberOfLines={1} onPress={onPress} style={startOverActionStyles.button} />;
}

export const startOverActionStyles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 48,
    minWidth: 112,
    paddingHorizontal: Spacing.lg,
  },
});
