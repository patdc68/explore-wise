import assert from 'node:assert/strict';
import test from 'node:test';
import { GooglePlacesPresentationClient, GooglePresentationClientError, parseGooglePhotoDetails, parseGooglePhotoMedia } from './google.ts';
import { PlacePresentationService } from './service.ts';

const id = '11111111-1111-4111-8111-111111111111';
const googleId = 'ChIJ-test-place';

test('Google photo parsing requires current resource name and source URI', () => {
  assert.equal(parseGooglePhotoDetails({ photos: [{ name: 'places/x/photos/y', googleMapsUri: 'https://maps.google.com/photo', widthPx: 640, heightPx: 480, authorAttributions: [{ displayName: 'TEST author', uri: 'https://maps.google.com/author' }] }] })?.resourceName, 'places/x/photos/y');
  assert.equal(parseGooglePhotoDetails({ photos: [{ name: 'places/x/photos/y', googleMapsUri: 'http://unsafe.test/photo' }] }), null);
  assert.equal(parseGooglePhotoDetails({ photos: [{ name: 'places/x/photos/y', googleMapsUri: 'https://maps.google.com/photo', authorAttributions: [{ displayName: 'bad', uri: 'http://unsafe.test/author' }] }] }), null);
  assert.equal(parseGooglePhotoMedia({ photoUri: 'https://lh3.googleusercontent.com/photo' }), 'https://lh3.googleusercontent.com/photo');
  assert.equal(parseGooglePhotoMedia({ photoUri: 'http://unsafe.test/photo' }), null);
});

test('Google transport uses the exact photos field mask, header key, and discards resource name', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new GooglePlacesPresentationClient('TEST_SERVER_KEY', async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(calls.length === 1
      ? JSON.stringify({ photos: [{ name: 'places/x/photos/y', googleMapsUri: 'https://maps.google.com/photo', authorAttributions: [] }] })
      : JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/photo' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const result = await client.fetchPhoto(googleId, 'thumbnail');
  assert.equal(result?.presentation?.uri, 'https://lh3.googleusercontent.com/photo');
  assert.equal(calls[0]?.init?.headers && (calls[0]!.init!.headers as Record<string, string>)['X-Goog-FieldMask'], 'photos');
  assert.equal(calls[0]?.init?.headers && (calls[0]!.init!.headers as Record<string, string>)['X-Goog-Api-Key'], 'TEST_SERVER_KEY');
  assert.doesNotMatch(calls.map((call) => call.url).join('\n'), /TEST_SERVER_KEY/);
  assert.match(calls[1]?.url ?? '', /skipHttpRedirect=true/);
  assert.doesNotMatch(JSON.stringify(result), /resourceName|places\/x\/photos\/y/);
});

test('presentation service is read-only, isolated per place, and bounded to two concurrent operations', async () => {
  const calls: string[] = [];
  const service = new PlacePresentationService({
    readActivePlaces: async (placeIds) => placeIds.map((placeId) => ({ ewPlaceId: placeId, googlePlaceId: placeId === id ? googleId : null, googleMatchStatus: placeId === id ? 'matched' : 'unmatched', fallbackCategory: 'food.restaurant' })),
  }, {
    fetchPhoto: async (placeId) => { calls.push(placeId); return { apiCallCount: 2, presentation: placeId === googleId ? { uri: 'https://lh3.googleusercontent.com/photo', authorAttributions: [], googleMapsUri: 'https://maps.google.com/photo' } : null }; },
  });
  const result = await service.present({ requestVersion: 1, ewPlaceIds: [id, '22222222-2222-4222-8222-222222222222'], variant: 'card' });
  assert.equal(result.response.presentations.length, 2);
  assert.equal(result.response.presentations[0]?.source, 'google_places');
  assert.equal(result.response.presentations[1]?.source, 'category_fallback');
  assert.deepEqual(calls, [googleId]);
  assert.equal(result.googleCallCount, 2);
});

test('one Google failure becomes a classified fallback without failing its neighbors', async () => {
  const secondId = '22222222-2222-4222-8222-222222222222';
  const service = new PlacePresentationService({
    readActivePlaces: async (placeIds) => placeIds.map((placeId) => ({ ewPlaceId: placeId, googlePlaceId: placeId === id ? googleId : 'ChIJ-second', googleMatchStatus: 'matched', fallbackCategory: 'food.restaurant' })),
  }, {
    fetchPhoto: async (placeId) => {
      if (placeId === googleId) throw new GooglePresentationClientError('api_error', true, 'Google Places returned HTTP 429.', 1);
      return { apiCallCount: 2, presentation: { uri: 'https://lh3.googleusercontent.com/photo', authorAttributions: [], googleMapsUri: 'https://maps.google.com/photo' } };
    },
  });
  const result = await service.present({ requestVersion: 1, ewPlaceIds: [id, secondId], variant: 'thumbnail' });
  assert.equal(result.response.presentations[0]?.source, 'category_fallback');
  assert.equal(result.response.presentations[0]?.source === 'category_fallback' ? result.response.presentations[0].fallbackReason : null, 'quota');
  assert.equal(result.response.presentations[1]?.source, 'google_places');
  assert.equal(result.googleCallCount, 3);
});

test('Google operations never exceed the two-operation concurrency cap', async () => {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
  let active = 0;
  let maximum = 0;
  const service = new PlacePresentationService({
    readActivePlaces: async (placeIds) => placeIds.map((placeId) => ({ ewPlaceId: placeId, googlePlaceId: `ChIJ-${placeId}`, googleMatchStatus: 'matched', fallbackCategory: 'food.restaurant' })),
  }, {
    fetchPhoto: async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { apiCallCount: 2, presentation: { uri: 'https://lh3.googleusercontent.com/photo', authorAttributions: [], googleMapsUri: 'https://maps.google.com/photo' } };
    },
  });
  const result = await service.present({ requestVersion: 1, ewPlaceIds: ids, variant: 'thumbnail' });
  assert.equal(result.response.presentations.every((item) => item.source === 'google_places'), true);
  assert.equal(maximum, 2);
});
