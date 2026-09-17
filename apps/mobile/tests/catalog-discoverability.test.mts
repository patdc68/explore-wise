import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  chooseConfidentCatalogAnchor,
  explicitVenueQueryFromPrompt,
  hasStrongCatalogNameEvidence,
  normalizeCatalogText,
  type CatalogSearchCandidate,
} from '../src/services/catalog-search.ts';
import { addCatalogPlace, buildStages } from '../src/services/itinerary.ts';
import type { AskWiseIntent } from '../src/services/ask-wise-normalization.ts';
import { buildWiseProposal } from '../src/services/wise-proposal.ts';

const candidate = (name: string, options: Partial<CatalogSearchCandidate> = {}): CatalogSearchCandidate => ({
  place_id: options.place_id ?? normalizeCatalogText(name),
  name,
  category_code: options.category_code ?? 'food.cafe',
  category_name: options.category_name ?? 'Cafés',
  address: options.address ?? null,
  city: options.city ?? 'Quezon City',
  region: options.region ?? 'Metro Manila',
  country_code: options.country_code ?? 'PH',
  latitude: options.latitude ?? 14.67,
  longitude: options.longitude ?? 121.04,
  website_url: options.website_url ?? null,
  phone_number: options.phone_number ?? null,
  distance_meters: options.distance_meters ?? 1_000,
  has_price: options.has_price ?? false,
  pricing_basis: options.pricing_basis ?? null,
  pricing_status: options.pricing_status ?? null,
  pricing_unit: options.pricing_unit ?? null,
  min_amount_minor: options.min_amount_minor ?? null,
  max_amount_minor: options.max_amount_minor ?? null,
  currency_code: options.currency_code ?? null,
  confidence_level: options.confidence_level ?? null,
  price_precision: options.price_precision ?? null,
  pricing_channel: options.pricing_channel ?? null,
  price_source_label: options.price_source_label ?? 'Price not available yet',
  last_verified_at: options.last_verified_at ?? null,
  effective_price_source: options.effective_price_source ?? null,
  budget_status: options.budget_status ?? 'unknown',
  estimated_group_min_minor: options.estimated_group_min_minor ?? null,
  estimated_group_max_minor: options.estimated_group_max_minor ?? null,
  name_match_score: options.name_match_score ?? 1,
  locality_match_score: options.locality_match_score ?? 1,
});

test('catalog normalization is case-, accent-, apostrophe-, and punctuation-insensitive', () => {
  assert.equal(normalizeCatalogText('Patio Plant Cafè'), normalizeCatalogText('patio plant cafe'));
  assert.equal(normalizeCatalogText("O’Malley's Grill"), normalizeCatalogText('OMalleys Grill'));
  assert.equal(normalizeCatalogText('Cinema—76'), normalizeCatalogText('cinema 76'));
});

test('explicit venue phrases are extracted generically while ordinary discovery prompts stay unanchored', () => {
  assert.equal(explicitVenueQueryFromPrompt('date at Patio Plant Cafe in Quezon City', 'Quezon City'), 'Patio Plant Cafe');
  assert.equal(explicitVenueQueryFromPrompt('dinner at Wildflour in Makati', 'Makati'), 'Wildflour');
  assert.equal(explicitVenueQueryFromPrompt('coffee at Yardstick'), 'Yardstick');
  assert.equal(explicitVenueQueryFromPrompt('find a cafe in Quezon City', 'Quezon City'), null);
  assert.equal(explicitVenueQueryFromPrompt('dinner at a restaurant in Makati', 'Makati'), null);
});

test('strong name evidence accepts active-catalog style variants and rejects weak fuzzy guesses', () => {
  assert.equal(hasStrongCatalogNameEvidence('Yardstick', candidate('Yardstick Coffee', { name_match_score: 0.93 })), true);
  assert.equal(hasStrongCatalogNameEvidence('O Malleys Grill', candidate("O'Malley's Grill", { name_match_score: 0.93 })), true);
  assert.equal(hasStrongCatalogNameEvidence('Garden House', candidate('Grand House', { name_match_score: 0.61 })), false);
});

test('requested locality disambiguates similar catalog names and rejects wrong-city-only results', () => {
  const makati = candidate('Common Ground', { place_id: 'makati', city: 'Makati', locality_match_score: 1, distance_meters: 800 });
  const quezonCity = candidate('Common Ground', { place_id: 'qc', city: 'Quezon City', locality_match_score: 0.1, distance_meters: 12_000 });
  assert.equal(chooseConfidentCatalogAnchor('Common Ground', [quezonCity, makati], true)?.place_id, 'makati');
  assert.equal(chooseConfidentCatalogAnchor('Common Ground', [{ ...quezonCity, distance_meters: 40_000 }], true), null);
});

