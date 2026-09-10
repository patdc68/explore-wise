import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";
import { OBSERVED_LOCATOR_ADAPTERS } from "../identity/observed-locators.js";
import { buildMatchingArtifact, calibrateCoordinates, type ExploreWisePlace, type StoreLocatorManifest } from "../identity/store-locator.js";

type PlaceRow = ExploreWisePlace & Readonly<{ name: string }>;
const output = resolve(process.cwd(), ".artifacts/store-locators/");
const candidatesForAudit = [
  ["Jollibee", "Jollibee", "UNSUPPORTED_OBSERVED"], ["KFC", "KFC", "UNSUPPORTED_OBSERVED"], ["McDonald's", "McDonald's", "NOT_YET_VALIDATED"], ["Mang Inasal", "Mang Inasal", "NOT_YET_VALIDATED"], ["Chowking", "Chowking", "SUPPORTED"], ["Starbucks", "Starbucks", "NOT_YET_VALIDATED"], ["Pizza Hut", "Pizza Hut", "NOT_YET_VALIDATED"], ["Shakey's", "Shakey's", "NOT_YET_VALIDATED"], ["Coffee Bean", "The Coffee Bean", "NOT_YET_VALIDATED"], ["Pickup Coffee", "Pickup Coffee", "NOT_YET_VALIDATED"], ["ZUS Coffee", "ZUS Coffee", "NOT_YET_VALIDATED"], ["Macao Imperial Tea", "Macao Imperial", "NOT_YET_VALIDATED"], ["Chatime", "Chatime", "NOT_YET_VALIDATED"], ["Serenitea", "Serenitea", "NOT_YET_VALIDATED"], ["CoCo Fresh Tea & Juice", "CoCo", "NOT_YET_VALIDATED"], ["Manam", "Manam", "NOT_YET_VALIDATED"], ["Army Navy", "Army Navy", "NOT_YET_VALIDATED"], ["Pancake House", "Pancake House", "NOT_YET_VALIDATED"], ["Yellow Cab", "Yellow Cab", "NOT_YET_VALIDATED"], ["Yardstick Coffee", "Yardstick Coffee", "SUPPORTED"],
] as const;

