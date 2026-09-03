import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";
import { generateMerchantCandidates, matchMerchantStore, type ExploreWisePlace, type MerchantSourceManifest } from "../pricing/merchant-ordering.js";

type PlaceRow = ExploreWisePlace & Readonly<{ name: string }>;
const output = resolve(process.cwd(), ".artifacts/pricing-sources/");
const merchantNames: Readonly<Record<string, string>> = { "kfc-ph": "KFC", "chowking-ph": "Chowking", "jollibee-ph": "Jollibee", "yardstick-coffee": "Yardstick Coffee" };
function environment(): void { try { loadEnvFile(resolve(process.cwd(), ".env.local")); } catch { /* operator may set SUPABASE_DB_URL */ } }
async function main(): Promise<void> {
  environment(); const db = await connectSupabaseLoaderDatabase();
  try {
    const productionSnapshot = await db.query<{ place_prices: number; chains: number; memberships: number; casa_manila_price_minor: number | null }>(`select (select count(*)::int from public.ew_place_prices) as place_prices, (select count(*)::int from public.ew_chains) as chains, (select count(*)::int from public.ew_place_chain_memberships) as memberships, (select min(min_amount_minor) from public.ew_place_prices price join public.ew_places place on place.id = price.place_id where lower(place.name) = 'casa manila') as casa_manila_price_minor`);
    const report = [];
    for (const [key, merchantName] of Object.entries(merchantNames)) {
      const manifest = JSON.parse(await readFile(resolve(output, `${key}-ordering-manifest.json`), "utf8")) as MerchantSourceManifest;
      // Stage A intentionally loads only active discovery candidates. It asks the
      // pure matcher to generate candidates using merchant context plus any
      // phone/address/coordinate evidence; it does not equate a brand name with
      // a branch identity.
      const candidates = await db.query<PlaceRow>(`select id, name, address, city, phone_number as phone, st_y(location::geometry) as latitude, st_x(location::geometry) as longitude from public.ew_places where status = 'active'`);
      const matches = manifest.stores.map((store) => matchMerchantStore(merchantName, store, candidates.rows));
      const generated = manifest.stores.flatMap((store) => generateMerchantCandidates(merchantName, store, candidates.rows));
      const coordinateDistances = generated.flatMap((candidate) => candidate.distanceMeters === undefined ? [] : [candidate.distanceMeters]).sort((a, b) => a - b);
      const percentile = (fraction: number): number | undefined => coordinateDistances.length === 0 ? undefined : coordinateDistances[Math.min(coordinateDistances.length - 1, Math.floor((coordinateDistances.length - 1) * fraction))];
      const count = (outcome: string) => matches.filter((match) => match.outcome === outcome).length;
      report.push({ merchant: manifest.merchant.name, officialStoresDiscovered: manifest.stores.length, storesWithUsableIds: manifest.stores.filter((store) => store.externalStoreId).length, storesWithCoordinates: manifest.stores.filter((store) => store.latitude !== undefined).length, storesWithAddress: manifest.stores.filter((store) => store.address).length, storesWithPhone: manifest.stores.filter((store) => store.phone).length, activeEwPlacesExamined: candidates.rowCount ?? candidates.rows.length, candidatePairsGenerated: generated.length, coordinateCandidateDistancesMeters: { count: coordinateDistances.length, p50: percentile(0.5), p95: percentile(0.95), max: coordinateDistances.at(-1) }, highConfidenceMatches: count("MATCHED_HIGH_CONFIDENCE"), reviewRequired: count("REVIEW_REQUIRED"), noMatch: count("NO_MATCH"), conflicts: count("CONFLICT"), candidateSamples: generated.slice(0, 10), matches });
    }
    await mkdir(output, { recursive: true }); await writeFile(resolve(output, "merchant-ordering-match-pilot.json"), `${JSON.stringify({ schemaVersion: "explorewise.merchant-ordering-match-pilot.v1", generatedAt: new Date().toISOString(), databaseMutations: false, productionSnapshot: productionSnapshot.rows[0], report }, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ artifact: resolve(output, "merchant-ordering-match-pilot.json"), productionSnapshot: productionSnapshot.rows[0], report: report.map(({ matches, candidateSamples, ...summary }) => summary), productionWrites: 0 }, null, 2));
  } finally { await db.end(); }
}
main().catch((cause: unknown) => { console.error(cause instanceof Error ? cause.message : "Unknown error"); process.exitCode = 1; });
