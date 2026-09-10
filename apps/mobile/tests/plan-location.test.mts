import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlanLocation } from '../src/services/plan-location.ts';

const meycauayan = { coordinates: { latitude: 14.736, longitude: 120.961 }, label: 'Meycauayan, Bulacan', source: 'current-location' as const };
const bgc = { coordinates: { latitude: 14.55, longitude: 121.05 }, label: 'BGC', source: 'location-search' as const };

test('a no-location Wise intent uses the known current location without another request', async () => {
  let requested = false; const result = await resolvePlanLocation({ explicitLocation: null, currentLocation: meycauayan, requestCurrentLocation: async () => { requested = true; return null; }, resolveExplicitLocation: async () => null });
  assert.equal(result.selection, meycauayan); assert.equal(result.reason, 'current'); assert.equal(requested, false);
});
test('an explicit prompt location overrides current device location', async () => {
  const result = await resolvePlanLocation({ explicitLocation: 'BGC', currentLocation: meycauayan, requestCurrentLocation: async () => meycauayan, resolveExplicitLocation: async (query) => query === 'BGC' ? bgc : null });
  assert.equal(result.selection, bgc); assert.equal(result.reason, 'explicit');
});
test('no saved location requests one, and unavailable resolution remains actionable', async () => {
  const requested = await resolvePlanLocation({ explicitLocation: null, currentLocation: null, requestCurrentLocation: async () => meycauayan, resolveExplicitLocation: async () => null });
  assert.equal(requested.reason, 'requested'); assert.equal(requested.selection, meycauayan);
  const unavailable = await resolvePlanLocation({ explicitLocation: null, currentLocation: null, requestCurrentLocation: async () => null, resolveExplicitLocation: async () => null });
  assert.equal(unavailable.reason, 'unavailable'); assert.equal(unavailable.selection, null);
});
