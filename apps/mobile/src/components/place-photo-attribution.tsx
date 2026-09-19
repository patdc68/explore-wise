import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';

import type { GooglePlacePresentationV1 } from '../../../../packages/place-presentation/src/contracts.ts';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useDesignTheme } from '@/hooks/use-theme';

async function openExternal(url: string) {
  try {
    if (!(await Linking.canOpenURL(url))) throw new Error('unsupported');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open link', 'This photo link is not available on this device.');
  }
}

export function PlacePhotoAttribution({ presentation }: { presentation: GooglePlacePresentationV1 }) {
  const theme = useDesignTheme();
  const [visible, setVisible] = useState(false);
  const authors = presentation.image.authorAttributions;
  return <>
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.sourceRow}>
        <ThemedText accessibilityLabel="Google Maps photo attribution" style={styles.sourceText}>Google Maps</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Photo info" onPress={() => setVisible(true)} style={styles.infoButton} hitSlop={6}>
          <Ionicons name="information-circle-outline" size={16} color="#FFFFFF" accessible={false} />
        </Pressable>
      </View>
    </View>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.background.surface }]}>
          <View style={styles.sheetHeader}>
            <ThemedText style={Typography.cardTitle}>Photo info</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close photo info" onPress={() => setVisible(false)} style={styles.close}>
              <Ionicons name="close" size={22} color={theme.text.primary} accessible={false} />
            </Pressable>
          </View>
          <ThemedText style={Typography.bodySecondary} themeColor="textSecondary">Photo provided by Google Maps. ExploreWise does not store this photo.</ThemedText>
          {authors.length > 0 ? <View style={styles.authors}>
            <ThemedText style={Typography.label}>Photo credit</ThemedText>
            {authors.map((author) => <View key={`${author.displayName}:${author.uri ?? ''}`} style={styles.authorRow}>
              <View style={styles.authorIdentity}>
                {author.photoUri ? <Image source={{ uri: author.photoUri }} cachePolicy="none" style={styles.authorAvatar} accessibilityLabel={`${author.displayName} profile photo`} /> : null}
                <ThemedText style={Typography.bodySecondary}>{author.displayName}</ThemedText>
              </View>
              {author.uri ? <Pressable accessibilityRole="link" accessibilityLabel={`Open ${author.displayName} profile`} onPress={() => void openExternal(author.uri!)}><ThemedText style={[Typography.caption, { color: theme.accent.primaryPressed }]}>View profile</ThemedText></Pressable> : null}
            </View>)}
          </View> : null}
          <Pressable accessibilityRole="link" accessibilityLabel="View photo on Google Maps" onPress={() => void openExternal(presentation.image.googleMapsUri)} style={[styles.linkButton, { borderColor: theme.border.default }]}>
            <ThemedText style={Typography.label}>View photo on Google Maps</ThemedText>
          </Pressable>
          {presentation.image.flagContentUri ? <Pressable accessibilityRole="link" accessibilityLabel="Report this photo" onPress={() => void openExternal(presentation.image.flagContentUri!)} style={styles.report}>
            <ThemedText style={Typography.caption} themeColor="textSecondary">Report this photo</ThemedText>
          </Pressable> : null}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  overlay: { bottom: 0, left: 0, padding: Spacing.xs, position: 'absolute', right: 0 },
  sourceRow: { alignItems: 'center', alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: Radius.small, flexDirection: 'row', gap: 2, paddingHorizontal: 6, paddingVertical: 3 },
  sourceText: { color: '#FFFFFF', fontFamily: Typography.caption.fontFamily, fontSize: 12, lineHeight: 15 },
  infoButton: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.56)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.hero, borderTopRightRadius: Radius.hero, gap: Spacing.md, padding: Spacing.lg, width: '100%' },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  authors: { gap: Spacing.sm },
  authorRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'space-between' },
  authorIdentity: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.sm },
  authorAvatar: { borderRadius: 12, height: 24, width: 24 },
  linkButton: { alignItems: 'center', borderRadius: Radius.button, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md },
  report: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md },
});
