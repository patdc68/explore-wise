export type PresentationViewport = Readonly<{
  scrollY: number | null;
  viewportHeight: number;
}>;

export type PresentationLayout = Readonly<{
  y: number;
  height: number;
}>;

/**
 * Returns only records with measured bounds intersecting the actual scroll
 * viewport. Unknown bounds intentionally produce no candidates; callers must
 * not substitute a rendered-array slice while layout is settling.
 */
export function visiblePresentationIds(
  orderedIds: readonly string[],
  viewport: PresentationViewport | null,
  layouts: Readonly<Record<string, PresentationLayout>>,
  maxPlaces = 3,
): readonly string[] {
  if (!viewport || viewport.scrollY === null || !Number.isFinite(viewport.scrollY) || !Number.isFinite(viewport.viewportHeight) || viewport.viewportHeight <= 0 || maxPlaces <= 0) return [];
  const viewportStart = viewport.scrollY;
  const viewportEnd = viewportStart + viewport.viewportHeight;
  return orderedIds.filter((id) => {
    const layout = layouts[id.toLowerCase()];
    return Boolean(layout && Number.isFinite(layout.y) && Number.isFinite(layout.height) && layout.height > 0 && layout.y + layout.height >= viewportStart && layout.y <= viewportEnd);
  }).slice(0, maxPlaces);
}
