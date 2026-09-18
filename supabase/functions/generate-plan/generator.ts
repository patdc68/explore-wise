import { GENERATION_RESPONSE_VERSION } from '../../../packages/planning/src/policy.ts';
import type { PlannerGenerator } from './types.ts';

/**
 * Phase 3B.2 intentionally has no generator. The deployed function must not
 * claim to have produced a plan before candidate retrieval/composition exists.
 */
export const deferredPlannerGenerator: PlannerGenerator = async ({ requestId }) => ({
  responseVersion: GENERATION_RESPONSE_VERSION,
  requestId,
  outcome: 'error',
  error: {
    code: 'internal_error',
    message: 'Plan generation is not available at this server boundary yet.',
    retryable: false,
  },
});
