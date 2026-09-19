import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryFallbackPresentation,
  serializePlacePresentationResponse,
  validatePlacePresentationRequest,
  validatePlacePresentationResponse,
} from '../src/contracts.ts';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

test('request contract validates version, variant, UUID uniqueness, and three-place cap', () => {
  assert.equal(validatePlacePresentationRequest({ requestVersion: 1, ewPlaceIds: [id], variant: 'thumbnail' }).success, true);
  assert.equal(validatePlacePresentationRequest({ requestVersion: 2, ewPlaceIds: [id], variant: 'thumbnail' }).success, false);
  assert.equal(validatePlacePresentationRequest({ requestVersion: 1, ewPlaceIds: [id, id], variant: 'card' }).success, false);
  assert.equal(validatePlacePresentationRequest({ requestVersion: 1, ewPlaceIds: [id, secondId, id.replace('1', '3'), id.replace('1', '4')], variant: 'hero' }).success, false);
  assert.equal(validatePlacePresentationRequest({ requestVersion: 1, ewPlaceIds: [id], variant: 'gallery' }).success, false);
});

test('Google presentation requires a safe image URI and Google Maps source URI', () => {
  const valid = {
    responseVersion: 1,
    presentations: [{
      presentationVersion: 1,
      ewPlaceId: id,
      source: 'google_places',
      fallbackCategory: 'food.restaurant',
      image: {
        uri: 'https://lh3.googleusercontent.com/photo',
        provider: 'google_maps',
        authorAttributions: [{ displayName: 'TEST photographer', uri: 'https://maps.google.com/author' }],
        googleMapsUri: 'https://maps.google.com/photo',
      },
    }],
  };
  assert.equal(validatePlacePresentationResponse(valid).success, true);
  assert.equal(validatePlacePresentationResponse({ ...valid, presentations: [{ ...valid.presentations[0], image: { ...valid.presentations[0].image, googleMapsUri: 'http://unsafe.test/photo' } }] }).success, false);
  assert.equal(validatePlacePresentationResponse({ ...valid, presentations: [{ ...valid.presentations[0], image: { ...valid.presentations[0].image, name: 'places/x/photos/y' } }] }).success, false);
  assert.equal(validatePlacePresentationResponse({ responseVersion: 1, presentations: [] }).success, false);
  assert.equal(validatePlacePresentationResponse({ ...valid, presentations: [{ ...categoryFallbackPresentation(id, 'food.restaurant', 'no_photo'), image: { uri: 'https://lh3.googleusercontent.com/photo' } }] }).success, false);
  assert.equal(validatePlacePresentationResponse({ ...valid, presentations: [valid.presentations[0], { ...valid.presentations[0], ewPlaceId: secondId }, { ...valid.presentations[0], ewPlaceId: '33333333-3333-4333-8333-333333333333' }, { ...valid.presentations[0], ewPlaceId: '44444444-4444-4444-8444-444444444444' }] }).success, false);
});

test('fallback responses serialize without photo resource names or Google payloads', () => {
  const response = { responseVersion: 1 as const, presentations: [categoryFallbackPresentation(id, 'food.restaurant', 'no_photo')] };
  const serialized = serializePlacePresentationResponse(response);
  assert.match(serialized, /category_fallback/);
  assert.doesNotMatch(serialized, /resourceName|photoUri|places\//);
});
