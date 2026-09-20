import { createContext, useContext } from 'react';

export type PresentationViewport = Readonly<{
  scrollY: number | null;
  viewportHeight: number;
}>;

type PresentationScrollEventLike = Readonly<{
  nativeEvent?: Readonly<{
    contentOffset?: Readonly<{ y?: number | null }> | null;
    layoutMeasurement?: Readonly<{ height?: number | null }> | null;
  }> | null;
}> | null | undefined;

type PresentationLayoutEventLike = Readonly<{
  nativeEvent?: Readonly<{
    layout?: Readonly<{ height?: number | null }> | null;
  }> | null;
}> | null | undefined;

export type PresentationScrollMetrics = Readonly<{
  offsetY: number | null;
  viewportHeight: number | null;
}>;

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Snapshot native scroll values while the event is still valid. Do not move
 * this read into a functional state updater: Android may clear nativeEvent
 * after the handler returns.
 */
export function readPresentationScrollMetrics(event: PresentationScrollEventLike): PresentationScrollMetrics {
  const nativeEvent = event?.nativeEvent;
  return {
    // A missing offset means visibility is unknown, not that the list is at
    // the top. Keep that distinction so malformed Android events cannot
    // re-enable enrichment for the first cards.
    offsetY: finiteNumberOrNull(nativeEvent?.contentOffset?.y),
    viewportHeight: finiteNumberOrNull(nativeEvent?.layoutMeasurement?.height),
  };
}

export function readPresentationLayoutHeight(event: PresentationLayoutEventLike): number | null {
  return finiteNumberOrNull(event?.nativeEvent?.layout?.height);
}

export function mergePresentationScrollMetrics(current: PresentationViewport, offsetY: number | null, viewportHeight: number | null): PresentationViewport {
  return {
    ...current,
    scrollY: offsetY,
    ...(viewportHeight === null ? {} : { viewportHeight }),
  };
}

export const presentationViewportContext = createContext<PresentationViewport | null>(null);

export function usePresentationViewport(): PresentationViewport | null {
  return useContext(presentationViewportContext);
}
