import { createHash } from "node:crypto";

/** Evidence-only contract. Nothing in this module imports or writes ew_place_prices. */
export const ORDERING_CHANNELS = ["dine_in", "pickup", "official_delivery", "unspecified_official"] as const;
export type OrderingChannel = (typeof ORDERING_CHANNELS)[number];
export const STORE_DISCOVERY = ["BULK_ENUMERABLE", "PARTIALLY_ENUMERABLE", "MANUAL_ONLY", "NOT_AVAILABLE"] as const;
export type StoreDiscovery = (typeof STORE_DISCOVERY)[number];
export const MENU_APPLICABILITY = ["GLOBAL_MENU", "REGIONAL_MENU", "STORE_MENU", "CHANNEL_MENU", "UNKNOWN"] as const;
export type MenuApplicability = (typeof MENU_APPLICABILITY)[number];
export const MATCH_OUTCOMES = ["MATCHED_HIGH_CONFIDENCE", "REVIEW_REQUIRED", "NO_MATCH", "CONFLICT"] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];
/** Required execution guardrails for a future live extractor. */
export type SourceAccessPolicy = Readonly<{ maxConcurrentRequests: number; cacheTtlSeconds: number; maxRetries: number; initialBackoffMs: number; userAgent: string }>;
export const CONSERVATIVE_SOURCE_ACCESS: SourceAccessPolicy = { maxConcurrentRequests: 1, cacheTtlSeconds: 3_600, maxRetries: 2, initialBackoffMs: 1_000, userAgent: "ExploreWiseSourceManifestPilot/1.0 (+https://explore-wise.fun)" };

export type MerchantSource = Readonly<{
  key: string; name: string; officialDomain: string; sourceType: "official_ordering_system" | "official_store_locator" | "structured_storefront";
  sourceReference: string; refreshFeasibility: "AUTOMATABLE_REFRESH" | "SEMI_AUTOMATED_REFRESH" | "MANUAL_REFRESH" | "NOT_FEASIBLE";
}>;
export type MerchantStore = Readonly<{
  externalStoreId?: string; name: string; address?: string; phone?: string; latitude?: number; longitude?: number;
  merchantUrl?: string; active?: boolean; sourceReference: string;
}>;
export type MerchantItem = Readonly<{
  externalItemId?: string; name: string; description?: string; category?: string; amountMinor?: number; currency?: string;
  available?: boolean; promotion?: boolean; sourceReference: string; sourceMetadata?: Readonly<Record<string, string | number | boolean>>;
}>;
export type MerchantMenu = Readonly<{
  externalMenuId?: string; storeExternalIds?: readonly string[]; applicability: MenuApplicability; channel: OrderingChannel;
  capturedAt: string; sourceUpdatedAt?: string; sourceReference: string; items: readonly MerchantItem[]; contentHash?: string;
}>;
export type MerchantSourceManifest = Readonly<{
  schemaVersion: "explorewise.merchant-ordering-manifest.v1"; merchant: MerchantSource; capturedAt: string;
  storeDiscovery: StoreDiscovery; menus: readonly MerchantMenu[]; stores: readonly MerchantStore[]; warnings: readonly string[];
  unsupportedFields: readonly string[]; manifestHash: string;
}>;

