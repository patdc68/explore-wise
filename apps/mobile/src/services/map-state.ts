export type MapCoordinate = { latitude: number; longitude: number };
export const isFiniteMapCoordinate = (point: MapCoordinate) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;

export type MapPreviewStatus = Readonly<{ mapReady: boolean; mapLoaded: boolean; mapTimedOut: boolean; width: number; height: number }>;
export const initialMapPreviewStatus = (): MapPreviewStatus => ({ mapReady: false, mapLoaded: false, mapTimedOut: false, width: 0, height: 0 });
/** Receives copied layout primitives; never retain a React Native SyntheticEvent. */
export const mapPreviewLayout = (state: MapPreviewStatus, width: number, height: number): MapPreviewStatus => Number.isFinite(width) && Number.isFinite(height) && width >= 0 && height >= 0 ? { ...state, width, height } : state;
export const mapPreviewReady = (state: MapPreviewStatus): MapPreviewStatus => ({ ...state, mapReady: true });
export const mapPreviewLoaded = (state: MapPreviewStatus): MapPreviewStatus => ({ ...state, mapReady: true, mapLoaded: true, mapTimedOut: false });
export const mapPreviewTimedOut = (state: MapPreviewStatus): MapPreviewStatus => state.mapLoaded ? state : { ...state, mapTimedOut: true };
