import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Elevation, MaxContentWidth, Radius, Shadows, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useDesignTheme, useThemeElevation } from '@/hooks/use-theme';

type ClayCardVariant = 'default' | 'subtle' | 'raised' | 'hero' | 'interactive';
type ClayPadding = 'none' | 'compact' | 'default' | 'spacious' | number;

export type ClayCardProps = Omit<PressableProps, 'children' | 'style'> & {
  children?: ReactNode;
  interactive?: boolean;
  padding?: ClayPadding;
  style?: StyleProp<ViewStyle>;
  variant?: ClayCardVariant;
};

const cardDepth: Record<ClayCardVariant, keyof typeof Elevation> = {
  default: 'subtle',
  subtle: 'flat',
  raised: 'raised',
  hero: 'hero',
  interactive: 'raised',
};

const cardPadding: Record<Exclude<ClayPadding, number>, number> = {
  none: 0,
  compact: Spacing.mdCompact,
  default: Spacing.card,
  spacious: Spacing.lg,
};

/** A restrained clay surface. It only becomes pressable when explicitly interactive. */
export function ClayCard({
  accessibilityRole,
  accessibilityState,
  children,
  disabled,
  interactive = false,
  onPress,
  padding = 'default',
  style,
  variant = interactive ? 'interactive' : 'default',
  ...props
}: ClayCardProps) {
  const theme = useDesignTheme();
  const elevation = useThemeElevation();
  const isInteractive = interactive || Boolean(onPress);
  const resolvedPadding = typeof padding === 'number' ? padding : cardPadding[padding];
  const surfaceStyle: StyleProp<ViewStyle> = [
    styles.card,
    variant === 'hero' && styles.heroCard,
    elevation[cardDepth[variant]],
    {
      backgroundColor: variant === 'subtle' ? theme.background.surface : theme.background.surfaceRaised,
      borderColor: variant === 'hero' ? theme.depth.highlight : theme.border.subtle,
      padding: resolvedPadding,
      shadowColor: theme.depth.shadow,
    },
    style,
  ];

  if (!isInteractive) {
    return <View {...props} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState} style={surfaceStyle}>{children}</View>;
  }

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [surfaceStyle, pressed && !disabled && styles.pressablePressed]}>
      {children}
    </Pressable>
  );
}

type LegacyElevation = keyof typeof Shadows;

/** Phase 1 compatibility wrapper; new code should prefer ClayCard variants. */
export function ClaySurface({ elevation = 'card', style, ...props }: ViewProps & { elevation?: LegacyElevation }) {
  const variant: ClayCardVariant = elevation === 'floating' || elevation === 'hero' ? 'hero' : elevation === 'raised' || elevation === 'card' ? 'raised' : elevation === 'flat' ? 'subtle' : 'default';
  return <ClayCard {...props} variant={variant} style={style} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export type ClayButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  fullWidth?: boolean;
  icon?: ReactNode;
  label: string;
  labelNumberOfLines?: number;
  loading?: boolean;
  loadingLabel?: string;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

export function ClayButton({
  accessibilityLabel,
  accessibilityState,
  disabled,
  fullWidth = false,
  icon,
  label,
  labelNumberOfLines = 1,
  loading = false,
  loadingLabel,
  style,
  variant = 'primary',
  ...props
}: ClayButtonProps) {
  const theme = useDesignTheme();
  const elevation = useThemeElevation();
  const inactive = Boolean(disabled || loading);
  const colors = {
    primary: { background: theme.accent.primary, border: theme.accent.primaryPressed, text: theme.accent.onPrimary },
    secondary: { background: theme.action.secondary, border: theme.action.secondaryPressed, text: theme.action.onSecondary },
    tertiary: { background: theme.action.tertiary, border: 'transparent', text: theme.action.onTertiary },
    destructive: { background: theme.semantic.error.soft, border: theme.semantic.error.default, text: theme.semantic.error.default },
  }[variant];
  const disabledColors = { background: theme.background.subtle, border: theme.border.subtle, text: theme.text.muted };
  const activeColors = inactive ? disabledColors : colors;
  const visibleLabel = loading ? loadingLabel ?? label : label;

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: inactive }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'tertiary' ? elevation.flat : variant === 'primary' ? elevation.raised : elevation.subtle,
        fullWidth && styles.fullWidth,
        { backgroundColor: activeColors.background, borderColor: activeColors.border, shadowColor: theme.depth.shadow },
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        style,
      ]}>
      <View style={styles.buttonContent}>
        {loading ? <ActivityIndicator color={activeColors.text} size="small" /> : icon}
        <ThemedText
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1.5}
          numberOfLines={labelNumberOfLines}
          style={[styles.buttonLabel, { color: activeColors.text }]}>
          {visibleLabel}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function PrimaryButton({ disabled, style, ...props }: Omit<ClayButtonProps, 'variant'>) {
  const elevation = useThemeElevation();
  return <ClayButton {...props} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} variant="primary" style={[disabled ? styles.buttonDisabled : elevation.raised, style]} />;
}

