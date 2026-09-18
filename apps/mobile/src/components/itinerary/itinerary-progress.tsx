import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MetadataBadge, PrimaryButton, SecondaryButton, TertiaryButton } from '@/components/ui/clay';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { executionProgress, type ItineraryExecution, type StopStatus } from '@/services/itinerary-execution';

export const stopStatusPresentation = {
  upcoming: { label: 'Upcoming', icon: 'ellipse-outline', tone: 'neutral' },
  current: { label: 'Current stop', icon: 'radio-button-on', tone: 'accent' },
  completed: { label: 'Completed', icon: 'checkmark-circle', tone: 'success' },
  skipped: { label: 'Skipped', icon: 'return-up-forward-outline', tone: 'warning' },
} as const;

export function StopStatusBadge({ status }: { status: StopStatus }) {
  const theme = useDesignTheme();
  const { label, icon, tone } = stopStatusPresentation[status];
  const color = status === 'completed' ? theme.semantic.success.default : status === 'skipped' ? theme.semantic.warning.default : status === 'current' ? theme.text.primary : theme.text.secondary;
  return <MetadataBadge label={label} tone={tone} icon={<Ionicons accessible={false} name={icon} size={18} color={color} />} />;
}

export function ItineraryProgress({ execution }: { execution: ItineraryExecution }) {
  const theme = useDesignTheme();
  const progress = executionProgress(execution);
  const title = execution.status === 'planned' ? 'Your plan' : execution.status === 'in_progress' ? "You're on your way" : 'Trip complete';
  const summary = execution.status === 'planned'
    ? `${progress.total} ${progress.total === 1 ? 'stop' : 'stops'} · Ready when you are`
    : execution.status === 'completed'
      ? `${progress.completed} ${progress.completed === 1 ? 'stop' : 'stops'} completed · ${progress.skipped} ${progress.skipped === 1 ? 'stop' : 'stops'} skipped`
      : `${progress.completed} of ${progress.total} stops completed${progress.skipped ? ` · ${progress.skipped} skipped` : ''}`;
  const content = <>
    <View style={[styles.title, execution.status === 'completed' && styles.celebration]}>
      {execution.status === 'completed' ? <View style={[styles.celebrationIcon, { backgroundColor: theme.accent.primarySoft }]}><Ionicons accessible={false} name="checkmark" size={38} color={theme.text.primary} /></View> : null}
      <View style={[styles.titleCopy, execution.status === 'completed' && styles.celebrationCopy]}>
        {execution.status === 'in_progress' ? <ThemedText style={[Typography.eyebrow, { color: theme.itinerary.current }]}>ITINERARY IN PROGRESS</ThemedText> : null}
        {execution.status === 'completed' ? <ThemedText style={[Typography.eyebrow, { color: theme.itinerary.completed }]}>OUTING COMPLETE</ThemedText> : null}
        <ThemedText style={execution.status === 'in_progress' ? Typography.cardTitle : Typography.screenTitle} accessibilityRole="header">{title}</ThemedText>
      </View>
    </View>
    <ThemedText style={[Typography.bodySecondary, execution.status === 'completed' && styles.centered]} themeColor="textSecondary" accessibilityLiveRegion="polite">{summary}</ThemedText>
    {execution.status === 'in_progress' ? <>
      <View style={styles.progressMeta}>
        <ThemedText style={Typography.caption} themeColor="muted">COMPLETED PROGRESS</ThemedText>
        <ThemedText style={Typography.metadata}>{progress.completed} / {progress.total}</ThemedText>
      </View>
      <View
        accessible accessibilityRole="progressbar" accessibilityLabel="Itinerary progress"
        accessibilityValue={{ min: 0, max: progress.total, now: progress.completed, text: summary }}
        style={[styles.track, { backgroundColor: theme.border.default }]}>
        <View testID="itinerary-progress-fill" style={[styles.fill, { backgroundColor: theme.itinerary.current, width: `${progress.total ? progress.completed / progress.total * 100 : 0}%` }]} />
      </View>
    </> : null}
  </>;
  if (execution.status === 'completed') return <View style={styles.completed} testID="itinerary-completed-header">{content}</View>;
  return <View style={styles.progress} testID={`itinerary-${execution.status}-header`}>{content}</View>;
}

export function CurrentStopActions({ placeName, onComplete, onSkip, onNavigate }: { placeName: string; onComplete: () => void; onSkip: () => void; onNavigate?: () => void }) {
  const theme = useDesignTheme();
  return <View style={styles.actions}>
    <View style={styles.progression}>
      {onNavigate ? <SecondaryButton label="Navigate" accessibilityLabel={`Navigate to ${placeName}`} labelNumberOfLines={0} icon={<Ionicons accessible={false} name="navigate-outline" size={18} color={theme.action.onSecondary} />} style={styles.actionButton} onPress={onNavigate} /> : null}
      <PrimaryButton label="Mark complete" accessibilityLabel={`Mark ${placeName} complete`} labelNumberOfLines={0} icon={<Ionicons accessible={false} name="checkmark-circle-outline" size={18} color={theme.accent.onPrimary} />} style={styles.actionButton} onPress={onComplete} />
    </View>
    <TertiaryButton label="Skip stop" accessibilityLabel={`Skip ${placeName}`} labelNumberOfLines={0} style={styles.skip} onPress={onSkip} />
  </View>;
}

const styles = StyleSheet.create({
  progress: { gap: Spacing.sm }, completed: { gap: Spacing.mdCompact }, title: { flexDirection: 'row', alignItems: 'center', gap: Spacing.mdCompact }, titleCopy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  celebration: { flexDirection: 'column', gap: Spacing.md },
  celebrationCopy: { alignItems: 'center', flex: 0 },
  centered: { textAlign: 'center' },
  celebrationIcon: { alignItems: 'center', borderRadius: Radius.pill, height: 80, justifyContent: 'center', width: 80, marginTop: Spacing.lg },
  progressMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 7, borderRadius: Radius.pill, overflow: 'hidden' }, fill: { height: '100%', borderRadius: Radius.pill },
  actions: { gap: Spacing.xs }, progression: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionButton: { flexGrow: 1, flexBasis: 132 }, skip: { alignSelf: 'center', minHeight: 48, paddingHorizontal: Spacing.lg },
});
