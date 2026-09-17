import assert from 'node:assert/strict';
import test from 'node:test';
import { googleMapsDirectionsUrl } from '../src/services/google-maps.ts';

const base = { name: 'Jollibee', address: 'Ayala Ave.', city: 'Makati', region: 'Metro Manila', latitude: 14.5568, longitude: 121.0172 };

test('matched Google Place ID produces an exact directions URL', () => {
  const url = googleMapsDirectionsUrl({ ...base, googlePlaceId: 'ChIJ id/+', googleMatchStatus: 'matched' });
  assert.match(url, /destination=Jollibee%2C%20Ayala%20Ave\.%2C%20Makati%2C%20Metro%20Manila/);
  assert.match(url, /destination_place_id=ChIJ%20id%2F%2B/);
});

test('needs_review never uses a candidate Google Place ID', () => {
  assert.doesNotMatch(googleMapsDirectionsUrl({ ...base, googlePlaceId: 'candidate', googleMatchStatus: 'needs_review' }), /place_id/);
});

test('ambiguous never uses a candidate Google Place ID', () => {
  assert.doesNotMatch(googleMapsDirectionsUrl({ ...base, googlePlaceId: 'candidate', googleMatchStatus: 'ambiguous' }), /place_id/);
});

test('unmatched places use their existing name and address fallback', () => {
  const url = googleMapsDirectionsUrl({ ...base, googleMatchStatus: 'unmatched' });
  assert.match(url, /destination=Jollibee%2C%20Ayala%20Ave\.%2C%20Makati%2C%20Metro%20Manila/);
});

test('name and coordinate context is used when locality is incomplete', () => {
  assert.match(googleMapsDirectionsUrl({ name: 'Hidden Cafe', latitude: 14.5, longitude: 121 }), /destination=Hidden%20Cafe%2C%2014\.5%2C121/);
});

test('coordinates are the final fallback', () => {
  assert.equal(googleMapsDirectionsUrl({ latitude: 14.5, longitude: 121 }), 'https://www.google.com/maps/dir/?api=1&destination=14.5%2C121');
});

test('destination values are URL encoded', () => {
  const url = googleMapsDirectionsUrl({ name: 'Bo’s Coffee & Tea', address: 'G/F, One Ayala #1', city: 'Makati' });
  assert.ok(url.includes('Bo%E2%80%99s%20Coffee%20%26%20Tea'));
  assert.ok(url.includes('G%2FF%2C%20One%20Ayala%20%231'));
  assert.ok(!url.includes(' '));
});
