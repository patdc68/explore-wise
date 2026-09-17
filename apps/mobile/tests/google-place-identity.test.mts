import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  mergeGoogleIdentityResults,
  visibleNotCheckedPlaceIds,
  warmVisibleGooglePlaceIdentitiesWith,
  type GoogleIdentityResult,
} from '../src/services/google-place-identity-core.ts';
import { googleMapsDirectionsUrl } from '../src/services/google-maps.ts';

const candidate = (place_id: string, google_match_status: 'not_checked' | 'matched' | 'unmatched' | 'needs_review' | 'ambiguous' = 'not_checked') => ({ place_id, google_match_status });
const result = (place_id: string, status: GoogleIdentityResult['google_match_status'], googlePlaceId: string | null = null): GoogleIdentityResult => ({
  place_id,
  google_place_id: googlePlaceId,
  google_match_status: status,
  google_match_confidence: status === 'matched' ? 0.96 : 0.7,
  google_match_checked_at: '2026-09-14T12:00:00.000Z',
  google_match_algorithm_version: 'google-text-v1.1.0',
  google_api_calls: 1,
});

test('warms only not_checked places among the first three visible recommendations', () => {
  assert.deepEqual(visibleNotCheckedPlaceIds([
    candidate('matched', 'matched'),
    candidate('first'),
    candidate('review', 'needs_review'),
    candidate('below-fold'),
  ]), ['first']);
});

test('recommendations remain rendered while background identity enrichment is pending', async () => {
  let release!: (items: readonly GoogleIdentityResult[]) => void;
  const pending = new Promise<readonly GoogleIdentityResult[]>((resolve) => { release = resolve; });
  let rendered = true;
  let updated = false;
  const warming = warmVisibleGooglePlaceIdentitiesWith([candidate('visible')], () => pending, () => { updated = true; });
  assert.equal(rendered, true);
  assert.equal(updated, false);
  release([result('visible', 'matched', 'google-visible')]);
  await warming;
  assert.equal(updated, true);
  rendered = false;
  assert.equal(rendered, false);
});

test('background failure is swallowed and does not mutate recommendation state', async () => {
  let updated = false;
  const results = await warmVisibleGooglePlaceIdentitiesWith([candidate('visible')], async () => { throw new Error('offline'); }, () => { updated = true; });
  assert.deepEqual(results, []);
  assert.equal(updated, false);
});

test('an unresolved not_checked response cannot trigger a warming render loop', async () => {
  let updates = 0;
  const unresolved = result('visible', 'not_checked');
  await warmVisibleGooglePlaceIdentitiesWith([candidate('visible')], async () => [unresolved], () => { updates += 1; });
  assert.equal(updates, 0);
});

test('matched on-demand identity enables Place ID navigation', () => {
  const [place] = mergeGoogleIdentityResults([candidate('visible')], [result('visible', 'matched', 'ChIJ-demand')]);
  const url = googleMapsDirectionsUrl({ name: 'Visible Cafe', address: 'Makati Avenue', city: 'Makati', googlePlaceId: place?.google_place_id, googleMatchStatus: place?.google_match_status });
  assert.match(url, /destination_place_id=ChIJ-demand/);
});

test('non-match preserves the existing name and locality navigation fallback', () => {
  const [place] = mergeGoogleIdentityResults([candidate('visible')], [result('visible', 'unmatched')]);
  const url = googleMapsDirectionsUrl({ name: 'Visible Cafe', address: 'Makati Avenue', city: 'Makati', googlePlaceId: place?.google_place_id, googleMatchStatus: place?.google_match_status });
  assert.doesNotMatch(url, /destination_place_id/);
  assert.match(url, /destination=Visible%20Cafe%2C%20Makati%20Avenue%2C%20Makati/);
});

test('screens schedule identity work after data rendering without adding a loading dependency', () => {
  const explore = readFileSync(new URL('../src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/app/place/[id].tsx', import.meta.url), 'utf8');
  assert.match(explore, /void warmVisibleGooglePlaceIdentities/);
  assert.match(plan, /void warmVisibleGooglePlaceIdentities/);
  assert.match(detail, /place\.googleMatchStatus !== 'not_checked'/);
  assert.match(detail, /void ensureGooglePlaceIdentities/);
  assert.doesNotMatch(detail, /setIsLoading\([^)]*ensureGooglePlaceIdentities/);
});

test('recommendation hydration exposes stored identity in one batched query', () => {
  const places = readFileSync(new URL('../src/services/places.ts', import.meta.url), 'utf8');
  assert.match(places, /select\('id, google_place_id, google_match_status, google_match_confidence'\)/);
  assert.match(places, /\.in\('id', \[\.\.\.new Set\(places\.map/);
  assert.match(places, /return hydrateGoogleIdentities\(await fetchPricedNearbyPlacesBase\(input\)\)/);
});