export function SecondaryButton(props: Omit<ClayButtonProps, 'variant'>) {
  return <ClayButton {...props} variant="secondary" />;
}

export function TertiaryButton(props: Omit<ClayButtonProps, 'variant'>) {
  return <ClayButton {...props} variant="tertiary" />;
}

export function DestructiveButton(props: Omit<ClayButtonProps, 'variant'>) {
  return <ClayButton {...props} variant="destructive" />;
}

export type ClayInputProps = TextInputProps & {
  disabled?: boolean;
  error?: boolean | string;
};

export function ClayInput({
  accessibilityHint,
  accessibilityState,
  disabled = false,
  editable,
  error = false,
  onBlur,
  onFocus,
  placeholderTextColor,
  style,
  ...props
}: ClayInputProps) {
  const theme = useDesignTheme();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);

  return (
    <TextInput
      {...props}
      accessibilityHint={typeof error === 'string' ? error : accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      aria-invalid={hasError}
      editable={disabled ? false : editable}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      placeholderTextColor={placeholderTextColor ?? theme.text.muted}
      style={[
        styles.input,
        {
          backgroundColor: disabled ? theme.background.subtle : theme.background.surfaceRaised,
          borderColor: hasError ? theme.semantic.error.default : focused ? theme.border.focus : theme.border.default,
          color: disabled ? theme.text.muted : theme.text.primary,
        },
        focused && styles.inputFocused,
        hasError && styles.inputError,
        style,
      ]}
    />
  );
}

