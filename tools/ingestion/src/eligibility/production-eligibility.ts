import type { NormalizedStagingPlace } from "../types/index.js";

export type ProductionEligibilityStatus = "eligible" | "review" | "excluded";

export type ProductionEligibilityReason =
  | "source_marked_closed"
  | "source_flagged_closed"
  | "source_flagged_privatevenue"
  | "source_flagged_duplicate"
  | "source_has_unresolved_quality_flag";

export interface ProductionEligibility {
  status: ProductionEligibilityStatus;
  reasons: readonly ProductionEligibilityReason[];
}

function normalizedFlags(flags: readonly string[]): readonly string[] {
  return [...new Set(flags
    .map((flag) => flag.trim().toLocaleLowerCase("und"))
    .filter((flag) => flag.length > 0))].sort();
}

/**
 * Source-quality policy only. It deliberately does not mirror staging validation:
 * a row may remain in staging for provenance and review even when it is excluded
 * from future public discovery.
 */
export function evaluateProductionEligibility(input: Pick<
  NormalizedStagingPlace,
  "sourceClosedAt" | "sourceQualityFlags"
>): ProductionEligibility {
  const flags = normalizedFlags(input.sourceQualityFlags);
  const reasons: ProductionEligibilityReason[] = [];

  if (input.sourceClosedAt !== null) reasons.push("source_marked_closed");
  if (flags.includes("closed")) reasons.push("source_flagged_closed");
  if (flags.includes("privatevenue")) reasons.push("source_flagged_privatevenue");
  if (flags.includes("duplicate")) reasons.push("source_flagged_duplicate");

  if (input.sourceClosedAt !== null || flags.includes("closed") || flags.includes("privatevenue")) {
    return { status: "excluded", reasons };
  }
  if (flags.includes("duplicate")) return { status: "review", reasons };
  if (flags.length > 0) {
    return { status: "review", reasons: ["source_has_unresolved_quality_flag"] };
  }
  return { status: "eligible", reasons: [] };
}

/**
 * Promotion has stricter prerequisites than source-quality eligibility. This is
 * intentionally separate so validation status is never overwritten by policy.
 */
export function isEligibleForProductionPromotion(record: NormalizedStagingPlace): boolean {
  return record.validationStatus === "valid"
    && record.categoryMapping?.status === "mapped"
    && evaluateProductionEligibility(record).status === "eligible";
}
