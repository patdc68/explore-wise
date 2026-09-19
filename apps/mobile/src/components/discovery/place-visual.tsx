import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlacePhotoAttribution } from '@/components/place-photo-attribution';
import { useDesignTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { resolvePlaceVisual, type PlaceVisualContext } from '@/services/place-visual';
import type { PlacePresentationV1 } from '../../../../../packages/place-presentation/src/contracts.ts';

type PlaceVisualProps = {
  place: PlaceVisualContext;
  placeId: string;
  /** Supply only a provenance-backed venue photo; this is not a database field. */
  realImageUrl?: string | null;
  /** A shorter discovery frame; other consumers retain the standard artwork ratio. */
  compact?: boolean;
  /** Small square artwork for list rows; leaves the title and price room to wrap. */
  thumbnail?: boolean;
  /** Larger compact artwork for discovery and saved-place rows. */
  tile?: boolean;
  /** Ephemeral, validated presentation data; never a persisted place field. */
  presentation?: PlacePresentationV1;
  /** Allows a visible-card owner one bounded refresh after an image failure. */
  onPresentationImageError?: () => void;
  presentationRevision?: number;
};

export function PlaceVisual({ place, placeId, realImageUrl, compact = false, thumbnail = false, tile = false, presentation, onPresentationImageError, presentationRevision = 0 }: PlaceVisualProps) {
  const presentationImage = presentation?.source === 'google_places' ? presentation.image.uri : null;
  const visual = resolvePlaceVisual(place, { realImageUrl: presentationImage ?? realImageUrl });
  // Remount request state for a different place/URL, including after a failed request.
  const requestKey = JSON.stringify([placeId, visual.kind === 'photo' ? visual.source.uri : null, presentationRevision]);
  return <PlaceVisualRequest key={requestKey} place={place} realImageUrl={presentationImage ?? realImageUrl} presentation={presentation} onPresentationImageError={onPresentationImageError} compact={compact} thumbnail={thumbnail} tile={tile} />;
}

function PlaceVisualRequest({ place, realImageUrl, presentation, onPresentationImageError, compact, thumbnail, tile }: Omit<PlaceVisualProps, 'placeId'>) {
  const theme = useDesignTheme();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState(false);
  const visual = resolvePlaceVisual(place, { realImageUrl, failedImageUrl });
  const fallback = resolvePlaceVisual(place);
  const visible = visual.kind === 'photo' && displayed ? visual : fallback;
  const googlePhotoDisplayed = visual.kind === 'photo' && presentation?.source === 'google_places' && displayed;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={visible.accessibilityLabel}
      style={[styles.frame, compact && !tile && styles.compactFrame, thumbnail && styles.thumbnail, tile && styles.tile, { backgroundColor: theme.background.subtle }]}>
      <Image source={fallback.source} style={styles.image} contentFit="cover" accessible={false} />
      {visual.kind === 'photo' ? (
        <Image
          source={visual.source}
          style={styles.image}
          contentFit="cover"
          accessible={false}
          transition={0}
          cachePolicy={presentation?.source === 'google_places' ? 'none' : undefined}
          onDisplay={() => setDisplayed(true)}
          onError={() => { setDisplayed(false); setFailedImageUrl(visual.source.uri); if (presentation?.source === 'google_places') onPresentationImageError?.(); }}
        />
      ) : null}
      {googlePhotoDisplayed ? <PlacePhotoAttribution presentation={presentation} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  compactFrame: { aspectRatio: 5 / 2 },
  thumbnail: { width: 64, height: 64, aspectRatio: 1, flexShrink: 0, borderRadius: Radius.small },
  tile: { width: 96, height: 96, aspectRatio: 1, flexShrink: 0, borderRadius: Radius.media },
  image: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