export type ChoiceChipProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  labelNumberOfLines?: number;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ChoiceChip({ accessibilityLabel, accessibilityState, disabled, label, labelNumberOfLines = 1, selected = false, style, ...props }: ChoiceChipProps) {
  const theme = useDesignTheme();
  const elevation = useThemeElevation();
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? `${label}${selected ? ', selected' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled), selected }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        elevation.flat,
        {
          backgroundColor: disabled ? theme.background.subtle : selected ? theme.accent.primary : theme.background.surfaceRaised,
          borderColor: selected ? theme.accent.primaryPressed : theme.border.default,
          shadowColor: theme.depth.shadow,
        },
        selected && styles.chipSelected,
        pressed && !disabled && styles.chipPressed,
        disabled && styles.disabled,
        style,
      ]}>
      {selected ? <ThemedText accessibilityElementsHidden importantForAccessibility="no" style={[styles.chipCheck, { color: disabled ? theme.text.muted : theme.accent.onPrimary }]}>✓</ThemedText> : null}
      <ThemedText maxFontSizeMultiplier={1.5} numberOfLines={labelNumberOfLines} style={[Typography.label, { color: disabled ? theme.text.muted : selected ? theme.accent.onPrimary : theme.text.primary }]}>{label}</ThemedText>
    </Pressable>
  );
}

export const FilterChip = ChoiceChip;

type IconButtonVariant = 'surface' | 'accent' | 'ghost';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  accessibilityLabel: string;
  icon: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: IconButtonVariant;
};

export function IconButton({ accessibilityLabel, accessibilityState, disabled, icon, selected = false, style, variant = 'surface', ...props }: IconButtonProps) {
  const theme = useDesignTheme();
  const elevation = useThemeElevation();
  const backgroundColor = disabled
    ? theme.background.subtle
    : selected || variant === 'accent'
      ? theme.accent.primarySoft
      : variant === 'ghost'
        ? 'transparent'
        : theme.background.surfaceRaised;
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled), selected }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'ghost' ? elevation.flat : elevation.subtle,
        { backgroundColor, borderColor: selected ? theme.accent.primaryPressed : theme.border.subtle, shadowColor: theme.depth.shadow },
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabled,
        style,
      ]}>
      {icon}
    </Pressable>
  );
}

type MetadataTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export function MetadataBadge({ icon, label, tone = 'neutral' }: { icon?: ReactNode; label: string; tone?: MetadataTone }) {
  const theme = useDesignTheme();
  const colors = {
    neutral: { background: theme.background.subtle, text: theme.text.secondary },
    accent: { background: theme.accent.primarySoft, text: theme.text.primary },
    success: { background: theme.semantic.success.soft, text: theme.semantic.success.default },
    warning: { background: theme.semantic.warning.soft, text: theme.semantic.warning.default },
    error: { background: theme.semantic.error.soft, text: theme.semantic.error.default },
    info: { background: theme.semantic.info.soft, text: theme.semantic.info.default },
  }[tone];
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: colors.background, borderColor: theme.border.subtle }]}>
      {icon}
      <ThemedText maxFontSizeMultiplier={1.5} numberOfLines={1} style={[Typography.badge, { color: colors.text }]}>{label}</ThemedText>
    </View>
  );
}

export function SectionHeader({
  actionLabel,
  description,
  eyebrow,
  onAction,
  title,
  trailing,
}: {
  actionLabel?: string;
  description?: string;
  eyebrow?: string;
  onAction?: () => void;
  title: string;
  trailing?: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        {eyebrow ? <ThemedText style={[Typography.eyebrow, { color: theme.text.secondary }]}>{eyebrow}</ThemedText> : null}
        <ThemedText style={Typography.sectionTitle}>{title}</ThemedText>
        {description ? <ThemedText style={[Typography.bodySecondary, { color: theme.text.secondary }]}>{description}</ThemedText> : null}
      </View>
      {trailing ?? (actionLabel && onAction ? <TertiaryButton accessibilityLabel={actionLabel} label={actionLabel} onPress={onAction} style={styles.headerAction} /> : null)}
    </View>
  );
}

export function ScreenSection({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.section, style]} />;
}

export type ScreenContainerProps = ViewProps & {
  bottomActionSpacing?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  safeAreaEdges?: Edge[];
  scroll?: boolean;
};

export function ScreenContainer({
  bottomActionSpacing = true,
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  safeAreaEdges = ['top'],
  scroll = true,
  style,
  ...props
}: ScreenContainerProps) {
  const theme = useDesignTheme();
  const contentStyle = [styles.screenContent, bottomActionSpacing && styles.screenBottom, contentContainerStyle];
  return (
    <View {...props} style={[styles.screen, { backgroundColor: theme.background.canvas }, style]}>
      <SafeAreaView edges={safeAreaEdges} style={styles.safeArea}>
        {scroll ? (
          <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps={keyboardShouldPersistTaps} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={contentStyle}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

export function LoadingCard({ label = 'Finding thoughtful options…' }: { label?: string }) {
  const theme = useDesignTheme();
  return (
    <ClayCard variant="default" style={styles.loading} accessibilityLiveRegion="polite">
      <View style={[styles.skeletonIcon, { backgroundColor: theme.accent.primarySoft }]}><ActivityIndicator color={theme.text.primary} /></View>
      <View style={styles.loadingCopy}>
        <View style={[styles.skeletonLine, { backgroundColor: theme.background.subtle }]} />
        <ThemedText style={[Typography.bodySecondary, { color: theme.text.secondary }]}>{label}</ThemedText>
      </View>
    </ClayCard>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.metadataGap,
    minHeight: 28,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  button: {
    alignItems: 'center',
    borderRadius: Radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: TouchTarget.primary,
    minWidth: TouchTarget.minimum,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.mdCompact,
  },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', maxWidth: '100%', minWidth: 0 },
  buttonDisabled: { elevation: 0, opacity: 0.72, shadowOpacity: 0 },
  buttonLabel: { ...Typography.button, flexShrink: 1, minWidth: 0, textAlign: 'center' },
  buttonPressed: { elevation: 1, opacity: 0.9, transform: [{ scale: 0.985 }, { translateY: 1 }] },
  card: { borderRadius: Radius.card, borderWidth: 1 },
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
    minHeight: TouchTarget.minimum,
    maxWidth: '100%',
    paddingHorizontal: Spacing.mdCompact,
    paddingVertical: Spacing.sm,
  },
  chipCheck: { fontSize: 13, fontWeight: '900', lineHeight: 18 },
  chipPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  chipSelected: { borderWidth: 2 },
  disabled: { opacity: 0.62, shadowOpacity: 0 },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  headerAction: { minHeight: TouchTarget.minimum, paddingHorizontal: Spacing.sm },
  heroCard: { borderRadius: Radius.hero },
  iconButton: {
    alignItems: 'center',
    borderRadius: Radius.input,
    borderWidth: 1,
    height: TouchTarget.comfortable,
    justifyContent: 'center',
    width: TouchTarget.comfortable,
  },
  input: {
    fontFamily: Typography.body.fontFamily,
    borderRadius: Radius.input,
    borderWidth: 1,
    fontSize: Typography.body.fontSize,
    lineHeight: Typography.body.lineHeight,
    minHeight: 54,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.mdCompact,
  },
  inputError: { borderWidth: 2 },
  inputFocused: { borderWidth: 2 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  loadingCopy: { flex: 1, gap: Spacing.xs },
  pressablePressed: { elevation: 1, opacity: 0.94, transform: [{ scale: 0.992 }, { translateY: 1 }] },
  safeArea: { flex: 1 },
  screen: { flex: 1 },
  screenBottom: { paddingBottom: Spacing.xxxl },
  screenContent: {
    alignSelf: 'center',
    gap: Spacing.section,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.md,
    width: '100%',
  },
  section: { gap: Spacing.mdCompact },
  sectionCopy: { flex: 1, gap: Spacing.xs },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm, justifyContent: 'space-between' },
  skeletonIcon: { alignItems: 'center', borderRadius: Radius.medium, height: 46, justifyContent: 'center', width: 46 },
  skeletonLine: { borderRadius: Radius.small, height: 8, width: '62%' },
});
