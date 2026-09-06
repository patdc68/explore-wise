import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { GoogleAuthButton } from '@/components/google-auth-button';
import { ClayInput, ClaySurface, PrimaryButton, SecondaryButton } from '@/components/ui/clay';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const router = useRouter(); const theme = useTheme(); const { signIn, signInWithGoogle, completeQueuedAction } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [visible, setVisible] = useState(false); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true); setError(null);
    try { await signIn(email, password); await completeQueuedAction(); router.back(); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Unable to sign in right now.'); }
    finally { setLoading(false); }
  };
  const google = async () => { setLoading(true); setError(null); try { const result = await signInWithGoogle(); if (result === 'success') { await completeQueuedAction(); router.back(); } } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Google sign-in was unavailable.'); } finally { setLoading(false); } };
  return <View style={[styles.screen, { backgroundColor: theme.background }]}><SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.elevatedSurface, borderColor: theme.border }]}><Ionicons name="chevron-back" size={20} color={theme.text} /></Pressable><View style={styles.heading}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>YOUR EXPLOREWISE</ThemedText><ThemedText style={Typography.screenHeading}>Welcome back.</ThemedText><ThemedText type="small" themeColor="textSecondary">Sign in to save places and share your visits.</ThemedText></View><ClaySurface elevation="raised" style={styles.form}><GoogleAuthButton loading={loading} onPress={() => void google()} /><ThemedText type="small" themeColor="textSecondary" style={styles.or}>or continue with email</ThemedText><Field label="Email"><ClayInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" value={email} /></Field><Field label="Password"><View style={styles.passwordRow}><ClayInput accessibilityLabel="Password" autoComplete="current-password" onChangeText={setPassword} placeholder="Your password" secureTextEntry={!visible} style={styles.passwordInput} value={password} /><Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible((current) => !current)} style={styles.visibility}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} color={theme.textSecondary} size={20} /></Pressable></View></Field>{error ? <ThemedText type="small" style={{ color: theme.error }}>{error}</ThemedText> : null}<PrimaryButton disabled={loading} label={loading ? 'Signing in…' : 'Sign In'} onPress={() => void submit()} /></ClaySurface><SecondaryButton label="Create Account" onPress={() => router.replace('/auth/sign-up')} /></ScrollView></KeyboardAvoidingView></SafeAreaView></View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><ThemedText type="smallBold">{label}</ThemedText>{children}</View>; }
const styles = StyleSheet.create({ screen: { flex: 1 }, safe: { flex: 1 }, content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, padding: Spacing.md, paddingBottom: Spacing.six, width: '100%' }, back: { alignItems: 'center', borderRadius: Radius.chip, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, heading: { gap: Spacing.xs }, eyebrow: { fontSize: 11, letterSpacing: 1.1 }, form: { gap: Spacing.md }, or: { textAlign: 'center' }, field: { gap: Spacing.xs }, passwordRow: { position: 'relative' }, passwordInput: { paddingRight: 52 }, visibility: { alignItems: 'center', height: 54, justifyContent: 'center', position: 'absolute', right: 0, width: 52 } });
