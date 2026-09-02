import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNearbyPlacesArgs,
  nearbyQueryKey,
  createDiscoveryCategories,
  formatDistance,
  stableCategoryCodes,
} from '../src/services/discovery-utils.ts';

test('formats nearby distances for people, not database values', () => {
  assert.equal(formatDistance(120), '120 m');
  assert.equal(formatDistance(850), '850 m');
  assert.equal(formatDistance(1400), '1.4 km');
  assert.equal(formatDistance(null), null);
});

test('builds bounded nearby RPC arguments and omits an empty category filter', () => {
  assert.deepEqual(
    buildNearbyPlacesArgs({
      coordinates: { latitude: 14.5995, longitude: 120.9842 },
      radiusMeters: 5000,
      categoryCodes: [],
    }),
    {
      p_latitude: 14.5995,
      p_longitude: 120.9842,
      p_radius_meters: 5000,
      p_result_limit: 30,
    },
  );
});

test('expands a selected active root category to its active descendants', () => {
  const categories = createDiscoveryCategories([
    { id: 'food', parent_id: null, code: 'food', name: 'Food', sort_order: 10, is_active: true },
    { id: 'restaurant', parent_id: 'food', code: 'food.restaurant', name: 'Restaurants', sort_order: 10, is_active: true },
    { id: 'cafe', parent_id: 'food', code: 'food.cafe', name: 'Cafes', sort_order: 20, is_active: true },
    { id: 'hidden', parent_id: 'food', code: 'food.hidden', name: 'Hidden', sort_order: 30, is_active: false },
  ]);

  assert.deepEqual(categories, [
    { code: 'food', name: 'Food', categoryCodes: ['food', 'food.restaurant', 'food.cafe'] },
  ]);
});

test('uses a stable primitive query key for equivalent nearby inputs', () => {
  const firstCategoryCodes = stableCategoryCodes(undefined);
  const secondCategoryCodes = stableCategoryCodes([]);
  const firstKey = nearbyQueryKey({
    latitude: 14.5995,
    longitude: 120.9842,
    radiusMeters: 5000,
    categoryCodesKey: firstCategoryCodes,
  });
  const secondKey = nearbyQueryKey({
    latitude: 14.5995,
    longitude: 120.9842,
    radiusMeters: 5000,
    categoryCodesKey: secondCategoryCodes,
  });

  assert.equal(firstKey, secondKey);
  assert.notEqual(
    firstKey,
    nearbyQueryKey({
      latitude: 14.5995,
      longitude: 120.9842,
      radiusMeters: 3000,
      categoryCodesKey: firstCategoryCodes,
    }),
  );
  assert.notEqual(
    firstKey,
    nearbyQueryKey({
      latitude: 14.5995,
      longitude: 120.9842,
      radiusMeters: 5000,
      categoryCodesKey: stableCategoryCodes(['food.restaurant']),
    }),
  );
});
