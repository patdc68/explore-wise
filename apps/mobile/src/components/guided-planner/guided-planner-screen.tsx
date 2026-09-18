import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Alert, Animated, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ClayCard, ClayInput, ChoiceChip, IconButton, PrimaryButton, SecondaryButton, TertiaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';
import { useCurrentLocation } from '@/providers/current-location-provider';
import { addPlannerAnchor, budgetSummary, completePlannerPreview, createPlannerSession, editPlannerQuestion, LABELS, nextPlannerQuestion, parseBudgetInput, plannerAdvanceDelay, plannerLocation, PLANNER_PHASES, plannerProgress, plannerQuestions, plannerScreenReady, preferenceSummary, previousPlannerQuestion, questionReady, removePlannerAnchor, replacePlannerAnchor, setPlannerAnswer, skipPlannerQuestion, validatePlannerPreview, type PlannerSession } from '@/services/guided-planner';
import { QUESTIONS } from '../../../../../packages/planning/src/questions';
import type { QuestionId } from '../../../../../packages/planning/src/draft';
import type { PlanningIntent } from '../../../../../packages/planning/src/intent';
import { PlannerSearch } from './planner-search';

const TITLES: Record<QuestionId, string> = { occasion: 'What are you planning?', location: 'Where shall we explore?', party: 'How many are coming?', children: 'Any children joining?', child_age_bands: 'Which ages are coming?', budget: 'What feels comfortable?', schedule: 'How much time do you have?', moods: 'What’s the vibe?', food: 'What sounds good?', activities: 'What sounds good?', anchors: 'Already have somewhere in mind?', mobility: 'How far would you go?' };
const SECTION_LABELS: Record<QuestionId, string> = { occasion: 'Occasion', location: 'Location', party: 'People', children: 'Children', child_age_bands: 'Ages', budget: 'Budget', schedule: 'Time', moods: 'Vibe', food: 'Food', activities: 'Activities', anchors: 'Must-visit places', mobility: 'Travel' };
const occasionIcons = { date: 'heart-outline', friends: 'people-outline', family: 'home-outline', solo: 'person-outline' } as const;
const occasionCopy = { date: 'Time for the two of you', friends: 'Get the group together', family: 'An outing together', solo: 'A little time for yourself' };
type PreferenceAnswer = PlanningIntent['food'] | PlanningIntent['activities'];
type AnchorDisplay = { name: string; detail: string };

function Choice({ label, description, selected, onPress, icon }: { label: string; description?: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const theme = useDesignTheme();
  return <ClayCard onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected }} variant={selected ? 'raised' : 'subtle'} style={[styles.choice, { borderColor: selected ? theme.accent.primaryPressed : theme.border.default, backgroundColor: selected ? theme.accent.primarySoft : theme.background.surfaceRaised }]}>
    <View style={styles.choiceRow}>
      {icon ? <Ionicons accessible={false} name={icon} size={28} color={theme.text.primary} /> : null}
      <View style={styles.grow}><ThemedText style={Typography.cardTitle}>{label}</ThemedText>{description ? <ThemedText type="small" themeColor="textSecondary">{description}</ThemedText> : null}</View>
      <Ionicons accessible={false} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.text.primary : theme.text.muted} />
    </View>
  </ClayCard>;
}

function NumberInput({ label, value, onChange, money = false, maximum = 50 }: { label: string; value: number | undefined; onChange: (n: number) => void; money?: boolean; maximum?: number }) {
  const [raw, setRaw] = useState(value !== undefined && Number.isFinite(value) ? String(money ? value / 100 : value) : '');
  useEffect(() => { if (value !== undefined && Number.isFinite(value)) setRaw(String(money ? value / 100 : value)); }, [value, money]);
  const error = raw && (value === undefined || !Number.isFinite(value) || (!money && (value < 1 || value > maximum))) ? money ? 'Enter a non-negative amount with up to two decimal places.' : `Enter a whole number from 1 to ${maximum}.` : undefined;
  return <View style={styles.group}><ThemedText style={Typography.label}>{label}</ThemedText><ClayInput accessibilityLabel={label} value={raw} error={error} maxLength={12} keyboardType={money ? 'decimal-pad' : 'number-pad'} onChangeText={(text) => { setRaw(text); onChange(money ? parseBudgetInput(text) : /^\d+$/.test(text) ? Number(text) : NaN); }} />{error ? <ThemedText type="small" accessibilityLiveRegion="polite">{error}</ThemedText> : null}</View>;
}

