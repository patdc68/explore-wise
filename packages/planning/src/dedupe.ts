export type StagePlace<TPlace> = Readonly<{ stageId: string; place: TPlace }>;

/** Exact ExploreWise place identity is the only duplicate identity. */
export function uniqueByPlaceId<T extends Readonly<{ place_id: string }>>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.place_id)) continue;
    seen.add(item.place_id);
    result.push(item);
  }
  return result;
}

export function selectedPlaceIdsForOtherStages<TPlace extends Readonly<{ place_id: string }>>(
  stops: readonly StagePlace<TPlace>[],
  currentStageId: string,
): ReadonlySet<string> {
  return new Set(stops.filter((stop) => stop.stageId !== currentStageId).map((stop) => stop.place.place_id));
}

/** Keep the current stage's selection visible while excluding other exact IDs. */
export function filterCandidatesByPlaceId<TPlace extends Readonly<{ place_id: string }>>(
  stops: readonly StagePlace<TPlace>[],
  currentStageId: string,
  candidates: readonly TPlace[],
): TPlace[] {
  const selectedElsewhere = selectedPlaceIdsForOtherStages(stops, currentStageId);
  const eligible = candidates.filter((place) => !selectedElsewhere.has(place.place_id));
  const currentSelection = stops.find((stop) => stop.stageId === currentStageId)?.place;
  return currentSelection && !eligible.some((place) => place.place_id === currentSelection.place_id)
    ? [currentSelection, ...eligible]
    : eligible;
}

export function historyKeyForStops<TPlace extends Readonly<{ place_id: string }>>(stops: readonly StagePlace<TPlace>[]): string {
  return stops.map((stop) => `${stop.stageId}:${stop.place.place_id}`).join('|');
}

export function historyCombinationsForStops<TPlace extends Readonly<{ place_id: string }>>(stops: readonly StagePlace<TPlace>[]): string[] {
  return stops.map((stop) => `${stop.stageId}:${stop.place.place_id}`);
}
