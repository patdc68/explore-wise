import { readFile } from "node:fs/promises";
import {
  CONFIDENCE_LEVELS,
  PRICE_PRECISIONS,
  PRICING_SOURCES,
  PRICING_UNITS,
  type ConfidenceLevel,
  type PricePrecision,
  type PricingSource,
  type PricingUnit,
} from "../../../../packages/database/src/pricing.js";

export type PilotTarget = Readonly<{ placeId?: string; chainCode?: string }>;
export const PRICE_APPLICABILITY_SCOPES = [
  "PLACE_LEVEL_PRICE",
  "NAMED_TICKET_OR_PASS",
  "PROMOTIONAL_BUNDLE",
  "PACKAGE",
  "MULTI_VENUE_PRODUCT",
  "SPECIFIC_EXPERIENCE_OR_VARIANT",
] as const;
export type PriceApplicabilityScope = (typeof PRICE_APPLICABILITY_SCOPES)[number];

export type PilotPrice = Readonly<{
  recordId: string;
  target: PilotTarget;
  currencyCode: string;
  minAmountMinor: number;
  maxAmountMinor: number;
  pricingStatus: "free" | "paid";
  pricingUnit: PricingUnit;
  pricingSource: PricingSource;
  pricePrecision: PricePrecision;
  confidenceLevel: ConfidenceLevel;
  sourceUrl: string;
  sourceType: string;
  sourceTitle?: string;
  sourceReferenceId?: string;
  retrievedAt: string;
  validFrom?: string;
  validUntil?: string;
  applicabilityScope: PriceApplicabilityScope;
  applicabilityNotes: string;
  evidenceNotes: string;
}>;

/**
 * Retains verified facts that cannot safely be represented by Phase 1's
 * place-level price table. These records are research evidence, never imports.
 */
export type PilotUnresolvedPriceEvidence = Readonly<{
  placeId: string;
  reasonCode: "PRODUCT_VARIANT_NOT_REPRESENTABLE";
  applicabilityScope: Exclude<PriceApplicabilityScope, "PLACE_LEVEL_PRICE">;
  productName: string;
  currencyCode: string;
  minAmountMinor: number;
  maxAmountMinor: number;
  pricingStatus: "free" | "paid";
  pricingUnit: PricingUnit;
  pricingSource: PricingSource;
  pricePrecision: PricePrecision;
  confidenceLevel: ConfidenceLevel;
  sourceUrl: string;
  sourceType: string;
  sourceTitle?: string;
  sourceReferenceId?: string;
  retrievedAt: string;
  validFrom?: string;
  validUntil?: string;
  applicabilityNotes: string;
  evidenceNotes: string;
}>;

export type PilotCandidate = Readonly<{
  placeId: string;
  outcome: "verified" | "unresolved";
  reason: string;
  unresolvedPriceEvidence?: PilotUnresolvedPriceEvidence;
  [key: string]: unknown;
}>;

export type PilotChain = Readonly<{ code: string; name: string; countryCode?: string }>;
export type PilotMembership = Readonly<{
  placeId: string;
  chainCode: string;
  linkSource: "official_website" | "merchant" | "licensed_provider" | "manual_review";
  sourceUrl: string;
  verifiedAt: string;
  pricingProfileApplicable: boolean;
  evidenceNotes: string;
}>;

export type PilotArtifact = Readonly<{
  schemaVersion: "explorewise.price-pilot.v1";
  reviewStatus: "pending_human_review" | "approved";
  generatedAt: string;
  supportedCurrencies: readonly string[];
  candidates: readonly PilotCandidate[];
  prices: readonly PilotPrice[];
  chains: readonly PilotChain[];
  memberships: readonly PilotMembership[];
}>;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const asSet = <T extends string>(values: readonly T[]) => new Set<string>(values);
const SOURCES = asSet(PRICING_SOURCES);
const UNITS = asSet(PRICING_UNITS);
const PRECISIONS = asSet(PRICE_PRECISIONS);
const CONFIDENCES = asSet(CONFIDENCE_LEVELS);
const APPLICABILITY_SCOPES = asSet(PRICE_APPLICABILITY_SCOPES);
const SOURCE_TYPES = new Set([
  "official_menu",
  "official_website",
  "official_ordering_page",
  "merchant_controlled_social_or_business_page",
  "licensed_provider",
]);