function PreferenceSection({ title, values, answer, onToggle, onMode }: { title: string; values: readonly string[]; answer: PreferenceAnswer | undefined; onToggle: (value: string) => void; onMode: (mode: 'no_preference' | 'surprise_me' | 'skipped') => void }) {
  const selected = answer?.state === 'selected' ? answer.values as readonly string[] : [];
  return <View style={styles.preferenceSection}>
    <ThemedText style={Typography.eyebrow}>{title}</ThemedText>
    <View style={styles.wrap}>{values.map((value) => <ChoiceChip key={value} label={LABELS[value] ?? value} selected={selected.includes(value)} onPress={() => onToggle(value)} />)}</View>
    <View style={styles.preferenceModes}>
      {(['no_preference', 'surprise_me', 'skipped'] as const).map((mode) => <ChoiceChip key={mode} label={LABELS[mode]} accessibilityLabel={`${LABELS[mode]} for ${title.toLowerCase()}`} selected={answer?.state === mode} onPress={() => onMode(mode)} />)}
    </View>
  </View>;
}

function reviewTitle(answers: { occasion?: PlanningIntent['occasion']; location?: PlanningIntent['location'] }): string {
  const place = answers.location?.label ?? 'your area';
  const occasion = answers.occasion === 'date' ? 'date' : answers.occasion === 'friends' ? 'day with friends' : answers.occasion === 'family' ? 'family outing' : 'solo day';
  return `Your ${place} ${occasion}`;
}

