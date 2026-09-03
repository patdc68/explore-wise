import { createHash } from "node:crypto";

/**
 * Provenance-only store-locator contract. This module intentionally has no
 * price, chain-membership, or database-write dependency.
 */
export const LOCATOR_OUTCOMES = ["MATCHED_HIGH_CONFIDENCE", "REVIEW_REQUIRED", "NO_MATCH", "CONFLICT"] as const;
export type LocatorOutcome = (typeof LOCATOR_OUTCOMES)[number];
export type JsonScalar = string | number | boolean | null;
export type SourceMetadata = Readonly<Record<string, JsonScalar>>;

export type OfficialLocatorSource = Readonly<{
  merchantKey: string;
  merchantName: string;
  officialDomains: readonly string[];
  sourceType: "official_store_locator" | "official_locations_api" | "official_structured_listing" | "official_location_page";
  sourceReference: string;
  access: "PUBLIC_NORMAL_EXPERIENCE";
}>;

export type OfficialStore = Readonly<{
  externalStoreId?: string;
  officialName: string;
  address?: string;
  locality?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  officialReference?: string;
  sourceUpdatedAt?: string;
  active?: boolean;
  sourceMetadata?: SourceMetadata;
}>;

export type StoreLocatorManifest = Readonly<{
  schemaVersion: "explorewise.store-locator-manifest.v1";
  collectionStatus: "SUPPORTED" | "UNSUPPORTED";
  merchant: OfficialLocatorSource;
  capturedAt: string;
  stores: readonly OfficialStore[];
  provenance: Readonly<{ sourceHash: string; adapterVersion: "store-locator-identity.v1"; collectionMethod: "official_public_snapshot" }>;
  warnings: readonly string[];
  unsupportedFields: readonly string[];
  manifestHash: string;
}>;

export interface StoreLocatorIdentityAdapter {
  readonly source: OfficialLocatorSource;
  collect(input: Readonly<{ capturedAt: string }>): StoreLocatorManifest;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function stableHash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }

function isOfficialReference(value: string, source: OfficialLocatorSource): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return source.officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
function finiteCoordinate(value: number | undefined): boolean { return value === undefined || Number.isFinite(value); }

export function buildStoreLocatorManifest(input: Omit<StoreLocatorManifest, "schemaVersion" | "manifestHash" | "provenance"> & Readonly<{ adapterVersion?: "store-locator-identity.v1" }>): StoreLocatorManifest {
  const { merchant, stores } = input;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(merchant.merchantKey)) throw new Error("Merchant key must be stable lowercase kebab-case.");
  if (merchant.access !== "PUBLIC_NORMAL_EXPERIENCE") throw new Error("Only normal public merchant locator sources are supported.");
  if (!isOfficialReference(merchant.sourceReference, merchant)) throw new Error("Locator source must be on a declared official merchant domain.");
  const seenIds = new Set<string>();
  for (const store of stores) {
    if (!store.officialName.trim()) throw new Error("Official store name is required.");
    if (store.externalStoreId && (!store.externalStoreId.trim() || seenIds.has(store.externalStoreId))) throw new Error(`Duplicate external store ID: ${store.externalStoreId}`);
    if (store.externalStoreId) seenIds.add(store.externalStoreId);
    if (!finiteCoordinate(store.latitude) || !finiteCoordinate(store.longitude)) throw new Error("Coordinates must be finite numbers.");
    if ((store.latitude === undefined) !== (store.longitude === undefined)) throw new Error("Coordinates require both latitude and longitude.");
    if (store.officialReference && !isOfficialReference(store.officialReference, merchant)) throw new Error("Store reference must be on a declared official merchant domain.");
  }
  const sourceHash = stableHash({ merchant, stores, warnings: input.warnings, unsupportedFields: input.unsupportedFields });
  const payload = {
    schemaVersion: "explorewise.store-locator-manifest.v1" as const,
    collectionStatus: input.collectionStatus,
    merchant,
    capturedAt: input.capturedAt,
    stores: [...stores].sort(storeOrder),
    provenance: { sourceHash, adapterVersion: input.adapterVersion ?? "store-locator-identity.v1" as const, collectionMethod: "official_public_snapshot" as const },
    warnings: [...input.warnings],
    unsupportedFields: [...input.unsupportedFields].sort(),
  };
  return { ...payload, manifestHash: stableHash(payload) };
}

function storeOrder(left: OfficialStore, right: OfficialStore): number {
  return `${left.externalStoreId ?? ""}\u0000${left.officialName}`.localeCompare(`${right.externalStoreId ?? ""}\u0000${right.officialName}`);
}