export interface MerchantOrderingAdapter {
  readonly merchant: MerchantSource;
  readonly accessPolicy: SourceAccessPolicy;
  collect(input: Readonly<{ capturedAt: string }>): MerchantSourceManifest;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function stableHash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function normalizeCurrency(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(normalized)) throw new Error("Currency must be an ISO 4217 alpha-3 code.");
  return normalized;
}
export function buildManifest(input: Omit<MerchantSourceManifest, "schemaVersion" | "manifestHash">): MerchantSourceManifest {
  if (!input.merchant.key.match(/^[a-z0-9-]+$/u)) throw new Error("Merchant key must be stable lowercase kebab-case.");
  if (new URL(input.merchant.sourceReference).hostname !== input.merchant.officialDomain) throw new Error("Source reference must be on the declared official domain.");
  const storeIds = new Set<string>();
  for (const store of input.stores) {
    if (!store.name.trim() || !store.sourceReference.startsWith("https://")) throw new Error("Store identity and HTTPS source reference are required.");
    if (store.externalStoreId && (storeIds.has(store.externalStoreId) || !storeIds.add(store.externalStoreId))) throw new Error(`Duplicate external store ID: ${store.externalStoreId}`);
  }
  const menus = input.menus.map((menu) => ({ ...menu, contentHash: stableHash({ externalMenuId: menu.externalMenuId, storeExternalIds: menu.storeExternalIds, applicability: menu.applicability, channel: menu.channel, sourceUpdatedAt: menu.sourceUpdatedAt, sourceReference: menu.sourceReference, items: menu.items }) }));
  const menuIds = new Set<string>();
  for (const menu of menus) {
    if (menu.externalMenuId && (menuIds.has(menu.externalMenuId) || !menuIds.add(menu.externalMenuId))) throw new Error(`Duplicate external menu ID: ${menu.externalMenuId}`);
    const itemIds = new Set<string>();
    for (const item of menu.items) {
      if (!item.name.trim()) throw new Error("Menu item name is required.");
      if (item.externalItemId && (itemIds.has(item.externalItemId) || !itemIds.add(item.externalItemId))) throw new Error(`Duplicate item ID in menu: ${item.externalItemId}`);
      if (item.amountMinor !== undefined && (!Number.isSafeInteger(item.amountMinor) || item.amountMinor < 0 || !item.currency)) throw new Error("Price evidence must be non-negative minor units with currency.");
      normalizeCurrency(item.currency);
    }
  }
  const payload = { schemaVersion: "explorewise.merchant-ordering-manifest.v1" as const, ...input, menus };
  return { ...payload, manifestHash: stableHash(payload) };
}

export type ExploreWisePlace = Readonly<{ id: string; name: string; address?: string | null; city?: string | null; phone?: string | null; latitude?: number | null; longitude?: number | null }>;
export type PlaceCandidate = Readonly<{ place: ExploreWisePlace; reasons: readonly string[]; distanceMeters?: number }>;
export type PlaceMatch = Readonly<{ store: MerchantStore; outcome: MatchOutcome; placeId?: string; reason: string; candidateCount: number }>;

/**
 * Stable, deliberately conservative presentation-independent normalizers.
 * These preserve numbers, mall/building context, and unit/floor detail rather
 * than reducing a Metro Manila branch to only city and street.
 */