test('a named unknown-price cafe anchors Ask Wise and complementary retrieval starts from it', async () => {
  const anchor = candidate('Café Seventy Six', { place_id: 'accented-cafe', latitude: 14.61, longitude: 121.02, has_price: false, budget_status: 'unknown' });
  const activity = candidate('City Museum', { place_id: 'museum', category_code: 'attraction.museum', category_name: 'Museums', latitude: 14.62, longitude: 121.03 });
  const intent: AskWiseIntent = { budgetMinor: 200_000, partySize: 2, location: 'Quezon City', currencyCode: 'PHP', timeContext: null, preferences: [], exclusions: [], stages: ['cafe', 'activity_fun'], inferredStages: [], activityFocus: null, explicitQuickService: false };
  const origins: Array<{ latitude: number; longitude: number }> = [];
  const proposal = await buildWiseProposal({ intent, start: { latitude: 14.65, longitude: 121.04, label: 'Quezon City' }, anchor, fetcher: async ({ coordinates }) => { origins.push(coordinates); return [activity]; } });
  assert.equal(proposal.anchorPlaceId, 'accented-cafe');
  assert.deepEqual(proposal.state.stops.map((stop) => stop.place.place_id), ['accented-cafe', 'museum']);
  assert.equal(origins[0]?.latitude, anchor.latitude);
  assert.equal(origins[0]?.longitude, anchor.longitude);
  assert.equal(proposal.state.stops[0]?.place.has_price, false);
  assert.equal(proposal.state.stops[0]?.place.estimated_group_max_minor, null);
});

test('itinerary catalog additions accept representative categories without optional price or category data', () => {
  const base: any = { start: { latitude: 14.55, longitude: 121.02, label: 'Metro Manila' }, budgetMinor: 300_000, partySize: 2, stages: buildStages(['food_talk']), stops: [] };
  const representatives = [
    candidate('Full Metadata Café', { place_id: 'cafe-full', has_price: true, min_amount_minor: 20_000, max_amount_minor: 30_000, estimated_group_min_minor: 40_000, estimated_group_max_minor: 60_000 }),
    candidate('Unknown Price Café', { place_id: 'cafe-unknown' }),
    candidate('Local Restaurant', { place_id: 'restaurant', category_code: 'food.restaurant', category_name: 'Restaurants' }),
    candidate('Chain Branch - High Street', { place_id: 'chain', category_code: 'food.restaurant', category_name: 'Restaurants' }),
    candidate('Cinema 76', { place_id: 'cinema', category_code: 'entertainment.cinema', category_name: 'Cinemas' }),
    candidate('Riverside Park', { place_id: 'park', category_code: 'outdoor.park', category_name: 'Parks' }),
    candidate('Unclassified Active Place', { place_id: 'unclassified', category_code: null, category_name: null }),
  ];
  for (const place of representatives) {
    const added = addCatalogPlace(base, place);
    assert.equal(added.stops.at(-1)?.place.place_id, place.place_id);
    assert.equal(added.stops.at(-1)?.place.has_price, place.has_price);
  }
  const once = addCatalogPlace(base, representatives[0]!);
  assert.equal(addCatalogPlace(once, representatives[0]!), once);
});

test('catalog RPC is bounded, active-only, optional-metadata tolerant, indexed, and independent of Google identity', () => {
  const migration = readFileSync(new URL('../../../supabase/migrations/20260915144016_catalog_place_search.sql', import.meta.url), 'utf8');
  const unicodeMigration = readFileSync(new URL('../../../supabase/migrations/20260915144131_preserve_unicode_catalog_search.sql', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  assert.match(migration, /where place\.status = 'active'/);
  assert.match(migration, /left join public\.ew_categories/);
  assert.match(migration, /left join lateral/);
  assert.match(migration, /p_result_limit < 1 or p_result_limit > 30/);
  assert.match(migration, /ew_places_active_normalized_name_trgm_idx/);
  assert.doesNotMatch(migration, /google_place_id|google_match_status/);
  assert.match(unicodeMigration, /\[\^\[:alnum:\]\]\+/);
  assert.match(unicodeMigration, /reindex index public\.ew_places_active_normalized_name_trgm_idx/);
  assert.match(plan, /searchCatalogPlaces\(\{/);
  assert.match(plan, /addCatalogPlace\(current, place\)/);
});
