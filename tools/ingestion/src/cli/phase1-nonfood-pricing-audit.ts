import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { NON_FOOD_OUTCOMES, classifyNonFoodSemantic, outcomeForManifest, outcomeForSemantic, type NonFoodOutcome, type OfficialPriceManifest } from "../pricing/official-admission-pricing.js";

const run = promisify(execFile);
const PROJECT_REF = "wkgvnpamnhesmmbyikml";
const API_URL = `https://${PROJECT_REF}.supabase.co/rest/v1`;
const CATEGORY_CODES = ["activity.recreation", "entertainment", "entertainment.cinema", "outdoor.park", "attraction", "attraction.museum", "attraction.culture"] as const;
const CAPTURED_AT = "2026-09-03T00:00:00.000Z";
type Place = Readonly<{ id: string; name: string; address: string | null; city: string | null; district: string | null; website_url: string | null; phone_number: string | null; location: unknown; category_id: string }>;
type Category = Readonly<{ id: string; code: string }>;
type Candidate = Readonly<{ place_id: string; place_name: string; category_code: string; city: string | null; outcome: NonFoodOutcome; semantic: string; official_evidence?: OfficialPriceManifest; reason: string }>;

async function rest<T>(path: string, range?: string): Promise<T> {
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required from apps/mobile/.env.local for this read-only audit.");
  const args = ["--silent", "--show-error", "-H", `apikey: ${key}`, "-H", `Authorization: Bearer ${key}`, ...(range ? ["-H", `Range: ${range}`] : []), `${API_URL}/${path}`];
  const { stdout } = await run("curl.exe", args, { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
  return JSON.parse(stdout) as T;
}
function isSocial(url: string | null): boolean { return /(?:facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)/iu.test(url ?? ""); }
function isGovernment(url: string | null): boolean { return /(?:^|\.)gov\.ph(?:[/:]|$)/iu.test(url ?? ""); }
function zone(place: Place): string | null {
  const city = (place.city ?? "").toLowerCase(); const address = (place.address ?? "").toLowerCase();
  if (city.includes("taguig")) return "BGC / Taguig"; if (city.includes("makati")) return "Makati"; if (city.includes("pasig")) return "Ortigas / Pasig"; if (city.includes("quezon")) return "Quezon City commercial areas"; if (city === "manila") return "Manila"; if (city.includes("pasay") || address.includes("mall of asia") || address.includes("moa")) return "Pasay / MOA"; if (city.includes("mandaluyong")) return "Mandaluyong"; return null;
}
function knownEvidence(place: Place): OfficialPriceManifest | undefined {
  if (place.id === "d46ec692-be21-4215-a1b5-25b29d460a10") return { placeId: place.id, sourceUrl: "https://reservation.nationalmuseum.gov.ph/reservation/book/region-museum", sourceTitle: "PAMANA: Book A Tour", operator: "National Museum of the Philippines", productName: "General museum admission", minAmountMinor: 0, maxAmountMinor: 0, currencyCode: "PHP", pricingUnit: "free", audience: "all_visitors", pricingBasis: "branch_verified", applicabilityScope: "PLACE_LEVEL_PRICE", capturedAt: CAPTURED_AT, evidenceNotes: "Official Metro Manila visitor guidance states: Admission is FREE. Place name is the Filipino National Museum name; human review must confirm this source-record identity before import." };
  if (place.id === "2dd82a29-2c47-43ea-8806-dd08581c8ae0") return { placeId: place.id, sourceUrl: "https://manilaoceanpark.com/tickets/ocean-to-jungle-one-pass/", sourceTitle: "Ocean to Jungle, One Pass", operator: "Manila Ocean Park", productName: "Ocean to Jungle, One Pass", minAmountMinor: 95_000, maxAmountMinor: 95_000, currencyCode: "PHP", pricingUnit: "admission", audience: "general", pricingBasis: "branch_verified", applicabilityScope: "MULTI_VENUE_PRODUCT", validFrom: "2026-06-30T00:00:00.000Z", validUntil: "2026-10-01T15:59:59.999Z", capturedAt: CAPTURED_AT, evidenceNotes: "Official one-person promotional ticket covers Manila Ocean Park plus Philippine Biodome; it is not a generic Manila Ocean Park price." };
  return undefined;
}

async function main(): Promise<void> {
  try { loadEnvFile(fileURLToPath(new URL("../../../../apps/mobile/.env.local", import.meta.url))); } catch { /* CI may inject the public key */ }
  const categories = await rest<readonly Category[]>(`ew_categories?select=id,code&code=in.(${CATEGORY_CODES.join(",")})`);
  if (categories.length !== CATEGORY_CODES.length) throw new Error("Target category lookup was incomplete.");
  const categoryById = new Map(categories.map((category) => [category.id, category.code])); const categoryIds = categories.map((category) => category.id).join(",");
  const path = `ew_places?select=id,name,address,city,district,website_url,phone_number,location,category_id&status=eq.active&category_id=in.(${categoryIds})&order=name.asc`;
  const places = [...await rest<readonly Place[]>(path, "0-999"), ...await rest<readonly Place[]>(path, "1000-1999")];
  const candidates: Candidate[] = places.map((place) => { const categoryCode = categoryById.get(place.category_id); if (!categoryCode) throw new Error(`Unknown category for ${place.id}.`); const semantic = classifyNonFoodSemantic({ id: place.id, name: place.name, categoryCode }); const evidence = knownEvidence(place); const outcome = evidence ? outcomeForManifest(evidence, new Date(CAPTURED_AT)) : outcomeForSemantic(semantic); return { place_id: place.id, place_name: place.name, category_code: categoryCode, city: place.city, outcome, semantic, ...(evidence ? { official_evidence: evidence } : {}), reason: evidence ? evidence.evidenceNotes : semantic === "SESSION_SPECIFIC" ? "Cinema prices vary by branch, film, showing, date/time, screen, seat, audience, and channel." : "No current qualifying merchant/operator/government price or free evidence was captured by this bounded source-pattern pilot." }; });
  const categoryCoverage = Object.fromEntries(CATEGORY_CODES.map((code) => { const original = places.filter((place) => categoryById.get(place.category_id) === code); return [code, { places: original.length, website: original.filter((place) => Boolean(place.website_url)).length, retained_social: original.filter((place) => isSocial(place.website_url)).length, government_domain: original.filter((place) => isGovernment(place.website_url)).length, phone: original.filter((place) => Boolean(place.phone_number)).length, address: original.filter((place) => Boolean(place.address)).length, locality: original.filter((place) => Boolean(place.city || place.district)).length, coordinates: original.filter((place) => Boolean(place.location)).length }]; }));
  const semanticDistribution = Object.fromEntries(["ADMISSION", "PER_PERSON_ACTIVITY", "PER_GROUP_RESOURCE", "SESSION_SPECIFIC", "UNKNOWN"].map((semantic) => [semantic, candidates.filter((candidate) => candidate.semantic === semantic).length]));
  const outcomeDistribution = Object.fromEntries(NON_FOOD_OUTCOMES.map((outcome) => [outcome, candidates.filter((candidate) => candidate.outcome === outcome).length]));
  const repeatedNames = Object.entries(places.reduce<Record<string, number>>((counts, place) => { const key = place.name.trim(); counts[key] = (counts[key] ?? 0) + 1; return counts; }, {})).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 50).map(([name, activeLocations]) => ({ name, activeLocations }));
  const zoneNames = ["BGC / Taguig", "Makati", "Ortigas / Pasig", "Quezon City commercial areas", "Manila", "Pasay / MOA", "Mandaluyong"];
  const launchZoneInventory = Object.fromEntries(zoneNames.map((name) => [name, candidates.filter((candidate) => { const place = places.find((item) => item.id === candidate.place_id); return place && zone(place) === name; }).length]));
  const evidenceCandidates = candidates.filter((candidate) => candidate.official_evidence);
  const artifact = { schemaVersion: "explorewise.official-admission-pricing.v1", reviewStatus: "pending_human_review", generatedAt: CAPTURED_AT, productionWrites: 0, scope: { projectRef: PROJECT_REF, activeTargetPlaces: places.length, categories: CATEGORY_CODES }, adapter: { name: "OfficialAdmissionPricingAdapter", contract: "OfficialPriceManifest", acceptedSourceRule: "Only merchant/operator/government-controlled HTTPS evidence; no blogs, reviews, crowdsourced sources, delivery marketplaces, or generated prices.", placePriceWriteRule: "This artifact is research-only; direct ew_place_prices writes are prohibited." }, sourceCoverage: categoryCoverage, semanticDistribution, outcomeDistribution, repeatedNames, launchZoneInventory, candidates, evidenceCandidates, conclusions: { cinema: "SESSION_SPECIFIC: retain UNKNOWN for the first Phase 1 budget implementation; model a future session-price entity before pricing cinema.", governmentBulkOpportunity: "National Museum's official booking system explicitly describes free entry for its Metro Manila main-campus museums, but the current place inventory has only one conservatively matchable record. No bulk import is proposed until identity matching is verified.", recurringResourceUnit: "Current fixed/per_group units preserve non-per-person cost and party-size behavior. Duration/resource type remains evidence metadata; no recurring schema change is justified by this bounded pilot." } };
  const outputDir = fileURLToPath(new URL("../../.artifacts/official-admission-pricing/", import.meta.url)); const outputPath = fileURLToPath(new URL("../../.artifacts/official-admission-pricing/phase1-nonfood-pricing.json", import.meta.url));
  await mkdir(outputDir, { recursive: true }); await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ artifactPath: outputPath, auditedPlaces: places.length, semanticDistribution, outcomeDistribution, evidenceCandidates: evidenceCandidates.length, productionWrites: 0 }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Unknown non-food pricing audit failure."); process.exitCode = 1; });