export class PilotArtifactValidationError extends Error {
  constructor(readonly issues: readonly string[]) { super(`Pilot artifact validation failed:\n- ${issues.join("\n- ")}`); }
}

function targetKey(target: PilotTarget): string {
  return target.placeId ? `place:${target.placeId}` : `chain:${target.chainCode ?? ""}`;
}

function validateEvidence(
  evidence: PilotPrice | PilotUnresolvedPriceEvidence,
  supported: ReadonlySet<string>,
  prefix: string,
  issues: string[],
): void {
  if (!CURRENCY.test(evidence.currencyCode) || !supported.has(evidence.currencyCode)) issues.push(`${prefix}: unsupported currency`);
  if (!Number.isSafeInteger(evidence.minAmountMinor) || !Number.isSafeInteger(evidence.maxAmountMinor) || evidence.minAmountMinor < 0 || evidence.maxAmountMinor < 0) issues.push(`${prefix}: amounts must be non-negative minor-unit integers`);
  if (evidence.minAmountMinor > evidence.maxAmountMinor) issues.push(`${prefix}: min exceeds max`);
  if (!UNITS.has(evidence.pricingUnit) || !SOURCES.has(evidence.pricingSource) || !PRECISIONS.has(evidence.pricePrecision) || !CONFIDENCES.has(evidence.confidenceLevel)) issues.push(`${prefix}: unsupported pricing enum`);
  if (!evidence.sourceUrl?.trim() || !SOURCE_TYPES.has(evidence.sourceType)) issues.push(`${prefix}: provenance is missing or source type is unknown`);
  if (!ISO_TIMESTAMP.test(evidence.retrievedAt)) issues.push(`${prefix}: verification timestamp is required`);
  if (evidence.validFrom && !ISO_TIMESTAMP.test(evidence.validFrom)) issues.push(`${prefix}: validFrom must be a UTC ISO timestamp`);
  if (evidence.validUntil && !ISO_TIMESTAMP.test(evidence.validUntil)) issues.push(`${prefix}: validUntil must be a UTC ISO timestamp`);
  if (evidence.validFrom && evidence.validUntil && Date.parse(evidence.validFrom) > Date.parse(evidence.validUntil)) issues.push(`${prefix}: validFrom exceeds validUntil`);
  if (evidence.pricingStatus === "free" && (evidence.pricingUnit !== "free" || evidence.minAmountMinor !== 0 || evidence.maxAmountMinor !== 0)) issues.push(`${prefix}: verified free must be zero with unit free`);
  if (evidence.pricingStatus === "paid" && (evidence.pricingUnit === "free" || evidence.minAmountMinor <= 0)) issues.push(`${prefix}: paid price requires a positive non-free amount`);
  if (evidence.confidenceLevel === "VERIFIED" && (evidence.pricePrecision !== "exact" || !["official_menu", "official_website", "merchant", "licensed_provider"].includes(evidence.pricingSource))) issues.push(`${prefix}: VERIFIED requires exact official or licensed evidence`);
}