/** A source adapter receives a bounded response captured from the public locator. */
export class OfficialSnapshotStoreLocatorAdapter implements StoreLocatorIdentityAdapter {
  constructor(readonly source: OfficialLocatorSource, private readonly snapshot: Readonly<{ stores: readonly OfficialStore[]; warnings?: readonly string[]; unsupportedFields?: readonly string[] }>) {}
  collect(input: Readonly<{ capturedAt: string }>): StoreLocatorManifest {
    return buildStoreLocatorManifest({ collectionStatus: "SUPPORTED", merchant: this.source, capturedAt: input.capturedAt, stores: this.snapshot.stores, warnings: this.snapshot.warnings ?? [], unsupportedFields: this.snapshot.unsupportedFields ?? [] });
  }
}
export class UnsupportedStoreLocatorAdapter implements StoreLocatorIdentityAdapter {
  constructor(readonly source: OfficialLocatorSource, private readonly reason: string, private readonly unsupportedFields: readonly string[]) {}
  collect(input: Readonly<{ capturedAt: string }>): StoreLocatorManifest {
    return buildStoreLocatorManifest({ collectionStatus: "UNSUPPORTED", merchant: this.source, capturedAt: input.capturedAt, stores: [], warnings: [this.reason], unsupportedFields: this.unsupportedFields });
  }
}

export type ExploreWisePlace = Readonly<{ id: string; name: string; address?: string | null; city?: string | null; phone?: string | null; latitude?: number | null; longitude?: number | null }>;
export type AddressStrength = "EXACT" | "STRONG" | "WEAK" | "NONE";
export type CandidateEvidence = Readonly<{
  merchantContext: boolean;
  officialNameNormalized: string;
  placeNameNormalized: string;
  officialAddressNormalized?: string;
  placeAddressNormalized?: string;
  addressStrength: AddressStrength;
  officialLocality?: string;
  placeLocality?: string;
  localityCompatible?: boolean;
  exactPhone: boolean;
  distanceMeters?: number;
}>;
export type LocatorCandidate = Readonly<{ place: ExploreWisePlace; evidence: CandidateEvidence }>;
export type CoordinateCalibration = Readonly<{ enabled: boolean; thresholdMeters?: number; sampleCount: number; buckets: Readonly<{ within10m: number; within25m: number; within50m: number; within100m: number; larger: number }>; reason: string }>;
export type StoreLocatorMatch = Readonly<{ store: OfficialStore; candidates: readonly LocatorCandidate[]; outcome: LocatorOutcome; placeId?: string; reason: string; confidenceBasis: readonly string[] }>;

const WORDS: Readonly<Record<string, string>> = {
  brgy: "barangay", bgy: "barangay", baranggay: "barangay", brg: "barangay",
  st: "street", ave: "avenue", blvd: "boulevard", rd: "road", hwy: "highway", bldg: "building",
  fl: "floor", lvl: "level", gf: "ground floor", lgf: "lower ground floor", ugf: "upper ground floor",
  cor: "corner", cnr: "corner", sto: "santo", sta: "santa", p: "p", lp: "l p",
  legazpi: "legaspi", qc: "quezon city", bgc: "bonifacio global city", moa: "mall of asia",
};
const NCR_LOCALITIES = ["las pinas", "muntinlupa", "mandaluyong", "quezon city", "caloocan", "paranaque", "valenzuela", "marikina", "malabon", "navotas", "makati", "manila", "pasig", "pasay", "taguig", "san juan", "pateros"] as const;
const GENERIC_ADDRESS_WORDS = new Set(["street", "avenue", "road", "boulevard", "highway", "corner", "building", "floor", "level", "unit", "barangay", "city", "metro", "manila", "philippines", "mall", "block", "lot", "the", "and"]);