function PlannerPhaseRail({ phaseIndex, phase, completion }: { phaseIndex: number; phase: string; completion: number }) {
  const theme = useDesignTheme();
  return <View style={styles.phaseRail} accessibilityRole="progressbar" accessibilityLabel={`Planner phase: ${phase}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(completion * 100), text: phase }}>
    <View style={styles.phaseSegments}>{PLANNER_PHASES.map((name, index) => <View key={name} style={[styles.phaseSegment, { backgroundColor: index < phaseIndex ? theme.accent.primary : theme.background.subtle }]} />)}</View>
    <View style={styles.phaseMeta}><ThemedText style={Typography.metadata}>{phase}</ThemedText><ThemedText type="small" themeColor="muted">{Math.round(completion * 100)}% shaped</ThemedText></View>
  </View>;
}

function ReviewRow({ label, value, needsAttention, onEdit }: { label: string; value: string; needsAttention: boolean; onEdit: () => void }) {
  const theme = useDesignTheme();
  return <View style={[styles.reviewRow, { borderBottomColor: theme.border.subtle }]}>
    <View style={styles.grow}><ThemedText style={Typography.metadata}>{label.toUpperCase()}</ThemedText><ThemedText themeColor="textSecondary" style={styles.reviewValue}>{value}</ThemedText>{needsAttention ? <ThemedText type="small" style={{ color: theme.semantic.error.default }}>Needs attention</ThemedText> : null}</View>
    <TertiaryButton label="Edit" accessibilityLabel={`Edit ${label}`} onPress={onEdit} style={styles.editButton} />
  </View>;
}

export default function GuidedPlannerScreen() {
  const theme = useDesignTheme(); const router = useRouter(); const navigation = useNavigation(); const location = useCurrentLocation();
  const gutter = Spacing.md;
  const [session, setSession] = useState<PlannerSession>(createPlannerSession);
  const [anchorPlaces, setAnchorPlaces] = useState<Record<string, AnchorDisplay>>({});
  const [anchorSearchOpen, setAnchorSearchOpen] = useState(false);
  const [anchorBeingChanged, setAnchorBeingChanged] = useState<string | null>(null);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const scroll = useRef<ScrollView>(null); const [fade] = useState(() => new Animated.Value(1));
  const locationRequest = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const { draft, screen } = session; const a = draft.answers;
  useEffect(() => () => { locationRequest.current++; }, [screen]);
  const questions = plannerQuestions(draft); const question = questions.find((q) => q.id === screen);
  const progressState = plannerProgress(draft, screen);
  const progress = progressState.completion;
  const validation = validatePlannerPreview(draft);
  const change = <K extends Exclude<keyof PlanningIntent, 'planningIntentVersion'>>(key: K, value: PlanningIntent[K]) => setSession((s) => setPlannerAnswer(s, key, value));
  const clearAdvanceTimer = () => { if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null; } };
  const leave = () => { clearAdvanceTimer(); if (router.canGoBack()) router.back(); else router.replace('/'); };
  const selectSingle = <K extends Exclude<keyof PlanningIntent, 'planningIntentVersion'>>(key: K, value: PlanningIntent[K]) => {
    clearAdvanceTimer(); Keyboard.dismiss();
    setSession((s) => setPlannerAnswer(s, key, value));
    const delay = plannerAdvanceDelay(reduceMotion);
    if (delay === 0) setSession(nextPlannerQuestion);
    else advanceTimer.current = setTimeout(() => { advanceTimer.current = null; setSession(nextPlannerQuestion); }, delay);
  };
  usePreventRemove(draft.revision > 0 && screen !== 'complete', ({ data }) => {
    Alert.alert('Leave this plan?', 'Your answers will be discarded when you leave.', [
      { text: 'Keep planning', style: 'cancel' },
      { text: 'Discard plan', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const back = () => { clearAdvanceTimer(); Keyboard.dismiss(); if (screen === 'occasion' && !session.editing) leave(); else setSession(previousPlannerQuestion); };
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => handler.remove();
  });
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    fade.setValue(reduceMotion ? 1 : 0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [screen, reduceMotion, fade]);
  useEffect(() => () => clearAdvanceTimer(), []);

  const party = a.party ?? { size: NaN, children: null };
  const budget = a.budget ?? { amountMinor: NaN, currencyCode: 'PHP', basis: 'total' as const, strictness: 'strict' as const, unknownPricePolicy: 'allow_with_disclosure' as const };
  const changeBudget = (patch: Partial<PlanningIntent['budget']>) => change('budget', { ...budget, ...patch, unknownPricePolicy: 'allow_with_disclosure' });
  const ageBands = party.children?.state === 'present' ? party.children.ageBands : null;
  const chips = (values: readonly string[], selected: (value: string) => boolean, onPress: (value: string) => void) => <View style={styles.wrap}>{values.map((v) => <ChoiceChip key={v} label={LABELS[v] ?? v} selected={selected(v)} onPress={() => onPress(v)} />)}</View>;
  const selectPreference = (id: 'moods' | 'food' | 'activities', value: string) => {
    const current = a[id]; const selected = current?.state === 'selected' ? current.values as readonly string[] : [];
    const values = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    // Values come exclusively from the canonical question's allowedValues.
    change(id, values.length ? { state: 'selected', values } as PlanningIntent[typeof id] : { state: 'unanswered' });
  };
  const anchorDisplay = (placeId: string): AnchorDisplay => anchorPlaces[placeId.toLowerCase()] ?? { name: 'Selected place', detail: '' };
  let content: ReactNode;
  if (screen === 'complete') {
    content = <ClayCard variant="hero" style={styles.group}>
      <Ionicons name="checkmark-circle-outline" size={48} color={theme.text.primary} accessible={false} />
      <ThemedText style={Typography.screenHeading}>Your plan brief is ready</ThemedText>
      <ThemedText>This is a local preview. Your answers are valid, but no recommendations have been generated.</ThemedText>
      <SecondaryButton label="Review my answers" onPress={() => setSession(previousPlannerQuestion)} />
      <ThemedText type="small" themeColor="textSecondary">No recommendation service was called.</ThemedText>
    </ClayCard>;
  } else if (screen === 'review') {
    const rows: { id: QuestionId; value: string; group: 'Basics' | 'Budget & time' | 'Preferences' | 'Final touches' }[] = [
      { id: 'occasion', value: LABELS[a.occasion ?? 'unanswered'], group: 'Basics' },
      { id: 'location', value: a.location ? `${a.location.label}\n5 km around this area` : 'Choose an area', group: 'Basics' },
      { id: 'party', value: a.party && Number.isFinite(a.party.size) ? `${a.party.size} ${a.party.size === 1 ? 'person' : 'people'}` : 'Choose how many people', group: 'Basics' },
      ...(a.occasion === 'family' ? [{ id: 'children' as const, value: party.children?.state === 'present' ? `${party.children.count} children` : party.children?.state === 'none' ? 'No children' : LABELS[party.children?.state ?? 'unanswered'], group: 'Basics' as const }] : []),
      ...(party.children?.state === 'present' ? [{ id: 'child_age_bands' as const, value: ageBands?.state === 'selected' ? ageBands.values.map((v) => LABELS[v]).join(', ') : LABELS[ageBands?.state ?? 'unanswered'], group: 'Basics' as const }] : []),
      { id: 'budget', value: `${budgetSummary(draft)}\n${budget.strictness === 'strict' ? 'Keep it under' : 'A little flexible'}`, group: 'Budget & time' },
      { id: 'schedule', value: scheduleSummary(a.schedule), group: 'Budget & time' },
      { id: 'moods', value: preferenceSummary(a.moods), group: 'Preferences' },
      { id: 'food', value: preferenceSummary(a.food), group: 'Preferences' },
      { id: 'activities', value: preferenceSummary(a.activities), group: 'Preferences' },
      { id: 'anchors', value: a.anchors?.length ? a.anchors.map((p) => anchorDisplay(p.placeId).name).join('\n') : 'No must-visit places', group: 'Final touches' },
      { id: 'mobility', value: preferenceSummary(a.mobility), group: 'Final touches' },
    ];
    const groups = ['Basics', 'Budget & time', 'Preferences', 'Final touches'] as const;
    content = <View style={styles.group}>
      <ThemedText themeColor="textSecondary">Everything is editable. Tap a row to make a change.</ThemedText>
      {groups.map((group) => <View key={group} style={styles.reviewGroup}>
        <ThemedText style={Typography.eyebrow}>{group}</ThemedText>
        <View style={styles.reviewList}>{rows.filter((row) => row.group === group).map((row) => <ReviewRow key={row.id} label={SECTION_LABELS[row.id]} value={row.value} needsAttention={!questionReady(draft, row.id) || (!validation.success && validation.issues.some((issue) => issue.path.startsWith(`$.${row.id}`) || issue.path.startsWith(`$.answers.${row.id}`)))} onEdit={() => setSession((s) => editPlannerQuestion(s, row.id === 'party' && a.occasion === 'solo' ? 'occasion' : row.id === 'activities' ? 'food' : row.id))} />)}</View>
      </View>)}
      {a.anchors?.length ? <ThemedText type="small" themeColor="textSecondary">Must-visit places stay attached to this plan.</ThemedText> : null}
      {!validation.success ? <ThemedText accessibilityLiveRegion="polite">Check the sections marked “Needs attention” before continuing.</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary">Some places may have unverified prices.</ThemedText>
    </View>;
  } else if (screen === 'occasion') {
    content = <View style={styles.group}>{QUESTIONS.find((q) => q.id === 'occasion')!.allowedValues!.map((value) => {
      const occasion = value as PlanningIntent['occasion'];
      return <Choice key={occasion} label={LABELS[occasion]} description={occasionCopy[occasion]} icon={occasionIcons[occasion]} selected={a.occasion === occasion} onPress={() => selectSingle('occasion', occasion)} />;
    })}</View>;
  } else if (screen === 'location') {
    content = <View style={styles.group}>
      <ThemedText themeColor="textSecondary">We’ll use a 5 km area around your chosen point.</ThemedText>
      {!a.location && location.selection ? <Choice label={location.selection.label} description="Use your Explore location" selected={false} onPress={() => { locationRequest.current++; setLocationSearchOpen(false); change('location', plannerLocation(location.selection!)); }} icon="location-outline" /> : null}
      {a.location ? <ClayCard variant="hero" style={styles.selectedLocation} accessibilityLabel={`Selected area ${a.location.label}`}>
        <View style={styles.choiceRow}><Ionicons accessible={false} name="checkmark-circle" size={26} color={theme.text.primary} /><View style={styles.grow}><ThemedText style={Typography.label}>{a.location.source === 'current_location' ? 'Current location' : 'Selected area'}</ThemedText><ThemedText style={Typography.cardTitle}>{a.location.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">5 km around this area</ThemedText></View></View>
        <TertiaryButton label="Change location" onPress={() => setLocationSearchOpen(true)} />
      </ClayCard> : null}
      <SecondaryButton label="Use my current location" loading={location.status === 'loading'} onPress={async () => { const request = ++locationRequest.current; const selection = await location.requestCurrentLocation(); if (selection && request === locationRequest.current) { setLocationSearchOpen(false); change('location', plannerLocation(selection)); } }} />
      {location.message ? <ThemedText accessibilityLiveRegion="polite">{location.message}</ThemedText> : null}
      {!a.location || locationSearchOpen ? <PlannerSearch kind="area" onLocation={(value) => { locationRequest.current++; setLocationSearchOpen(false); change('location', value); }} /> : <TertiaryButton label="Search another area" onPress={() => setLocationSearchOpen(true)} />}
    </View>;
  } else if (screen === 'party') {
    content = <View style={styles.group}><ThemedText themeColor="textSecondary">Include yourself. You can plan for 1–50 people.</ThemedText>
      {chips(a.occasion === 'date' ? ['2', '3', '4'] : ['2', '3', '4', '6', '8'], (v) => party.size === Number(v), (v) => change('party', { ...party, size: Number(v) }))}
      <NumberInput label="Number of people" value={a.party?.size} onChange={(size) => change('party', { ...party, size })} />
      {party.children?.state === 'present' && party.children.count > party.size ? <ThemedText>Update the children count to fit your group.</ThemedText> : null}
    </View>;
  } else if (screen === 'children') {
    content = <View style={styles.group}>
      <Choice label="Yes, children are coming" selected={party.children?.state === 'present'} onPress={() => { if (party.children?.state !== 'present') change('party', { ...party, children: { state: 'present', count: 1, ageBands: { state: 'unanswered' } } }); }} />
      <Choice label="No children" selected={party.children?.state === 'none'} onPress={() => change('party', { ...party, children: { state: 'none' } })} />
      {party.children?.state === 'present' ? <NumberInput label="Number of children" value={party.children.count} maximum={party.size} onChange={(count) => { if (party.children?.state === 'present') change('party', { ...party, children: { ...party.children, count } }); }} /> : null}
      <ThemedText type="small" themeColor="textSecondary">Children are included in your total party size.</ThemedText>
    </View>;
  } else if (screen === 'child_age_bands') {
    content = <View style={styles.group}><ThemedText themeColor="textSecondary">Choose all that apply, or skip.</ThemedText>{chips(question?.allowedValues ?? [], (v) => ageBands?.state === 'selected' && (ageBands.values as readonly string[]).includes(v), (v) => {
      if (party.children?.state !== 'present') return;
      const selected = ageBands?.state === 'selected' ? ageBands.values : [];
      const values = selected.includes(v as typeof selected[number]) ? selected.filter((age) => age !== v) : [...selected, v as typeof selected[number]];
      change('party', { ...party, children: { ...party.children, ageBands: values.length ? { state: 'selected', values } : { state: 'unanswered' } } });
    })}</View>;
  } else if (screen === 'budget') {
    content = <View style={styles.group}>
      <ClayCard variant="hero"><ThemedText style={Typography.sectionTitle}>{budgetSummary(draft)}</ThemedText></ClayCard>
      <View style={styles.wrap}>{(['total', 'per_person'] as const).map((basis) => <ChoiceChip key={basis} label={basis === 'total' ? 'Total budget' : 'Per person'} selected={budget.basis === basis} onPress={() => changeBudget({ basis })} />)}</View>
      <View style={styles.wrap}>{[500, 1000, 2000, 3000, 5000].map((amount) => <ChoiceChip key={amount} label={`₱${amount.toLocaleString('en-PH')}`} selected={budget.amountMinor === amount * 100} onPress={() => changeBudget({ amountMinor: amount * 100 })} />)}</View>
      <NumberInput label="Budget amount (PHP)" value={budget.amountMinor} money onChange={(amountMinor) => changeBudget({ amountMinor })} />
      <ThemedText style={Typography.label}>How firm is your budget?</ThemedText>
      <Choice label="Keep it under" selected={budget.strictness === 'strict'} onPress={() => changeBudget({ strictness: 'strict' })} />
      <Choice label="A little flexible" selected={budget.strictness === 'flexible'} onPress={() => changeBudget({ strictness: 'flexible' })} />
    </View>;
  } else if (screen === 'schedule') {
    content = <ScheduleStep value={a.schedule} onChange={(value) => change('schedule', value)} onDurationSelect={(value) => selectSingle('schedule', value)} />;
  } else if (screen === 'moods') {
    const selected = a[screen];
    content = <View style={styles.group}>
      {screen === 'moods' ? <ClayCard variant="subtle"><ThemedText>Got it — {a.location?.label}, {party.size} {party.size === 1 ? 'person' : 'people'}. {budgetSummary(draft).replace('\n', ' ')}. Now let’s shape the vibe.</ThemedText></ClayCard> : null}
      <ThemedText themeColor="textSecondary">Choose any that appeal to you.</ThemedText>
      {chips(question?.allowedValues ?? [], (v) => selected?.state === 'selected' && (selected.values as readonly string[]).includes(v), (v) => selectPreference(screen, v))}
      {question?.modes?.filter((mode) => mode === 'no_preference' || mode === 'surprise_me').map((mode) => <Choice key={mode} label={LABELS[mode]} description={mode === 'surprise_me' ? 'Let Wise choose the direction' : 'Keep the options open'} selected={selected?.state === mode} onPress={() => change(screen, { state: mode as 'no_preference' | 'surprise_me' })} />)}
    </View>;
  } else if (screen === 'food' || screen === 'activities') {
    content = <View style={styles.group}>
      <ThemedText themeColor="textSecondary">Choose what sounds good in each section, or leave one open.</ThemedText>
      <PreferenceSection title="Food" values={QUESTIONS.find((q) => q.id === 'food')?.allowedValues ?? []} answer={a.food} onToggle={(value) => selectPreference('food', value)} onMode={(mode) => change('food', { state: mode })} />
      <PreferenceSection title="Things to do" values={QUESTIONS.find((q) => q.id === 'activities')?.allowedValues ?? []} answer={a.activities} onToggle={(value) => selectPreference('activities', value)} onMode={(mode) => change('activities', { state: mode })} />
    </View>;
  } else if (screen === 'anchors') {
    const anchors = a.anchors ?? [];
    const selectedAnchorIds = anchors.filter((anchor) => anchor.placeId !== anchorBeingChanged).map((anchor) => anchor.placeId);
    content = <View style={styles.group}>
      <ThemedText themeColor="textSecondary">Almost there. Add a place from the ExploreWise catalog, or leave this open.</ThemedText>
      {anchors.map((anchor) => {
        const display = anchorDisplay(anchor.placeId);
        return <ClayCard key={anchor.placeId} variant="raised" style={styles.anchorCard} accessibilityLabel={`Selected ${display.name}`}>
          <View style={styles.choiceRow}><Ionicons accessible={false} name="checkmark-circle" size={24} color={theme.text.primary} /><View style={styles.grow}><ThemedText style={Typography.cardTitle}>{display.name}</ThemedText>{display.detail ? <ThemedText type="small" themeColor="textSecondary">{display.detail}</ThemedText> : null}</View></View>
          <View style={styles.anchorActions}>
            <TertiaryButton label="Change" accessibilityLabel={`Change ${display.name}`} onPress={() => { setAnchorBeingChanged(anchor.placeId); setAnchorSearchOpen(true); }} />
            <TertiaryButton label="Remove" accessibilityLabel={`Remove ${display.name}`} onPress={() => setSession((s) => removePlannerAnchor(s, anchor.placeId))} />
          </View>
        </ClayCard>;
      })}
      {anchors.length ? <TertiaryButton label={anchorBeingChanged ? 'Cancel change' : anchorSearchOpen ? 'Hide search' : 'Add another'} onPress={() => { setAnchorBeingChanged(null); setAnchorSearchOpen((open) => !open); }} /> : null}
      {(!anchors.length || anchorSearchOpen) ? <PlannerSearch kind="place" selectedIds={selectedAnchorIds} onPlace={(id, name, detail) => {
        const normalized = id.toLowerCase();
        setAnchorPlaces((places) => ({ ...places, [normalized]: { name, detail } }));
        setSession((s) => anchorBeingChanged ? replacePlannerAnchor(s, anchorBeingChanged, id) : addPlannerAnchor(s, id));
        setAnchorBeingChanged(null); setAnchorSearchOpen(false);
      }} /> : null}
    </View>;
  } else {
    content = <View style={styles.group}>{question?.allowedValues?.map((value) => <Choice key={value} label={LABELS[value]} selected={a.mobility?.state === 'selected' && a.mobility.value === value} onPress={() => selectSingle('mobility', { state: 'selected', value: value as 'keep_close' | 'short_rides_ok' | 'flexible' })} />)}<Choice label="No preference" selected={a.mobility?.state === 'no_preference'} onPress={() => selectSingle('mobility', { state: 'no_preference' })} /></View>;
  }

  return <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: theme.background.canvas }]}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <IconButton accessibilityLabel="Back" variant="ghost" icon={<Ionicons name="arrow-back" size={24} color={theme.text.primary} />} onPress={back} />
          <View style={styles.grow}><ThemedText style={Typography.label}>Build my plan</ThemedText><ThemedText type="small" themeColor="textSecondary">{screen === 'review' ? 'Review your outing' : screen === 'complete' ? 'Local preview' : progressState.phase}</ThemedText></View>
          <IconButton accessibilityLabel="Close planner" variant="ghost" icon={<Ionicons name="close" size={24} color={theme.text.primary} />} onPress={leave} />
        </View>
        <View style={{ paddingHorizontal: gutter }}><PlannerPhaseRail phaseIndex={progressState.phaseIndex} phase={screen === 'review' ? 'Review' : screen === 'complete' ? 'Review' : progressState.phase} completion={progress} /></View>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <Animated.View style={[styles.group, { opacity: fade }]}>
            {screen !== 'complete' ? <ThemedText accessibilityRole="header" style={Typography.screenHeading}>{screen === 'review' ? reviewTitle(a) : TITLES[screen]}</ThemedText> : null}
            <View key={screen}>{content}</View>
            {screen === 'schedule' && a.schedule && !questionReady(draft, 'schedule') ? <ThemedText type="small" accessibilityLiveRegion="polite" style={{ color: theme.semantic.error.default }}>Check the date and time. Use a real date, 24-hour HH:mm, and an end after the start.</ThemedText> : null}
          </Animated.View>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: theme.border.subtle, backgroundColor: theme.background.canvas, paddingHorizontal: gutter }]}>
          {screen === 'complete' ? <PrimaryButton label="Back to Explore" onPress={leave} /> : screen === 'review' ? <PrimaryButton label="Let Wise plan it" disabled={!validation.success} onPress={() => { Keyboard.dismiss(); setSession(completePlannerPreview); }} /> : <>
            {!(screen === 'occasion' || screen === 'mobility' || (screen === 'schedule' && a.schedule?.kind === 'duration')) ? <PrimaryButton label={session.editing ? 'Save answer' : 'Continue'} disabled={!plannerScreenReady(draft, screen)} onPress={() => { Keyboard.dismiss(); clearAdvanceTimer(); setSession(nextPlannerQuestion); }} /> : null}
            {question && !question.required && screen !== 'food' && screen !== 'activities' && !(screen === 'anchors' && a.anchors?.length) ? <TertiaryButton label="Skip" onPress={() => { Keyboard.dismiss(); clearAdvanceTimer(); setSession(skipPlannerQuestion); }} /> : null}
          </>}
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function ScheduleStep({ value, onChange, onDurationSelect }: { value: PlanningIntent['schedule'] | undefined; onChange: (value: PlanningIntent['schedule']) => void; onDurationSelect: (value: PlanningIntent['schedule']) => void }) {
  const [details, setDetails] = useState(Boolean(value?.outingDate || value?.startTime));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const base = { outingDate: value?.outingDate ?? null, startTime: value?.startTime ?? null, timeZone: value?.timeZone ?? null };
  return <View style={styles.group}>
    {[{ minutes: 150, label: '2–3 hours', detail: 'Plan for about 2½ hours' }, { minutes: 240, label: 'Half day', detail: '4 hours to explore' }, { minutes: 480, label: 'Whole day', detail: '8 hours to make it yours' }].map((item) => <Choice key={item.minutes} label={item.label} description={item.detail} selected={value?.kind === 'duration' && value.durationMinutes === item.minutes} onPress={() => { setDetails(false); onDurationSelect({ ...base, kind: 'duration', durationMinutes: item.minutes }); }} />)}
    <Choice label="Evening" description="18:00–01:00, ending the next day" selected={value?.kind === 'window'} onPress={() => { setDetails(true); onChange({ kind: 'window', outingDate: base.outingDate, startTime: '18:00', endTime: '01:00', endDayOffset: 1, timeZone: zone }); }} />
    <TertiaryButton label={details ? 'Hide date and time' : 'Add date or start time'} onPress={() => setDetails((d) => !d)} />
    {details && value ? <View style={styles.group}>
      <ThemedText type="small" themeColor="textSecondary">Times use {value.timeZone ?? zone} (device timezone). Leave the date blank if undecided.</ThemedText>
      <ThemedText style={Typography.label}>Outing date (optional)</ThemedText>
      <ClayInput accessibilityLabel="Outing date YYYY-MM-DD" placeholder="YYYY-MM-DD" maxLength={10} value={value.outingDate ?? ''} onChangeText={(text) => onChange({ ...value, outingDate: text || null, timeZone: value.timeZone ?? zone })} />
      <ThemedText style={Typography.label}>Start time {value.kind === 'duration' ? '(optional)' : ''}</ThemedText>
      <ClayInput accessibilityLabel="Start time HH:mm" placeholder="HH:mm, 24-hour time" maxLength={5} value={value.startTime ?? ''} onChangeText={(text) => onChange(value.kind === 'window' ? { ...value, startTime: text } : { ...value, startTime: text || null, timeZone: value.timeZone ?? zone })} />
      {value.kind === 'window' ? <>
        <ThemedText style={Typography.label}>End time</ThemedText>
        <ClayInput accessibilityLabel="End time HH:mm" placeholder="HH:mm" maxLength={5} value={value.endTime} onChangeText={(text) => onChange({ ...value, endTime: text })} />
        <View style={styles.wrap}>{([0, 1] as const).map((offset) => <ChoiceChip key={offset} label={offset ? 'Next day' : 'Same day'} selected={value.endDayOffset === offset} onPress={() => onChange({ ...value, endDayOffset: offset })} />)}</View>
      </> : null}
      <ThemedText type="small" themeColor="textSecondary">Use YYYY-MM-DD and 24-hour HH:mm. The end must come after the start.</ThemedText>
    </View> : null}
  </View>;
}
function scheduleSummary(value: PlanningIntent['schedule'] | undefined): string {
  if (!value) return 'Choose your time';
  return `${value.kind === 'duration' ? `${value.durationMinutes / 60} hours${value.startTime ? ` · starts ${value.startTime}` : ''}` : `${value.startTime}–${value.endTime}${value.endDayOffset ? ' next day' : ''}`}\n${value.outingDate ?? 'Date flexible'}${value.timeZone ? ` · ${value.timeZone}` : ''}`;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, container: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  grow: { flex: 1, minWidth: 0, gap: Spacing.xs }, group: { gap: Spacing.md },
  content: { padding: Spacing.screenHorizontal, paddingBottom: Spacing.lg, flexGrow: 1 },
  choice: { minHeight: 80 }, choiceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  phaseRail: { gap: Spacing.sm, paddingTop: Spacing.xs }, phaseSegments: { flexDirection: 'row', gap: Spacing.xs }, phaseSegment: { borderRadius: Radius.pill, flex: 1, height: 5 }, phaseMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  footer: { padding: Spacing.md, gap: Spacing.xs, borderTopWidth: 1 },
  reviewGroup: { gap: Spacing.sm }, reviewList: { gap: 0 }, reviewRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: Spacing.md, minHeight: 64, paddingVertical: Spacing.sm }, reviewValue: { lineHeight: 21 }, editButton: { minHeight: 44, paddingHorizontal: Spacing.sm },
  selectedLocation: { gap: Spacing.md }, preferenceSection: { gap: Spacing.sm }, preferenceModes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  anchorCard: { gap: Spacing.sm }, anchorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
