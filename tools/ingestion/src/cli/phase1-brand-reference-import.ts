import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { connectSupabaseLoaderDatabase } from '../database/supabase-loader-client.js';
import { BRAND_MATCHING_RULE_VERSION } from '../pricing/brand-matcher.js';

const DERIVATION_VERSION = 'normal-solo-order-class.v1';
const SOURCE_CAPTURED_AT = '2026-09-03T00:00:00.000Z';

type Profile = Readonly<{ code: string; name: string; url: string; channel: 'official_delivery' | 'unspecified_official'; min: number; max: number; items: readonly Readonly<{ name: string; amountMinor: number }>[]; excluded: readonly string[] }>;

// Values are reviewed official Philippine menu evidence retained from the prior
// pricing work. This importer deliberately has no web/scraping behaviour.
const PROFILES: readonly Profile[] = [
  { code: 'jollibee', name: 'Jollibee', url: 'https://order.jollibee.com/en/ph', channel: 'official_delivery', min: 14300, max: 25000, items: [{ name: 'Jolly Spaghetti w/ Yumburger w/ Drink', amountMinor: 14300 }, { name: 'Yumburger w/ Fries & Drink', amountMinor: 15400 }, { name: '1-pc Chickenjoy w/ Burger Steak w/ Drink', amountMinor: 19400 }, { name: '1-pc Chickenjoy, Half Jolly Spaghetti, Reg. Fries with Rice and Reg. Drink', amountMinor: 20600 }, { name: '1-pc Chickenjoy, Half Jolly Spaghetti, Burger Steak with Rice and Reg. Drink', amountMinor: 25000 }], excluded: ['free-delivery and gift promos', 'family pans', 'buckets', 'family boxes'] },
  { code: 'kfc', name: 'KFC', url: 'https://www.kfc.com.ph/en/menu', channel: 'unspecified_official', min: 14000, max: 27000, items: [{ name: '1-PC Chicken Meal', amountMinor: 14000 }, { name: 'Chicken Burger Combo', amountMinor: 15000 }, { name: '1-PC Chicken Meal With Soup', amountMinor: 18500 }, { name: 'Ala King Rice Bowl Meal', amountMinor: 21000 }, { name: '2-PC Chicken Meal', amountMinor: 24500 }, { name: 'Zinger Burger Combo', amountMinor: 27000 }], excluded: ["what's-new promotions", 'buckets', 'super platters', 'add-ons', 'sides', 'desserts'] },
  { code: 'mang-inasal', name: 'Mang Inasal', url: 'https://www.manginasal.ph/news/menu-and-prices', channel: 'unspecified_official', min: 9900, max: 25500, items: [{ name: 'Regular Chicken 1 Rice', amountMinor: 9900 }, { name: 'Paa Large 1 Rice', amountMinor: 13900 }, { name: 'Pork Sisig 1 Rice', amountMinor: 10500 }, { name: 'Pecho Large 1 Rice', amountMinor: 16900 }, { name: 'Paa Large Unli Rice', amountMinor: 17900 }, { name: 'Spicy Pecho Large Unli Rice Value Meal', amountMinor: 25500 }], excluded: ['buddy/family/party sizes', 'solo and family fiesta bundles', 'halo-halo-only orders', 'promos'] },
];

async function main(): Promise<void> {
  try { loadEnvFile(fileURLToPath(new URL('../../.env.local', import.meta.url))); } catch { /* CI/operator environment */ }
  const db = await connectSupabaseLoaderDatabase();
  try {
    await db.query('begin');
    for (const profile of PROFILES) {
      const metadata = JSON.stringify({ matching_rule_version: BRAND_MATCHING_RULE_VERSION, canonical_brand: profile.name, source_identity: 'official Philippine menu', observed_at: SOURCE_CAPTURED_AT, qualifying_solo_core_items: profile.items, excluded_menu_classes: profile.excluded, disclosure: "Based on the brand's official menu. Actual prices may vary by location or ordering channel." });
      const result = await db.query<{ chain_id: string; memberships: string; prices: string }>(`
        with chain as (
          insert into public.ew_chains (code, name, country_code)
          values ($1, $2, 'PH')
          on conflict (code) do update set name = excluded.name, country_code = excluded.country_code
          returning id
        ), matching_places as (
          select p.id, p.name
          from public.ew_places p join public.ew_categories c on c.id = p.category_id
          where p.status = 'active' and (c.code = 'food' or c.code like 'food.%')
            and (lower(p.name) = lower($2) or lower(p.name) ~ ('^' || lower(regexp_replace($2, '([^[:alnum:]])', '\\\\&', 'g')) || '([[:space:]]|[-–—(,]|$)'))
        ), memberships as (
          insert into public.ew_place_chain_memberships (place_id, chain_id, link_source, source_reference_url, source_reference_metadata, pricing_profile_applicable, identity_status, verified_at)
          select mp.id, chain.id, 'manual_review', $3, jsonb_build_object('identity_basis','deterministic_brand_name','matching_rule_version',$4,'original_place_name',mp.name,'normalized_place_name',lower(regexp_replace(mp.name, '[^[:alnum:]]+', ' ', 'g')),'canonical_brand',$2), true, 'CONFIRMED_CHAIN', $5::timestamptz
          from matching_places mp cross join chain
          on conflict (place_id) do update set chain_id = excluded.chain_id, link_source = excluded.link_source, source_reference_url = excluded.source_reference_url, source_reference_metadata = excluded.source_reference_metadata, pricing_profile_applicable = true, identity_status = 'CONFIRMED_CHAIN', verified_at = excluded.verified_at
          returning place_id
        ), price as (
          insert into public.ew_place_prices (chain_id, currency_code, min_amount_minor, max_amount_minor, pricing_status, pricing_unit, pricing_source, price_precision, confidence_level, source_reference_url, source_reference_id, source_reference_metadata, last_verified_at, valid_from, pricing_basis, pricing_channel, derivation_version)
          select chain.id, 'PHP', $6, $7, 'paid', 'per_person', 'official_menu', 'derived', 'HIGH', $3, $1 || '-official-ph-menu', $8::jsonb, $5::timestamptz, $5::timestamptz, 'brand_reference', $9, $10
          from chain
          where not exists (select 1 from public.ew_place_prices pp where pp.chain_id = chain.id and pp.pricing_basis = 'brand_reference' and pp.source_reference_id = $1 || '-official-ph-menu')
          returning id
        ) select (select id from chain)::text as chain_id, (select count(*) from memberships)::text as memberships, (select count(*) from price)::text as prices;`, [profile.code, profile.name, profile.url, BRAND_MATCHING_RULE_VERSION, SOURCE_CAPTURED_AT, profile.min, profile.max, metadata, profile.channel, DERIVATION_VERSION]);
      console.log(JSON.stringify({ brand: profile.name, ...result.rows[0] }));
    }
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; } finally { await db.end(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
