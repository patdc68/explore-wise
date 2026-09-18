import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import * as Location from 'expo-location';

import { ThemedText } from '@/components/themed-text';
import { ClayCard, ClayInput, SecondaryButton } from '@/components/ui/clay';
import { Spacing, Typography } from '@/constants/theme';
import { searchCatalogPlaces } from '@/services/places';
import { plannerLocation } from '@/services/guided-planner';
import type { PlanningLocation } from '../../../../../packages/planning/src/intent';

type SearchResult = { id: string; title: string; detail: string; location?: PlanningLocation };

/** Explicit submitted queries use the existing catalog RPC or Plan's device geocoder.
 * No nearby-result filtering, Google Places matching, or recommendation calls. */
export function PlannerSearch({ kind, onPlace, onLocation, selectedIds = [] }: {
  kind: 'area' | 'place'; selectedIds?: readonly string[];
  onPlace?: (id: string, name: string, detail: string) => void; onLocation?: (location: PlanningLocation) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const search = async () => {
    const revision = ++request.current;
    setStatus('loading'); setResults([]); setMessage('');
    try {
      let found: SearchResult[];
      if (kind === 'place') {
        found = (await searchCatalogPlaces({ query: query.trim(), resultLimit: 20 })).map((place) => ({ id: place.place_id, title: place.name, detail: [place.city, place.region].filter(Boolean).join(', ') }));
      } else {
        // Android's native geocoder requires foreground location permission, as in Expo's API.
        if (Platform.OS === 'android' && (await Location.requestForegroundPermissionsAsync()).status !== 'granted') throw new Error('permission');
        const matches = await Location.geocodeAsync(query.trim());
        found = matches.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).slice(0, 8).map((p, index) => {
          const location = plannerLocation({ label: query.trim(), coordinates: { latitude: p.latitude, longitude: p.longitude }, source: 'location-search' });
          return { id: `${index}`, title: location.label, detail: '5 km around this area', location };
        });
      }
      if (revision !== request.current) return;
      setResults(found); setStatus('ready');
      setMessage(found.length ? 'Choose a result below.' : 'No matches found. Try a more specific name or area.');
    } catch (error) {
      if (revision !== request.current) return;
      setStatus('error');
      setMessage(error instanceof Error && error.message === 'permission' ? 'Allow location access to search areas on Android, then try again.' : 'Search is unavailable right now. Check your connection and try again.');
    }
  };
  return <View style={{ gap: Spacing.sm }}>
    <ClayInput accessibilityLabel={kind === 'place' ? 'Search ExploreWise catalog' : 'Search city or area'} placeholder={kind === 'place' ? 'Search a place by name' : 'City or area, including country'} maxLength={120} value={query} returnKeyType="search"
      onChangeText={(value) => { request.current++; setQuery(value); setResults([]); setStatus('idle'); setMessage(''); }} onSubmitEditing={() => { Keyboard.dismiss(); if (query.trim().length >= 2) void search(); }} />
    <SecondaryButton label={status === 'error' ? 'Try search again' : kind === 'place' ? 'Search a place' : 'Search area'} loading={status === 'loading'} loadingLabel="Searching…" disabled={query.trim().length < 2} onPress={() => { Keyboard.dismiss(); void search(); }} />
    {message ? <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary">{message}</ThemedText> : null}
    {results.map((result) => {
      const selected = selectedIds.some((id) => id.toLowerCase() === result.id.toLowerCase());
      return <ClayCard key={result.id} variant="subtle" accessibilityLabel={`${selected ? 'Added' : 'Select'} ${result.title}, ${result.detail}`} accessibilityState={{ selected }} disabled={selected} onPress={() => {
      setResults([]); setStatus('idle'); setMessage(kind === 'place' ? 'Place added.' : 'Location selected.');
      if (result.location) onLocation?.(result.location);
      else onPlace?.(result.id, result.title, result.detail);
    }}>
      <ThemedText style={Typography.label}>{selected ? '✓ ' : ''}{result.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{result.detail}</ThemedText>
    </ClayCard>;
    })}
  </View>;
}