function environment(): void { try { loadEnvFile(resolve(process.cwd(), ".env.local")); } catch { /* DB URL may be supplied by the operator. */ } }
function option(name: string): string | undefined { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function count(outcome: string, artifact: ReturnType<typeof buildMatchingArtifact>): number { return artifact.matches.filter((match) => match.outcome === outcome).length; }
function sourceStats(manifest: StoreLocatorManifest, artifact: ReturnType<typeof buildMatchingArtifact>) {
  return {
    merchant: manifest.merchant.merchantName, merchantKey: manifest.merchant.merchantKey, collectionStatus: manifest.collectionStatus, officialStoresDiscovered: manifest.stores.length,
    storesWithIds: manifest.stores.filter((store) => store.externalStoreId).length, storesWithAddresses: manifest.stores.filter((store) => store.address).length,
    storesWithPhones: manifest.stores.filter((store) => store.phone).length, storesWithCoordinates: manifest.stores.filter((store) => store.latitude !== undefined).length,
    candidatePairs: artifact.matches.reduce((total, match) => total + match.candidates.length, 0), highConfidence: count("MATCHED_HIGH_CONFIDENCE", artifact), reviewRequired: count("REVIEW_REQUIRED", artifact), conflict: count("CONFLICT", artifact), noMatch: count("NO_MATCH", artifact), coordinateCalibration: artifact.calibration,
  };
}
function rankNextLocators(places: readonly PlaceRow[]) {
  return candidatesForAudit.map(([merchant, prefix, availability]) => ({ merchant, activeRepeatedBrandCandidates: places.filter((place) => place.name.toLowerCase() === prefix.toLowerCase() || place.name.toLowerCase().startsWith(`${prefix.toLowerCase()} `)).length, sourceAccessibility: availability, sourceFieldsExpected: "unverified; assess official bulk locator, IDs, addresses, phones, and coordinates", priorityBasis: "active repeated-brand candidate count, then safe official bulk-source availability" })).sort((left, right) => right.activeRepeatedBrandCandidates - left.activeRepeatedBrandCandidates || left.merchant.localeCompare(right.merchant)).map((entry, index) => ({ rank: index + 1, ...entry }));
}

async function main(): Promise<void> {
  const capturedAt = option("--captured-at") ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error("--captured-at must be an ISO timestamp.");
  const placesFile = option("--places-file");
  const scalingFile = option("--scaling-audit-file");
  const suppliedScalingAudit = scalingFile ? JSON.parse(await readFile(resolve(process.cwd(), scalingFile), "utf8")) as unknown : undefined;
  if (placesFile) return runWithPlaces(JSON.parse(await readFile(resolve(process.cwd(), placesFile), "utf8")) as PlaceRow[], capturedAt, { source: "provided read-only candidate snapshot" }, suppliedScalingAudit);
  environment(); const db = await connectSupabaseLoaderDatabase();
  try {
    const [snapshot, places] = await Promise.all([
      db.query<{ places: number; active: number; prices: number; chains: number; memberships: number; casaManilaMinor: number | null }>(`select (select count(*)::int from public.ew_places) as places, (select count(*)::int from public.ew_places where status = 'active') as active, (select count(*)::int from public.ew_place_prices) as prices, (select count(*)::int from public.ew_chains) as chains, (select count(*)::int from public.ew_place_chain_memberships) as memberships, (select min(price.min_amount_minor)::int from public.ew_place_prices price join public.ew_places place on place.id = price.place_id where lower(place.name) = 'casa manila') as "casaManilaMinor"`),
      db.query<PlaceRow>(`select id, name, address, city, phone_number as phone, st_y(location::geometry) as latitude, st_x(location::geometry) as longitude from public.ew_places where status = 'active'`),
    ]);
    await runWithPlaces(places.rows, capturedAt, snapshot.rows[0], suppliedScalingAudit);
  } finally { await db.end(); }
}
async function runWithPlaces(places: readonly PlaceRow[], capturedAt: string, productionSnapshot: unknown, suppliedScalingAudit?: unknown): Promise<void> {
  const manifests = OBSERVED_LOCATOR_ADAPTERS.map((adapter) => adapter.collect({ capturedAt }));
  await mkdir(output, { recursive: true });
  const artifacts = manifests.map((manifest) => {
    const firstPass = buildMatchingArtifact(manifest, places, capturedAt);
    const samples = firstPass.matches.filter((match) => match.outcome === "MATCHED_HIGH_CONFIDENCE" && match.placeId).flatMap((match) => match.candidates.filter((candidate) => candidate.place.id === match.placeId).flatMap((candidate) => candidate.evidence.distanceMeters === undefined ? [] : [candidate.evidence.distanceMeters]));
    return buildMatchingArtifact(manifest, places, capturedAt, calibrateCoordinates(samples));
  });
  await Promise.all(manifests.map((manifest) => writeFile(resolve(output, `${manifest.merchant.merchantKey}-store-locator.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")));
  await Promise.all(artifacts.map((artifact, index) => writeFile(resolve(output, `${manifests[index]!.merchant.merchantKey}-matching.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8")));
  const results = manifests.map((manifest, index) => sourceStats(manifest, artifacts[index]!));
  const totalConfirmed = results.reduce((total, result) => total + result.highConfidence, 0);
  const summary = {
    schemaVersion: "explorewise.store-locator-identity-pilot.v1", capturedAt, databaseMutations: false, productionSnapshot, merchantResults: results, scalingAudit: suppliedScalingAudit ?? rankNextLocators(places),
    coverageContribution: { confirmedIdentitiesObserved: totalConfirmed, brandsWithUsableOfficialReferencePricingObserved: 0, locationsWithBothIdentityAndReferencePricingObserved: 0, projections: [10, 25, 50].map((adapterCount) => ({ adapters: adapterCount, confirmedIdentitiesConservative: Math.floor(adapterCount * 0.7), locationsWithIdentityAndKnownBrandReference: 0, rationale: "Intentionally below the observed 3 confirmations across 2 supported adapters to allow for source variability; no current usable brand_reference price exists, so combined coverage remains zero." })) },
    futureMembershipProvenance: ["merchant/brand key", "official external_store_id (nullable only when source does not provide it)", "official locator source URL and source hash", "matched ew_place id", "matching rule/version", "structured evidence and calibration version", "verified_at"], recommendation: "Implement a read-only official-locator recapture path for Chowking that persists raw public-response snapshots before adding another merchant adapter.",
  };
  await writeFile(resolve(output, "store-locator-identity-pilot.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ artifact: resolve(output, "store-locator-identity-pilot.json"), productionWrites: 0, productionSnapshot, merchantResults: results }, null, 2));
}
main().catch((cause: unknown) => { console.error(cause instanceof Error ? cause.message : "Unknown error"); process.exitCode = 1; });