function plain(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\bl\s*g\s*\/\s*f\b/gu, " lower ground floor ").replace(/\bg\s*\/\s*f\b/gu, " ground floor ").replace(/&/gu, " and ").replace(/([a-z])(\d)/gu, "$1 $2").replace(/(\d)([a-z])/gu, "$1 $2").replace(/[^a-z0-9]+/gu, " ").trim();
}
function words(value: string | null | undefined): readonly string[] {
  return plain(value).split(/\s+/u).filter(Boolean).flatMap((word) => (WORDS[word] ?? word).split(" "));
}
export function normalizePhilippineAddress(value: string | null | undefined): string { return words(value).join(" "); }
export function normalizeStoreName(value: string | null | undefined): string { return words(value).join(" "); }
export function normalizeMetroManilaLocality(value: string | null | undefined): string | undefined {
  // "Metro Manila" is a region, not a municipality; retaining its "manila"
  // token would incorrectly turn "Pasay, Metro Manila" into Manila.
  const normalized = ` ${normalizePhilippineAddress(value).replace(/\bmetro manila\b/gu, " ").replace(/\s+/gu, " ").trim()} `;
  return NCR_LOCALITIES.find((locality) => normalized.includes(` ${locality} `));
}
export function normalizePhilippinePhone(value: string | null | undefined): readonly string[] {
  const normalized = new Set<string>();
  for (const fragment of (value ?? "").split(/[\/,;]/u)) {
    const digits = fragment.replace(/\D/gu, "");
    if (/^09\d{9}$/u.test(digits)) normalized.add(`63${digits.slice(1)}`);
    else if (/^639\d{9}$/u.test(digits)) normalized.add(digits);
    else if (/^02\d{8}$/u.test(digits)) normalized.add(`63${digits.slice(1)}`);
    else if (/^632\d{8}$/u.test(digits)) normalized.add(digits);
    else if (/^[2-8]\d{7}$/u.test(digits)) normalized.add(`632${digits}`);
  }
  return [...normalized].sort();
}
function merchantContext(placeName: string, merchantName: string): boolean {
  const merchant = normalizeStoreName(merchantName).replace(/\bphilippines\b/gu, "").trim();
  const place = normalizeStoreName(placeName);
  return place === merchant || place.startsWith(`${merchant} `);
}
function addressStrength(store: OfficialStore, place: ExploreWisePlace): AddressStrength {
  const source = normalizePhilippineAddress(store.address); const candidate = normalizePhilippineAddress(place.address);
  if (!source || !candidate) return "NONE";
  if (source === candidate) return "EXACT";
  const left = new Set(words(store.address)); const right = new Set(words(place.address));
  const shared = [...left].filter((word) => right.has(word));
  const distinctive = shared.filter((word) => word.length >= 3 && !GENERIC_ADDRESS_WORDS.has(word));
  const leftNumbers = [...left].filter((word) => /^\d+[a-z]?$/u.test(word));
  const rightNumbers = new Set([...right].filter((word) => /^\d+[a-z]?$/u.test(word)));
  const sameNumber = leftNumbers.some((number) => rightNumbers.has(number));
  const sharedMallOrBuilding = distinctive.some((word) => ["megmall", "megamanall", "podium", "rockwell", "aura", "opus", "galleria", "starmall", "mall", "center", "centre", "plaza"].includes(word));
  if ((sameNumber && distinctive.length >= 1) || (distinctive.length >= 3 && sharedMallOrBuilding)) return "STRONG";
  if (distinctive.length >= 2 || (sameNumber && distinctive.length >= 1)) return "WEAK";
  return "NONE";
}
function distanceMeters(store: OfficialStore, place: ExploreWisePlace): number | undefined {
  if (store.latitude === undefined || store.longitude === undefined || place.latitude == null || place.longitude == null) return undefined;
  const radians = Math.PI / 180;
  const dLat = (place.latitude - store.latitude) * radians; const dLon = (place.longitude - store.longitude) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(store.latitude * radians) * Math.cos(place.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
function evidenceFor(source: OfficialLocatorSource, store: OfficialStore, place: ExploreWisePlace): CandidateEvidence {
  const officialLocality = normalizeMetroManilaLocality(store.locality ?? store.address);
  const placeLocality = normalizeMetroManilaLocality(place.city ?? place.address);
  const sourcePhones = new Set(normalizePhilippinePhone(store.phone));
  const exactPhone = sourcePhones.size > 0 && normalizePhilippinePhone(place.phone).some((phone) => sourcePhones.has(phone));
  const distance = distanceMeters(store, place);
  return {
    merchantContext: merchantContext(place.name, source.merchantName), officialNameNormalized: normalizeStoreName(store.officialName), placeNameNormalized: normalizeStoreName(place.name),
    ...(store.address ? { officialAddressNormalized: normalizePhilippineAddress(store.address) } : {}), ...(place.address ? { placeAddressNormalized: normalizePhilippineAddress(place.address) } : {}),
    addressStrength: addressStrength(store, place), ...(officialLocality ? { officialLocality } : {}), ...(placeLocality ? { placeLocality } : {}),
    ...(officialLocality && placeLocality ? { localityCompatible: officialLocality === placeLocality } : {}), exactPhone, ...(distance === undefined ? {} : { distanceMeters: distance }),
  };
}

/** Stage A: broad retrieval. Merchant context qualifies branch-name variants but never confirms one. */
export function generateStoreLocatorCandidates(source: OfficialLocatorSource, store: OfficialStore, places: readonly ExploreWisePlace[]): readonly LocatorCandidate[] {
  return places.flatMap((place) => {
    const evidence = evidenceFor(source, store, place);
    // Merchant context admits qualified official branch names (for example,
    // "Chowking Annapolis Albany" versus "Chowking Annapolis"). Address and
    // coordinates then rank/confirm only inside that context. An exact phone
    // remains a fallback candidate signal, but never confirms by itself.
    return evidence.merchantContext || evidence.exactPhone ? [{ place, evidence }] : [];
  }).sort((left, right) => left.place.id.localeCompare(right.place.id));
}

/** Coordinate thresholds are source-specific and unavailable until independent seeds calibrate them. */
export function calibrateCoordinates(samples: readonly number[]): CoordinateCalibration {
  const buckets = { within10m: samples.filter((sample) => sample <= 10).length, within25m: samples.filter((sample) => sample <= 25).length, within50m: samples.filter((sample) => sample <= 50).length, within100m: samples.filter((sample) => sample <= 100).length, larger: samples.filter((sample) => sample > 100).length };
  if (samples.length < 3) return { enabled: false, sampleCount: samples.length, buckets, reason: "At least three independently confirmed coordinate samples are required." };
  const max = Math.max(...samples);
  const threshold = [10, 25, 50, 100].find((limit) => max <= limit);
  if (threshold === undefined) return { enabled: false, sampleCount: samples.length, buckets, reason: "Confirmed samples exceed the maximum conservative calibration bucket." };
  return { enabled: true, thresholdMeters: threshold, sampleCount: samples.length, buckets, reason: "Smallest source-specific bucket containing all independently confirmed samples." };
}

/** Stage B: two independent signals are required; merchant context is compatibility, never identity on its own. */
export function matchStoreLocator(source: OfficialLocatorSource, store: OfficialStore, places: readonly ExploreWisePlace[], calibration: CoordinateCalibration = calibrateCoordinates([])): StoreLocatorMatch {
  const candidates = generateStoreLocatorCandidates(source, store, places);
  const conflicts = candidates.filter(({ evidence }) => evidence.localityCompatible === false && (evidence.exactPhone || evidence.addressStrength === "EXACT" || evidence.addressStrength === "STRONG" || (calibration.enabled && evidence.distanceMeters !== undefined && evidence.distanceMeters <= calibration.thresholdMeters!)));
  if (conflicts.length > 0) return { store, candidates, outcome: "CONFLICT", reason: "Strong identity evidence conflicts with official and candidate localities.", confidenceBasis: ["conflicting locality"] };
  const confirmed = candidates.filter(({ evidence }) => {
    if (!evidence.merchantContext || evidence.localityCompatible === false) return false;
    const calibratedCoordinate = calibration.enabled && evidence.distanceMeters !== undefined && evidence.distanceMeters <= calibration.thresholdMeters! && evidence.localityCompatible === true;
    return evidence.exactPhone || evidence.addressStrength === "EXACT" || evidence.addressStrength === "STRONG" || calibratedCoordinate;
  });
  if (confirmed.length > 1) return { store, candidates, outcome: "CONFLICT", reason: "Multiple candidates satisfy high-confidence identity rules.", confidenceBasis: ["multiple eligible candidates"] };
  if (confirmed.length === 1) {
    const evidence = confirmed[0]!.evidence;
    const basis = [evidence.merchantContext ? "merchant/locality compatibility" : "", evidence.exactPhone ? "exact normalized official phone" : "", evidence.addressStrength === "EXACT" ? "exact normalized address" : evidence.addressStrength === "STRONG" ? "strong normalized address" : "", calibration.enabled && evidence.distanceMeters !== undefined && evidence.distanceMeters <= calibration.thresholdMeters! ? `calibrated coordinates <= ${calibration.thresholdMeters}m` : ""].filter(Boolean);
    return { store, candidates, outcome: "MATCHED_HIGH_CONFIDENCE", placeId: confirmed[0]!.place.id, reason: "Multiple compatible deterministic signals identify one candidate.", confidenceBasis: basis };
  }
  if (candidates.length > 0) return { store, candidates, outcome: "REVIEW_REQUIRED", reason: "Candidates exist but no unique high-confidence identity confirmation.", confidenceBasis: [] };
  return { store, candidates, outcome: "NO_MATCH", reason: "No deterministic candidate evidence.", confidenceBasis: [] };
}

export type StoreLocatorMatchingArtifact = Readonly<{
  schemaVersion: "explorewise.store-locator-matches.v1";
  generatedAt: string;
  databaseMutations: false;
  manifestHash: string;
  calibration: CoordinateCalibration;
  matches: readonly StoreLocatorMatch[];
  reviewQueue: readonly StoreLocatorMatch[];
}>;
export function buildMatchingArtifact(manifest: StoreLocatorManifest, places: readonly ExploreWisePlace[], generatedAt: string, calibration: CoordinateCalibration = calibrateCoordinates([])): StoreLocatorMatchingArtifact {
  const matches = [...manifest.stores].sort(storeOrder).map((store) => matchStoreLocator(manifest.merchant, store, places, calibration));
  return { schemaVersion: "explorewise.store-locator-matches.v1", generatedAt, databaseMutations: false, manifestHash: manifest.manifestHash, calibration, matches, reviewQueue: matches.filter((match) => match.outcome === "REVIEW_REQUIRED" || match.outcome === "CONFLICT") };
}
