import { distanceBetweenCoordinates, formatDistance, type CoordinateLike } from './distance.ts';
import type { ItineraryState } from './itinerary.ts';

export type StageDistanceOrigin = Readonly<{
  coordinates: Readonly<{ latitude: number; longitude: number }>;
  relation: 'planning-origin' | 'previous-stop';
}>;

/** Uses the exact origin used by candidate retrieval for the active stage. */
export function stageDistanceOrigin(state: ItineraryState, stageIndex: number): StageDistanceOrigin {
  const priorStop = state.stages.slice(0, stageIndex).reverse()
    .map((stage) => state.stops.find((stop) => stop.stageId === stage.id)?.place)
    .find(Boolean);
  return priorStop
    ? { coordinates: { latitude: priorStop.latitude, longitude: priorStop.longitude }, relation: 'previous-stop' }
    : { coordinates: state.start, relation: 'planning-origin' };
}

export function stageDistanceLabel(origin: StageDistanceOrigin, destination: CoordinateLike | null | undefined): string | null {
  const formatted = formatDistance(distanceBetweenCoordinates(origin.coordinates, destination));
  if (!formatted) return null;
  return origin.relation === 'previous-stop' ? `${formatted} from previous stop` : `${formatted} away`;
}

export type StopDistanceMetadata = Readonly<{ stageId: string; distanceMeters: number | null; label: string | null }>;

/** Rebuilds adjacency from current selections so replacement/removal cannot leave stale distances. */
export function sequentialStopDistances(state: ItineraryState): StopDistanceMetadata[] {
  let origin: CoordinateLike = state.start;
  return state.stops.map((stop, index) => {
    const distanceMeters = distanceBetweenCoordinates(origin, stop.place);
    const formatted = formatDistance(distanceMeters);
    const metadata = {
      stageId: stop.stageId,
      distanceMeters,
      label: formatted ? index === 0 ? `${formatted} away` : `${formatted} from previous stop` : null,
    };
    origin = stop.place;
    return metadata;
  });
}
