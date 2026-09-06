import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function GoogleAuthButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable disabled={loading} accessibilityRole="button" accessibilityLabel="Continue with Google" onPress={onPress} style={({ pressed }) => [styles.button, Shadows.subtle, { backgroundColor: theme.elevatedSurface, borderColor: theme.border, shadowColor: theme.shadow }, (pressed || loading) && styles.pressed]}><View style={styles.icon}><Ionicons name="logo-google" size={18} color="#4285F4" /></View><ThemedText style={styles.label}>{loading ? 'Connecting to Google…' : 'Continue with Google'}</ThemedText></Pressable>;
}
const styles = StyleSheet.create({ button: { alignItems: 'center', borderRadius: Radius.input, borderWidth: 1, justifyContent: 'center', minHeight: 50, position: 'relative' }, icon: { left: 16, position: 'absolute' }, label: { fontSize: 14, fontWeight: '800' }, pressed: { opacity: 0.82, transform: [{ translateY: 1 }] } });
