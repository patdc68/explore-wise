export type CoordinateLike = Readonly<{
  latitude?: number | null;
  longitude?: number | null;
}>;

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function isValidCoordinates(coordinates: CoordinateLike | null | undefined): coordinates is Readonly<{ latitude: number; longitude: number }> {
  return Boolean(
    coordinates
    && Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && coordinates.latitude! >= -90
    && coordinates.latitude! <= 90
    && coordinates.longitude! >= -180
    && coordinates.longitude! <= 180,
  );
}

/** Deterministic great-circle distance. Invalid coordinates never become zero. */
export function geodesicDistanceMeters(
  latitude1: number | null | undefined,
  longitude1: number | null | undefined,
  latitude2: number | null | undefined,
  longitude2: number | null | undefined,
): number | null {
  const from = { latitude: latitude1, longitude: longitude1 };
  const to = { latitude: latitude2, longitude: longitude2 };
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) return null;

  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const latitudeA = toRadians(from.latitude);
  const latitudeB = toRadians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  const distance = EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
  return Number.isFinite(distance) ? distance : null;
}

export function distanceBetweenCoordinates(from: CoordinateLike | null | undefined, to: CoordinateLike | null | undefined): number | null {
  return geodesicDistanceMeters(from?.latitude, from?.longitude, to?.latitude, to?.longitude);
}

export function formatDistance(distanceMeters: number | null | undefined): string | null {
  if (distanceMeters === null || distanceMeters === undefined || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  if (distanceMeters > 0 && distanceMeters < 50) return '< 50 m';
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  if (distanceMeters < 10_000) return `${(distanceMeters / 1_000).toFixed(1)} km`;
  return `${Math.round(distanceMeters / 1_000)} km`;
}
