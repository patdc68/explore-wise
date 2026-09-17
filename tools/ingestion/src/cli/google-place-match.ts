import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";
import { GooglePlacesTextSearchClient } from "../google-places/client.js";
import { matchExploreWisePlace } from "../google-places/matcher.js";
import { GOOGLE_MATCH_STATUSES, type ExploreWiseGooglePlace, type GoogleMatchStatus, type GooglePlaceMatchResult } from "../google-places/types.js";

type Options = Readonly<{
  dryRun: boolean;
  limit: number;
  placeId?: string;
  status: GoogleMatchStatus;
  forceRefresh: boolean;
  concurrency: number;
}>;

type PlaceRow = Readonly<{
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  country_code: string;
  category_code: string | null;
  latitude: number;
  longitude: number;
  source: string;
  source_place_id: string;
}>;

type ReviewRow = Readonly<{
  ew_place_id: string;
  ew_place_name: string;
  category: string | null;
  ew_locality: string;
  position: number | null;
  candidate_name: string | null;
  distance_m: number | null;
  name_score: number | null;
  locality_score: number | null;
  category_score: number | null;
  confidence: number | null;
  proposed_status: Exclude<GoogleMatchStatus, "not_checked">;
  reason: string;
}>;

function optionValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseGooglePlaceMatchArgs(args: readonly string[]): Options {
  let dryRun = true;
  let limit = 25;
  let placeId: string | undefined;
  let status: GoogleMatchStatus = "not_checked";
  let forceRefresh = false;
  let concurrency = 3;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option) continue;
    if (option === "--dry-run") dryRun = true;
    else if (option === "--write") dryRun = false;
    else if (option === "--force-refresh") forceRefresh = true;
    else if (["--limit", "--place-id", "--status", "--concurrency"].includes(option)) {
      const value = optionValue(args, index, option);
      index += 1;
      if (option === "--limit") {
        limit = Number(value);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be an integer from 1 to 100.");
      } else if (option === "--concurrency") {
        concurrency = Number(value);
        if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new Error("--concurrency must be an integer from 1 to 5.");
      } else if (option === "--place-id") {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new Error("--place-id must be a UUID.");
        placeId = value;
      } else {
        if (!(GOOGLE_MATCH_STATUSES as readonly string[]).includes(value)) throw new Error(`--status must be one of: ${GOOGLE_MATCH_STATUSES.join(", ")}.`);
        status = value as GoogleMatchStatus;
      }
    } else throw new Error(`Unknown option: ${option}`);
  }
  return { dryRun, limit, status, forceRefresh, concurrency, ...(placeId ? { placeId } : {}) };
}

function loadPrivateEnvironment(): void {
  for (const filename of [".env.local", ".env"] as const) {
    try { loadEnvFile(resolve(process.cwd(), filename)); }
    catch { /* Operator-provided environment is equivalent and validated below. */ }
  }
}

function requiredApiKey(environment: NodeJS.ProcessEnv): string {
  const value = environment.GOOGLE_PLACES_API_KEY?.trim();
  if (!value) throw new Error("GOOGLE_PLACES_API_KEY is required for live Google matching. No requests or database writes were made.");
  return value;
}

function toPlace(row: PlaceRow): ExploreWiseGooglePlace {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    district: row.district,
    region: row.region,
    countryCode: row.country_code,
    categoryCode: row.category_code,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    source: row.source,
    sourcePlaceId: row.source_place_id,
  };
}

async function readPlaces(db: Client, options: Options): Promise<readonly ExploreWiseGooglePlace[]> {
  const response = await db.query<PlaceRow>(`
    select
      place.id,
      place.name,
      place.address,
      place.city,
      place.district,
      place.region,
      place.country_code,
      category.code as category_code,
      extensions.st_y(place.location::extensions.geometry) as latitude,
      extensions.st_x(place.location::extensions.geometry) as longitude,
      place.source,
      place.source_place_id
    from public.ew_places as place
    left join public.ew_categories as category on category.id = place.category_id
    where ($1::uuid is null or place.id = $1::uuid)
      and ($2::boolean or place.google_match_status = $3::text)
    order by place.id
    limit $4
  `, [options.placeId ?? null, options.forceRefresh, options.status, options.limit]);
  return response.rows.map(toPlace);
}

