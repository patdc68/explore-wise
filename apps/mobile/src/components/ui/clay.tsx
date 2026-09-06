import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type ViewProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Elevation = keyof typeof Shadows;

export function ClaySurface({ elevation = 'card', style, ...props }: ViewProps & { elevation?: Elevation }) {
  const theme = useTheme();
  return <View {...props} style={[styles.surface, Shadows[elevation], { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }, style]} />;
}

export function PrimaryButton({ label, style, disabled, ...props }: Omit<PressableProps, 'style'> & { label: string; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <Pressable {...props} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.button, disabled ? styles.buttonDisabled : Shadows.raised, { backgroundColor: disabled ? theme.backgroundElement : theme.accent, borderColor: disabled ? theme.border : theme.accentStrong, shadowColor: theme.shadow }, pressed && !disabled && styles.buttonPressed, style]}>
    <ThemedText style={[styles.buttonLabel, { color: disabled ? theme.textSecondary : theme.accentText }]}>{label}</ThemedText>
  </Pressable>;
}

export function SecondaryButton({ label, style, labelNumberOfLines, ...props }: Omit<PressableProps, 'style'> & { label: string; style?: StyleProp<ViewStyle>; labelNumberOfLines?: number }) {
  const theme = useTheme();
  return <Pressable {...props} accessibilityRole="button" style={({ pressed }) => [styles.button, styles.secondaryButton, Shadows.subtle, { backgroundColor: theme.elevatedSurface, borderColor: theme.border, shadowColor: theme.shadow }, pressed && styles.buttonPressed, style]}>
    <ThemedText numberOfLines={labelNumberOfLines} style={styles.buttonLabel}>{label}</ThemedText>
  </Pressable>;
}

export function ClayInput({ style, ...props }: TextInputProps) {
  const theme = useTheme();
  return <TextInput placeholderTextColor={theme.muted} {...props} style={[styles.input, { color: theme.text, backgroundColor: theme.elevatedSurface, borderColor: theme.border }, style]} />;
}

export function SectionHeader({ eyebrow, title, actionLabel, onAction }: { eyebrow?: string; title: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}>
    <View style={styles.sectionCopy}>
      {eyebrow ? <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>{eyebrow}</ThemedText> : null}
      <ThemedText style={Typography.sectionHeading}>{title}</ThemedText>
    </View>
    {actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.headerAction}><ThemedText type="smallBold" themeColor="text">{actionLabel}</ThemedText></Pressable> : null}
  </View>;
}

export function LoadingCard({ label = 'Finding thoughtful options…' }: { label?: string }) {
  const theme = useTheme();
  return <ClaySurface style={styles.loading}><View style={[styles.skeletonIcon, { backgroundColor: theme.accentSoft }]}><ActivityIndicator color={theme.navy} /></View><View style={styles.loadingCopy}><View style={[styles.skeletonLine, { backgroundColor: theme.backgroundElement }]} /><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText></View></ClaySurface>;
}

const styles = StyleSheet.create({
  surface: { borderRadius: Radius.card, borderWidth: 1, padding: Spacing.md },
  button: { alignItems: 'center', borderRadius: Radius.input, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: Spacing.md },
  secondaryButton: { minHeight: 48 },
  buttonLabel: { ...Typography.caption, fontWeight: '800' },
  buttonPressed: { opacity: 0.82, transform: [{ translateY: 2 }], elevation: 1 },
  buttonDisabled: { elevation: 0, shadowOpacity: 0 },
  input: { borderRadius: Radius.input, borderWidth: 1, fontSize: 16, lineHeight: 23, minHeight: 54, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  sectionCopy: { flex: 1, gap: 2 }, eyebrow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  headerAction: { borderRadius: Radius.chip, minHeight: 40, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  loading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md }, skeletonIcon: { alignItems: 'center', borderRadius: 15, height: 46, justifyContent: 'center', width: 46 }, loadingCopy: { flex: 1, gap: Spacing.xs }, skeletonLine: { borderRadius: 5, height: 9, width: '62%' },
});