export function validatePilotArtifact(artifact: PilotArtifact, options: Readonly<{ requireApproved: boolean }> = { requireApproved: false }): void {
  const issues: string[] = [];
  if (artifact.schemaVersion !== "explorewise.price-pilot.v1") issues.push("schemaVersion is unsupported");
  if (options.requireApproved && artifact.reviewStatus !== "approved") issues.push("artifact is not explicitly approved");
  if (!ISO_TIMESTAMP.test(artifact.generatedAt)) issues.push("generatedAt must be a UTC ISO timestamp");
  const supported = new Set(artifact.supportedCurrencies);
  const chainCodes = new Set(artifact.chains.map((chain) => chain.code));
  const membershipByPlace = new Map(artifact.memberships.map((membership) => [membership.placeId, membership]));
  const seen = new Set<string>();
  const candidates = new Map<string, PilotCandidate>();
  for (const candidate of artifact.candidates) {
    if (!candidate.placeId?.trim()) issues.push("candidate: placeId is required");
    if (candidates.has(candidate.placeId)) issues.push(`candidate ${candidate.placeId}: duplicate placeId`);
    candidates.set(candidate.placeId, candidate);
    const evidence = candidate.unresolvedPriceEvidence;
    if (!evidence) continue;
    const prefix = `unresolved evidence ${candidate.placeId}`;
    if (candidate.outcome !== "unresolved") issues.push(`${prefix}: factual product evidence must remain unresolved`);
    if (evidence.placeId !== candidate.placeId) issues.push(`${prefix}: placeId must match its candidate`);
    if (evidence.reasonCode !== "PRODUCT_VARIANT_NOT_REPRESENTABLE") issues.push(`${prefix}: reason code must prohibit unsupported product imports`);
    if (!APPLICABILITY_SCOPES.has(evidence.applicabilityScope)) issues.push(`${prefix}: non-place-level applicability scope is required`);
    if (!evidence.productName.trim() || !evidence.applicabilityNotes.trim() || !evidence.evidenceNotes.trim()) issues.push(`${prefix}: product name and evidence notes are required`);
    validateEvidence(evidence, supported, prefix, issues);
  }

  for (const price of artifact.prices) {
    const prefix = `price ${price.recordId}`;
    const hasPlace = Boolean(price.target.placeId);
    const hasChain = Boolean(price.target.chainCode);
    if (hasPlace === hasChain) issues.push(`${prefix}: exactly one place or chain target is required`);
    validateEvidence(price, supported, prefix, issues);
    if (price.applicabilityScope !== "PLACE_LEVEL_PRICE") issues.push(`${prefix}: only PLACE_LEVEL_PRICE is importable in Phase 1`);
    if (price.target.placeId && candidates.get(price.target.placeId)?.outcome !== "verified") issues.push(`${prefix}: importable price must target a verified candidate`);
    if (hasChain) {
      if (!chainCodes.has(price.target.chainCode!)) issues.push(`${prefix}: unknown chain target`);
      const applicable = artifact.memberships.some((membership) => membership.chainCode === price.target.chainCode && membership.pricingProfileApplicable);
      if (!applicable) issues.push(`${prefix}: chain price has no explicitly applicable membership`);
    }
    // The Phase 1 schema has no product/format dimension. More than one price
    // for the same target/currency/unit would be impossible to resolve safely.
    const duplicateKey = [targetKey(price.target), price.currencyCode, price.pricingUnit].join("|");
    if (seen.has(duplicateKey)) issues.push(`${prefix}: duplicate incompatible pricing record`);
    seen.add(duplicateKey);
  }

  for (const membership of artifact.memberships) {
    const prefix = `membership ${membership.placeId}`;
    if (!chainCodes.has(membership.chainCode)) issues.push(`${prefix}: unknown chain`);
    if (!membership.sourceUrl?.trim() || !ISO_TIMESTAMP.test(membership.verifiedAt)) issues.push(`${prefix}: provenance and verification timestamp are required`);
    if (!membership.evidenceNotes.trim()) issues.push(`${prefix}: evidence notes are required`);
  }
  if (new Set(artifact.memberships.map((membership) => membership.placeId)).size !== artifact.memberships.length) issues.push("duplicate chain memberships for a place");
  if (membershipByPlace.size !== artifact.memberships.length) issues.push("duplicate chain memberships for a place");
  if (issues.length) throw new PilotArtifactValidationError(issues);
}

/** The Phase 1 importer has only place-level fields, so this is intentionally narrow. */
export function getImportablePilotPrices(artifact: PilotArtifact): readonly PilotPrice[] {
  return artifact.prices.filter((price) => price.applicabilityScope === "PLACE_LEVEL_PRICE");
}

export async function readPilotArtifact(path: string): Promise<PilotArtifact> {
  return JSON.parse(await readFile(path, "utf8")) as PilotArtifact;
}
