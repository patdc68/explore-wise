import { composeDeterministicPlan, type CompositionAnchor } from '../../../packages/planning/src/composition.ts';
import { createCandidateRetrievalService, type CandidateRetrievalRepository } from '../../../packages/planning/src/retrieval.ts';
import { MAX_DATABASE_CALLS } from '../../../packages/planning/src/policy.ts';
import { GENERATION_RESPONSE_VERSION } from '../../../packages/planning/src/policy.ts';
import type { PlannerGenerator } from './types.ts';

/**
 * The generator is intentionally a small adapter: all selection policy lives
 * in the dependency-free planning package and all I/O remains injected.
 */
export function createDeterministicPlannerGenerator(repository: CandidateRetrievalRepository): PlannerGenerator {
  return async ({ request, requestId, anchors, anchorReviews, databaseBudget }) => {
    if (databaseBudget.remainingCalls <= 0) {
      return {
        responseVersion: GENERATION_RESPONSE_VERSION,
        requestId,
        outcome: 'error',
        error: { code: 'internal_error', message: 'The planner is temporarily unavailable. Please try again.', retryable: false },
      };
    }
    const retrieval = createCandidateRetrievalService(repository, {
      maxDatabaseCalls: Math.min(MAX_DATABASE_CALLS, databaseBudget.remainingCalls),
      onDatabaseCall: databaseBudget.tryConsume,
      // Composition asks for one viable candidate per stage. The broad query
      // still returns its bounded pool, while evidence slices are only added
      // when the broad result lacks the requested evidence.
      evidenceTargets: { budget: 1, preference: 1 },
    });
    const compositionAnchors: CompositionAnchor[] = anchors.map((record) => {
      const requested = request.intent.anchors.find((anchor) => anchor.placeId.toLowerCase() === record.placeId.toLowerCase());
      return {
        placeId: record.placeId,
        intent: requested?.intent ?? 'preferred',
        status: record.status,
        categoryCode: record.categoryCode,
        categoryName: record.categoryName,
        categoryActive: record.categoryActive,
        place: record.place,
      };
    });
    return composeDeterministicPlan({ request, requestId, anchors: compositionAnchors, anchorReviews, retrieval });
  };
}