const text = (value: string | null | undefined): string => (value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const tokens = (value: string | null | undefined): readonly string[] => text(value).replace(/\b(?:g\s*\/\s*f)\b/gu, " ground floor ").replace(/\b(?:l\s*g\s*\/\s*f)\b/gu, " lower ground floor ").replace(/&/gu, " and ").replace(/[^a-z0-9]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
const replacement: Readonly<Record<string, string>> = {
  "brgy": "barangay", "brgy.": "barangay", "baranggay": "barangay", "bgy": "barangay",
  "st": "street", "st.": "street", "ave": "avenue", "ave.": "avenue", "blvd": "boulevard", "blvd.": "boulevard",
  "rd": "road", "rd.": "road", "hwy": "highway", "bldg": "building", "bldg.": "building",
  "fl": "floor", "fl.": "floor", "lvl": "level", "gf": "ground floor", "g f": "ground floor",
  "lgf": "lower ground floor", "l g f": "lower ground floor", "cor": "corner", "cor.": "corner", "cnr": "corner",
  "sto": "santo", "sto.": "santo", "sta": "santa", "sta.": "santa",
};
function expandedTokens(value: string | null | undefined): readonly string[] {
  return tokens(value).flatMap((token) => (replacement[token] ?? token).split(" "));
}
export function normalizePhilippineAddress(value: string | null | undefined): string {
  return expandedTokens(value).join(" ");
}
export function normalizeMetroManilaLocality(value: string | null | undefined): string {
  const normalized = normalizePhilippineAddress(value).replace(/\b(city|metro|manila|philippines)\b/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized === "quezon" ? "quezon city" : normalized;
}
/** Returns country-format numbers only; ambiguous/invalid fragments are rejected. */
export function normalizePhilippinePhone(value: string | null | undefined): readonly string[] {
  const results = new Set<string>();
  for (const raw of (value ?? "").split(/[\/,;]/u)) {
    const digits = raw.replace(/\D/gu, "");
    if (/^09\d{9}$/u.test(digits)) results.add(`63${digits.slice(1)}`);
    else if (/^639\d{9}$/u.test(digits)) results.add(digits);
    else if (/^02\d{8}$/u.test(digits)) results.add(`63${digits.slice(1)}`);
    else if (/^632\d{8}$/u.test(digits)) results.add(digits);
    // A bare eight-digit number is accepted only as an NCR landline form.
    else if (/^[2-8]\d{7}$/u.test(digits)) results.add(`632${digits}`);
  }
  return [...results];
}
const normalizedName = (value: string | null | undefined): string => expandedTokens(value).join(" ");
const nameHasBrandContext = (placeName: string, merchantName: string): boolean => {
  const brand = normalizedName(merchantName).replace(/\bphilippines\b/gu, "").trim();
  const place = normalizedName(placeName);
  return place === brand || place.startsWith(`${brand} `);
};
const METRO_MANILA_LOCALITIES = ["caloocan", "las pinas", "makati", "malabon", "mandaluyong", "manila", "marikina", "muntinlupa", "navotas", "paranaque", "pasay", "pasig", "quezon city", "san juan", "taguig", "valenzuela", "pateros"] as const;
function metroManilaLocality(value: string | null | undefined): string | undefined {
  const normalized = normalizePhilippineAddress(value).replace(/\bmetro manila\b|\bphilippines\b/gu, " ").replace(/\s+/gu, " ").trim();
  return METRO_MANILA_LOCALITIES.find((locality) => new RegExp(`(?:^| )${locality}(?: |$)`, "u").test(normalized));
}
function sameLocality(store: MerchantStore, place: ExploreWisePlace): boolean | undefined {
  const source = metroManilaLocality(store.address);
  const candidate = metroManilaLocality(place.city);
  if (!source || !candidate) return undefined;
  return source === candidate;
}
function addressEvidence(store: MerchantStore, place: ExploreWisePlace): "EXACT" | "STRONG" | undefined {
  const source = normalizePhilippineAddress(store.address); const candidate = normalizePhilippineAddress(place.address);
  if (!source || !candidate) return undefined;
  if (source === candidate) return "EXACT";
  const left = new Set(expandedTokens(store.address)); const right = new Set(expandedTokens(place.address));
  const shared = [...left].filter((token) => right.has(token));
  const sourceNumbers = [...left].filter((token) => /^\d+[a-z]?$/u.test(token));
  const candidateNumbers = new Set([...right].filter((token) => /^\d+[a-z]?$/u.test(token)));
  const sharedNumbers = sourceNumbers.filter((token) => candidateNumbers.has(token));
  const distinctive = shared.filter((token) => token.length >= 4 && !["street", "avenue", "road", "corner", "building", "floor", "level", "metro", "manila"].includes(token));
  // A shared unit/street number plus two meaningful tokens, or three meaningful
  // tokens including a mall/building name, is strong only within compatible city.
  return (sharedNumbers.length >= 1 && distinctive.length >= 1) || distinctive.length >= 3 ? "STRONG" : undefined;
}
const coordinateDistanceMeters = (a: MerchantStore, b: ExploreWisePlace): number | null => {
  if (a.latitude === undefined || a.longitude === undefined || b.latitude === null || b.latitude === undefined || b.longitude === null || b.longitude === undefined) return null;
  const lat = Math.PI / 180; const dLat = (b.latitude - a.latitude) * lat; const dLon = (b.longitude - a.longitude) * lat;
  const c = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * lat) * Math.cos(b.latitude * lat) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
};
/** Stage A: permissive retrieval. It never establishes identity. */
export function generateMerchantCandidates(merchantName: string, store: MerchantStore, places: readonly ExploreWisePlace[]): readonly PlaceCandidate[] {
  const storePhones = new Set(normalizePhilippinePhone(store.phone));
  return places.flatMap((place) => {
    const reasons: string[] = [];
    if (nameHasBrandContext(place.name, merchantName)) reasons.push("merchant_context");
    if (storePhones.size > 0 && normalizePhilippinePhone(place.phone).some((phone) => storePhones.has(phone))) reasons.push("exact_phone");
    if (addressEvidence(store, place)) reasons.push("address_overlap");
    const distance = coordinateDistanceMeters(store, place);
    if (distance !== null && distance <= 75) reasons.push("coordinate_75m");
    return reasons.length > 0 ? [{ place, reasons, ...(distance === null ? {} : { distanceMeters: distance }) }] : [];
  });
}
/** Stage B: requires independent evidence; a merchant/brand name alone never matches. */
export function matchMerchantStore(merchantName: string, store: MerchantStore, places: readonly ExploreWisePlace[], options: Readonly<{ coordinateConfirmationThresholdMeters?: number }> = {}): PlaceMatch {
  const candidates = generateMerchantCandidates(merchantName, store, places);
  const exactPhone = candidates.filter(({ place }) => {
    const source = new Set(normalizePhilippinePhone(store.phone));
    return source.size > 0 && normalizePhilippinePhone(place.phone).some((phone) => source.has(phone));
  });
  if (exactPhone.length === 1) return { store, outcome: "MATCHED_HIGH_CONFIDENCE", placeId: exactPhone[0]!.place.id, reason: "exact normalized official phone", candidateCount: candidates.length };
  if (exactPhone.length > 1) return { store, outcome: "CONFLICT", reason: "exact official phone maps to multiple candidates", candidateCount: candidates.length };
  const confirmed = candidates.filter(({ place, distanceMeters }) => {
    const address = addressEvidence(store, place); const locality = sameLocality(store, place);
    // Address/coordinate evidence establishes a branch only inside the known
    // merchant context. Exact phone is handled above because it is independent
    // identity evidence even if the source happens to spell the brand oddly.
    if (!nameHasBrandContext(place.name, merchantName)) return false;
    // No default distance is used for confirmation. A source family may opt in
    // only after an empirical, recorded calibration against known true matches.
    const coordinateThreshold = options.coordinateConfirmationThresholdMeters;
    const coordinateConfirmed = coordinateThreshold !== undefined && distanceMeters !== undefined && distanceMeters <= coordinateThreshold && locality !== false && address !== undefined;
    return address === "EXACT" || (address === "STRONG" && locality !== false) || coordinateConfirmed;
  });
  if (confirmed.length === 1) return { store, outcome: "MATCHED_HIGH_CONFIDENCE", placeId: confirmed[0]!.place.id, reason: addressEvidence(store, confirmed[0]!.place) === "EXACT" ? "normalized full address" : "strong address/locality or calibrated coordinate evidence with supporting locality", candidateCount: candidates.length };
  if (confirmed.length > 1) return { store, outcome: "CONFLICT", reason: "multiple candidates satisfy independent identity evidence", candidateCount: candidates.length };
  if (candidates.length > 0) return { store, outcome: "REVIEW_REQUIRED", reason: "candidate(s) found, but no independent confirmation", candidateCount: candidates.length };
  return { store, outcome: "NO_MATCH", reason: "no deterministic candidate evidence", candidateCount: 0 };
}
export function isStaleEvidence(capturedAt: string, now: string, maxAgeDays: number): boolean { return Date.parse(now) - Date.parse(capturedAt) > maxAgeDays * 86_400_000; }

/** Pilot observations are deliberately bounded public pages, not inferred store feeds. */
export class ObservedMerchantAdapter implements MerchantOrderingAdapter {
  readonly accessPolicy = CONSERVATIVE_SOURCE_ACCESS;
  constructor(readonly merchant: MerchantSource, private readonly observed: Omit<MerchantSourceManifest, "schemaVersion" | "merchant" | "capturedAt" | "manifestHash">) {}
  collect(input: Readonly<{ capturedAt: string }>): MerchantSourceManifest { return buildManifest({ merchant: this.merchant, capturedAt: input.capturedAt, ...this.observed }); }
}
