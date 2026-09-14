import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo, useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ClayInput, ClaySurface, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { COMMUNITY_NOTE_MAX_LENGTH, formatPesoMinor, parsePesoToMinor, spendPerPersonMinor, submitVisitReport, validateVisitReport, VISIT_TYPES, type VisitType } from '@/services/community';
import { contributionCopy, contributionTarget, submitContribution } from '@/services/itinerary-contributions';
import { useAuth } from '@/providers/auth-provider';
import { useItineraryExecution } from '@/providers/itinerary-execution-provider';
import { useTheme } from '@/hooks/use-theme';

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function today() { return new Date().toISOString().slice(0, 10); }

export default function ReportVisitScreen() {
  const router = useRouter(); const theme = useTheme(); const { user, initializing } = useAuth();
  const { active, store } = useItineraryExecution();
  const params = useLocalSearchParams<{ id: string; name?: string; source?: string; itineraryId?: string; stopId?: string }>();
  const placeId = first(params.id) ?? '';
  const postTrip = first(params.source) === 'completed-itinerary';
  const context = postTrip ? { itineraryId: first(params.itineraryId) ?? '', stopId: first(params.stopId) ?? '', placeId } : null;
  const target = context ? contributionTarget(active, context) : undefined;
  const placeName = target?.place.name ?? first(params.name) ?? 'this place';
  const copy = contributionCopy(target?.place.category_code);
  const unavailable = postTrip && (!target || target.shared);
  const completedAt = target ? active?.execution.stops.find((stop) => stop.id === target.stopId)?.completedAt : undefined;
  const [rating, setRating] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [people, setPeople] = useState(target ? String(active!.itinerary.partySize) : '');
  const [visitType, setVisitType] = useState<VisitType | null>(null);
  const [visitDate, setVisitDate] = useState(completedAt?.slice(0, 10) ?? today());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const totalSpendMinor = useMemo(() => parsePesoToMinor(amount), [amount]);
  // A prefilled group size must never turn a blank amount into reported spend.
  const partySize = totalSpendMinor === null ? null : people.trim() ? Number(people) : null;
  const reportedPerPerson = spendPerPersonMinor(totalSpendMinor, partySize);
  const returnToOrigin = () => {
    if (postTrip) router.dismissTo('/(tabs)/plan');
    else if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/place/[id]', params: { id: placeId } });
  };
  const submit = async () => {
    if (submitting.current || unavailable) return;
    if (!user) { setError('Sign in to submit a visit report.'); return; }
    const input = { placeId, rating, totalSpendMinor, partySize, visitType, visitDate, shortNote: note.trim() || null };
    const validation = validateVisitReport(input);
    if (validation) { setError(validation); return; }
    submitting.current = true; setSaving(true); setError(null);
    try {
      await submitContribution(input, context, {
        getActive: () => store.getSnapshot().active,
        submitReport: submitVisitReport,
        markContributed: store.markContributed,
      });
      returnToOrigin();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to submit your report.');
    } finally { submitting.current = false; setSaving(false); }
  };
  return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel={postTrip ? 'Return to completed itinerary' : 'Go back'} onPress={returnToOrigin} style={[styles.back, { backgroundColor: theme.elevatedSurface, borderColor: theme.border }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.heading}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>COMMUNITY DATA</ThemedText>
          <ThemedText style={Typography.screenHeading}>{copy.heading}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Your report for {placeName} stays anonymous in public aggregates.</ThemedText>
        </View>
        {unavailable ? <ClaySurface style={styles.form}>
          <ThemedText accessibilityRole="alert">{target?.shared ? 'Thanks — you already shared this experience.' : 'This completed-trip contribution is no longer available.'}</ThemedText>
          <SecondaryButton label="Return to itinerary" onPress={returnToOrigin} />
        </ClaySurface> : <>
          {!user ? <ClaySurface style={styles.form}>
            <ThemedText style={Typography.cardTitle}>Sign in to contribute</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Sign in to share a rating or reported spend. Your form will be here when you return.</ThemedText>
            <PrimaryButton disabled={initializing} label="Sign In" onPress={() => router.push('/auth/sign-in')} />
            <SecondaryButton disabled={initializing} label="Create Account" onPress={() => router.push('/auth/sign-up')} />
          </ClaySurface> : null}
          <ClaySurface elevation="raised" style={styles.form}>
            <Field label="Rating (optional)">
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((value) => <Pressable key={value} disabled={saving} accessibilityRole="radio"
                  accessibilityLabel={`${value} ${value === 1 ? 'star' : 'stars'} out of 5`} accessibilityState={{ selected: rating === value, disabled: saving }}
                  onPress={() => setRating(value)} style={[styles.star, { backgroundColor: rating === value ? theme.accentSoft : theme.elevatedSurface, borderColor: rating === value ? theme.accentStrong : theme.border }]}>
                  <Ionicons accessible={false} name={rating !== null && value <= rating ? 'star' : 'star-outline'} color={theme.accentStrong} size={29} />
                </Pressable>)}
              </View>
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">{rating === null ? 'Choose 1–5 stars, or share spending details.' : `${rating} out of 5 stars selected`}</ThemedText>
            </Field>
            <Field label={`${copy.spend} (optional)`}>
              <ClayInput editable={!saving} accessibilityLabel={`${copy.spend} Total for your group in pesos`} keyboardType="decimal-pad" onChangeText={setAmount} placeholder="Amount in PHP" value={amount} />
              <ThemedText type="small" themeColor="textSecondary">Total for your group in PHP. Leave blank if not provided; enter 0 only if it was free. Community spend is supplemental.</ThemedText>
            </Field>
            {totalSpendMinor !== null ? <Field label="Number of people covered by this amount">
              <ClayInput editable={!saving} accessibilityLabel="Number of people covered by this amount" keyboardType="number-pad" onChangeText={setPeople} placeholder="Required when spending is entered" value={people} />
            </Field> : null}
            {reportedPerPerson !== null && Number.isFinite(reportedPerPerson) ? <ClaySurface elevation="subtle" style={[styles.preview, { backgroundColor: theme.accentSoft, borderColor: theme.accentStrong }]}>
              <ThemedText type="smallBold">Reported spend/person</ThemedText><ThemedText style={Typography.price}>{formatPesoMinor(reportedPerPerson)}</ThemedText>
            </ClaySurface> : null}
            {!postTrip ? <Field label="Visit type (optional)"><View style={styles.types}>
              {VISIT_TYPES.map((type) => <Pressable key={type} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: visitType === type }} onPress={() => setVisitType(type)} style={[styles.chip, { backgroundColor: visitType === type ? theme.accentSoft : theme.elevatedSurface, borderColor: visitType === type ? theme.accentStrong : theme.border }]}>
                <ThemedText type="smallBold">{type.replace('_', ' ')}</ThemedText>
              </Pressable>)}
            </View></Field> : null}
            <Field label="Visit date"><ClayInput editable={!saving} accessibilityLabel="Visit date, YYYY-MM-DD" onChangeText={setVisitDate} placeholder="YYYY-MM-DD" value={visitDate} /></Field>
            <Field label="Anything else? (optional)">
              <ClayInput editable={!saving} accessibilityLabel="Anything else? Optional experience comment" multiline maxLength={COMMUNITY_NOTE_MAX_LENGTH} onChangeText={setNote} placeholder="Anything you'd like people to know?" style={styles.note} value={note} />
            </Field>
            {error ? <ThemedText accessibilityRole="alert" accessibilityLiveRegion="assertive" type="small" style={{ color: theme.error }}>{error}</ThemedText> : null}
            <PrimaryButton disabled={saving || !user} loading={saving} loadingLabel="Submitting…" label={error ? 'Retry submission' : 'Submit report'} onPress={() => void submit()} />
          </ClaySurface>
        </>}
        <SecondaryButton label="Cancel" onPress={returnToOrigin} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><ThemedText type="smallBold">{label}</ThemedText>{children}</View>; }
const styles = StyleSheet.create({
  screen: { flex: 1 }, safe: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' },
  back: { alignItems: 'center', borderRadius: Radius.chip, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  heading: { gap: Spacing.xs }, eyebrow: { fontSize: 11, letterSpacing: 1.1 },
  form: { gap: Spacing.md }, field: { gap: Spacing.xs }, stars: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  star: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: Radius.chip },
  preview: { gap: Spacing.xs }, types: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { borderRadius: Radius.chip, borderWidth: 1, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  note: { minHeight: 96, textAlignVertical: 'top' },
});
