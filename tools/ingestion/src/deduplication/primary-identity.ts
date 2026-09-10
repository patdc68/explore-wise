import { createPrimarySourceIdentity } from "../normalization/identity.js";

export function hasSamePrimaryIdentity(
  left: { sourceCode: string; sourcePlaceId: string },
  right: { sourceCode: string; sourcePlaceId: string },
): boolean {
  return createPrimarySourceIdentity(left.sourceCode, left.sourcePlaceId)
    === createPrimarySourceIdentity(right.sourceCode, right.sourcePlaceId);
}

