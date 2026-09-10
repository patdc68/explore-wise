import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { ThemedText } from '@/components/themed-text';
import type { PricedNearbyPlace } from '@/services/places';
import { initialMapPreviewStatus, isFiniteMapCoordinate, mapPreviewLayout, mapPreviewLoaded, mapPreviewReady, mapPreviewTimedOut } from '@/services/map-state';

type Point = { latitude: number; longitude: number; label: string };

export function ItineraryMap({ start, candidates, selected, highlightedId, onPressCandidate }: { start: Point; candidates: readonly PricedNearbyPlace[]; selected: readonly PricedNearbyPlace[]; highlightedId: string | null; onPressCandidate: (place: PricedNearbyPlace) => void }) {
  const [status, setStatus] = useState(initialMapPreviewStatus);
  const validCandidates = candidates.filter(isFiniteMapCoordinate);
  const validSelected = selected.filter(isFiniteMapCoordinate);
  const path = [start, ...validSelected.map((place) => ({ latitude: place.latitude, longitude: place.longitude, label: place.name }))].filter(isFiniteMapCoordinate);
  const mapKey = `${start.latitude}:${start.longitude}:${validSelected.map((place) => place.place_id).join(',')}`;
  const initialRegion = { latitude: start.latitude, longitude: start.longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 };
  const regionValid = isFiniteMapCoordinate(start);
  useEffect(() => { setStatus(initialMapPreviewStatus()); }, [mapKey]);
  useEffect(() => { const timer = setTimeout(() => setStatus(mapPreviewTimedOut), 10_000); return () => clearTimeout(timer); }, [mapKey]);
  useEffect(() => { if (__DEV__) console.log(`[wise-map] provider=default dimensions=${status.width}x${status.height} regionValid=${regionValid} ready=${status.mapReady} loaded=${status.mapLoaded}`); }, [regionValid, status.height, status.mapLoaded, status.mapReady, status.width]);
  if (Platform.OS === 'web') return <View style={styles.webFallback}><ThemedText type="smallBold">Itinerary map</ThemedText><ThemedText type="small" themeColor="textSecondary">Start → {selected.length ? selected.map((place, index) => `${index + 1}. ${place.name}`).join(' → ') : 'select a stop'}</ThemedText></View>;
  if (!isFiniteMapCoordinate(start)) return <View style={styles.webFallback}><ThemedText type="smallBold">Map unavailable</ThemedText><ThemedText type="small" themeColor="textSecondary">Choose a valid start location to show this plan on the map.</ThemedText></View>;
  if (status.mapTimedOut) return <View style={styles.webFallback}><ThemedText type="smallBold">Map preview isn&apos;t available right now.</ThemedText><ThemedText type="small" themeColor="textSecondary">Your stops are still saved in their itinerary sequence.</ThemedText><Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${start.latitude},${start.longitude}`)} style={styles.openMaps}><ThemedText type="smallBold">Open in Maps</ThemedText></Pressable></View>;
  return <View style={styles.mapClip} onLayout={(event) => { const { width, height } = event.nativeEvent.layout; if (!Number.isFinite(width) || !Number.isFinite(height)) return; setStatus((current) => mapPreviewLayout(current, width, height)); }}><MapView key={mapKey} mapType="standard" style={styles.map} initialRegion={initialRegion} onMapReady={() => setStatus(mapPreviewReady)} onMapLoaded={() => setStatus(mapPreviewLoaded)}>
    <Marker coordinate={{ latitude: start.latitude, longitude: start.longitude }} title="Start" pinColor="#17233B" />
    {validCandidates.map((place) => <Marker key={place.place_id} coordinate={{ latitude: place.latitude, longitude: place.longitude }} title={place.name} pinColor={highlightedId === place.place_id ? '#C8F04A' : '#8A9B5A'} onPress={() => onPressCandidate(place)} />)}
    {validSelected.map((place, index) => <Marker key={`selected-${place.place_id}`} coordinate={{ latitude: place.latitude, longitude: place.longitude }} title={`${index + 1}. ${place.name}`} description={`Stop ${index + 1}`}><View style={styles.selectedMarker}><ThemedText type="smallBold">{index + 1}</ThemedText></View></Marker>)}
    {path.length > 1 ? <Polyline coordinates={path} strokeColor="#17233B" strokeWidth={3} /> : null}
  </MapView>{!status.mapLoaded ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color="#17233B" /><ThemedText type="small" themeColor="textSecondary">Loading map preview…</ThemedText></View> : null}</View>;
}

const styles = StyleSheet.create({ mapClip: { backgroundColor: '#EEF8C8', borderRadius: 18, height: 220, overflow: 'hidden', position: 'relative', width: '100%' }, map: { height: '100%', width: '100%' }, loading: { alignItems: 'center', backgroundColor: 'rgba(238,248,200,0.72)', bottom: 0, gap: 6, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 }, selectedMarker: { alignItems: 'center', backgroundColor: '#C8F04A', borderColor: '#17233B', borderRadius: 14, borderWidth: 2, height: 28, justifyContent: 'center', width: 28 }, webFallback: { minHeight: 110, padding: 16, justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: '#EEF8C8' }, openMaps: { alignSelf: 'flex-start', borderColor: '#17233B', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 } });
