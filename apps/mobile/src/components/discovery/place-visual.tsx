import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDesignTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { resolvePlaceVisual, type PlaceVisualContext } from '@/services/place-visual';

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
};

export function PlaceVisual({ place, placeId, realImageUrl, compact = false, thumbnail = false, tile = false }: PlaceVisualProps) {
  const visual = resolvePlaceVisual(place, { realImageUrl });
  // Remount request state for a different place/URL, including after a failed request.
  const requestKey = JSON.stringify([placeId, visual.kind === 'photo' ? visual.source.uri : null]);
  return <PlaceVisualRequest key={requestKey} place={place} realImageUrl={realImageUrl} compact={compact} thumbnail={thumbnail} tile={tile} />;
}

function PlaceVisualRequest({ place, realImageUrl, compact, thumbnail, tile }: Omit<PlaceVisualProps, 'placeId'>) {
  const theme = useDesignTheme();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState(false);
  const visual = resolvePlaceVisual(place, { realImageUrl, failedImageUrl });
  const fallback = resolvePlaceVisual(place);
  const visible = visual.kind === 'photo' && displayed ? visual : fallback;

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
          onDisplay={() => setDisplayed(true)}
          onError={() => setFailedImageUrl(visual.source.uri)}
        />
      ) : null}
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
