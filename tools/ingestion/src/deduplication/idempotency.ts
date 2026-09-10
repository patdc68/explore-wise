import type { IdempotencyDecision, PlaceSnapshot } from "../types/index.js";

const COMPARABLE_FIELDS = [
  "sourceCode",
  "sourcePlaceId",
  "name",
  "categoryCode",
  "countryCode",
  "region",
  "city",
  "district",
  "address",
  "latitude",
  "longitude",
  "timezone",
  "currencyCode",
  "websiteUrl",
  "phoneNumber",
] as const satisfies readonly (keyof PlaceSnapshot)[];

export function decideIdempotency(
  existing: PlaceSnapshot | undefined,
  incoming: PlaceSnapshot,
): IdempotencyDecision {
  if (existing === undefined) {
    return { action: "inserted", reason: "new_source_identity" };
  }

  if (existing.sourceUpdatedAt && incoming.sourceUpdatedAt) {
    const existingTime = Date.parse(existing.sourceUpdatedAt);
    const incomingTime = Date.parse(incoming.sourceUpdatedAt);
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) {
      return { action: "unchanged", reason: "stale_source_record" };
    }
  }

  const changed = COMPARABLE_FIELDS.some((field) => existing[field] !== incoming[field]);
  return changed
    ? { action: "updated", reason: "source_backed_fields_changed" }
    : { action: "unchanged", reason: "identical" };
}