export const PERSIST_GOOGLE_MATCH_RESULT_SQL = `
  update public.ew_places
  set google_place_id = $2::text,
      google_match_status = $3::text,
      google_match_confidence = $4::numeric,
      google_match_checked_at = $5::timestamptz,
      google_place_id_refreshed_at = case when $3::text = 'matched' then $5::timestamptz else null::timestamptz end,
      google_match_algorithm_version = $6::text
  where id = $1::uuid
`;

export function googleMatchPersistenceParameters(result: GooglePlaceMatchResult, checkedAt: string): [
  string,
  string | null,
  Exclude<GoogleMatchStatus, "not_checked">,
  number | null,
  string,
  string,
] {
  return [
    result.ewPlaceId,
    result.status === "matched" ? result.bestGooglePlaceId : null,
    result.status,
    result.confidence,
    checkedAt,
    result.algorithmVersion,
  ];
}

async function persistResult(db: Client, result: GooglePlaceMatchResult, checkedAt: string): Promise<void> {
  await db.query(PERSIST_GOOGLE_MATCH_RESULT_SQL, googleMatchPersistenceParameters(result, checkedAt));
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function reviewRows(place: ExploreWiseGooglePlace, result: GooglePlaceMatchResult): ReviewRow[] {
  const locality = [place.address, place.district, place.city, place.region].filter(Boolean).join(", ");
  if (result.candidates.length === 0) return [{
    ew_place_id: place.id, ew_place_name: place.name, category: place.categoryCode, ew_locality: locality,
    position: null, candidate_name: null, distance_m: null, name_score: null, locality_score: null,
    category_score: null, confidence: result.confidence, proposed_status: result.status, reason: result.reason,
  }];
  return result.candidates.map((candidate) => ({
    ew_place_id: place.id,
    ew_place_name: place.name,
    category: place.categoryCode,
    ew_locality: locality,
    position: candidate.position,
    candidate_name: candidate.candidateName,
    distance_m: candidate.distanceMeters === null ? null : Math.round(candidate.distanceMeters),
    name_score: candidate.nameSimilarity,
    locality_score: candidate.localitySupport,
    category_score: candidate.categorySupport,
    confidence: candidate.confidence,
    proposed_status: result.status,
    reason: result.reason,
  }));
}

export async function runGooglePlaceMatch(options: Options, environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const apiKey = requiredApiKey(environment);
  const client = new GooglePlacesTextSearchClient(apiKey);
  const db = await connectSupabaseLoaderDatabase(environment);
  try {
    const places = await readPlaces(db, options);
    const checkedAt = new Date().toISOString();
    const results = await mapConcurrent(places, options.concurrency, (place) => matchExploreWisePlace(place, client));
    if (!options.dryRun) {
      for (const result of results) await persistResult(db, result, checkedAt);
    }
    console.table(results.flatMap((result, index) => reviewRows(places[index]!, result)));
    const summary = {
      mode: options.dryRun ? "dry-run" : "write",
      selectedPlaces: places.length,
      googleApiCalls: results.reduce((total, result) => total + result.apiCallCount, 0),
      matched: results.filter((result) => result.status === "matched").length,
      needsReview: results.filter((result) => result.status === "needs_review").length,
      ambiguous: results.filter((result) => result.status === "ambiguous").length,
      unmatched: results.filter((result) => result.status === "unmatched").length,
      errors: results.filter((result) => result.status === "error").length,
      databaseWrites: options.dryRun ? 0 : results.length,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  loadPrivateEnvironment();
  runGooglePlaceMatch(parseGooglePlaceMatchArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Google place matching failed.");
    process.exitCode = 1;
  });
}
