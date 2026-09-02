import { StyleSheet, View, type ViewProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function DiscoverySurface({ style, ...props }: ViewProps) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        styles.surface,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.three,
    shadowOffset: { width: 5, height: 7 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
});
