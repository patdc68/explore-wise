import { getSupabaseClient } from '@/lib/supabase';
import type { PricedNearbyPlace } from '@/services/places';
import type { ItineraryStage, ItineraryState } from '@/services/itinerary';
import {
  validateGeneratePlanResponse,
  type AnchorReview,
  type GeneratePlanRequestV1,
  type GeneratePlanResponseV1,
  type PlanProposalV1,
} from '../../../../packages/planning/src/contracts.ts';
import { validatePlanningIntent, type PlanningIntent } from '../../../../packages/planning/src/intent.ts';
import { GENERATION_REQUEST_VERSION } from '../../../../packages/planning/src/policy.ts';
import { validatePlannerDraft, type PlannerDraft } from '../../../../packages/planning/src/draft.ts';
import type { Result } from '../../../../packages/planning/src/validation.ts';

export type GuidedPlanInvocation = (functionName: string, options: Readonly<{
  body: GeneratePlanRequestV1;
  signal?: AbortSignal;
  timeout?: number;
}>) => Promise<Readonly<{ data: unknown; error: unknown | null; response?: Response }>>;

export type GuidedPlanTransportError = Readonly<{
  kind: 'aborted' | 'network' | 'http' | 'malformed_response';
  retryable: boolean;
}>;

export type GuidedPlanGenerationResult =
  | Readonly<{ kind: 'response'; response: GeneratePlanResponseV1 }>
  | Readonly<{ kind: 'transport_error'; error: GuidedPlanTransportError }>;

/** The mobile presentation model keeps the canonical request beside the server proposal. */
export type GuidedPlanProposal = Omit<PlanProposalV1, 'state'> & Readonly<{
  source: 'guided';
  outcome: 'proposal' | 'partial_plan';
  state: ItineraryState;
  request: GeneratePlanRequestV1;
  anchorReviews: readonly AnchorReview[];
}>;

export type GuidedPlanGenerationService = Readonly<{
  generate: (request: GeneratePlanRequestV1, signal?: AbortSignal) => Promise<GuidedPlanGenerationResult>;
}>;

const safeRequestIssue = (path: string, message: string): Result<never> => ({
  success: false,
  issues: [{ path, message }],
});

/**
 * Build the only payload the mobile client may send. Anchor compatibility is
 * intentionally finalized after the server returns authoritative reviews.
 */
export function buildGeneratePlanRequest(
  draft: PlannerDraft,
  draftRevision = draft.revision,
  attempt?: GeneratePlanRequestV1['attempt'],
): Result<GeneratePlanRequestV1> {
  const parsedDraft = validatePlannerDraft(draft);
  if (!parsedDraft.success) return parsedDraft;
  if (!Number.isSafeInteger(draftRevision) || draftRevision < 0 || draftRevision !== draft.revision) return safeRequestIssue('$.draftRevision', 'Draft revision must match the current draft.');
  const intent = validatePlanningIntent(parsedDraft.data.answers);
  if (!intent.success) return intent;
  return {
    success: true,
    data: {
      requestVersion: GENERATION_REQUEST_VERSION,
      intent: intent.data,
      draftRevision,
      ...(attempt ? { attempt } : {}),
    },
  };
}

function isAbortError(value: unknown): boolean {
  return isRecord(value) && (value.name === 'AbortError' || value.code === 'ABORT_ERR');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function statusOf(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const context = value.context;
  if (isRecord(context) && typeof context.status === 'number') return context.status;
  if (isRecord(value.response) && typeof value.response.status === 'number') return value.response.status;
  return null;
}

async function errorResponseBody(value: unknown): Promise<unknown | null> {
  if (!isRecord(value) || !isRecord(value.context)) return null;
  const context = value.context;
  if (typeof context.json !== 'function') return null;
  try {
    return await (context.json as () => Promise<unknown>)();
  } catch {
    return null;
  }
}

function mapTransportError(value: unknown, signal?: AbortSignal): GuidedPlanTransportError {
  if (signal?.aborted || isAbortError(value)) return { kind: 'aborted', retryable: false };
  const status = statusOf(value);
  if (status !== null) return { kind: 'http', retryable: status === 408 || status === 429 || status >= 500 };
  return { kind: 'network', retryable: true };
}

function defaultInvoke(functionName: string, options: Readonly<{ body: GeneratePlanRequestV1; signal?: AbortSignal; timeout?: number }>) {
  return getSupabaseClient().functions.invoke<unknown>(functionName, {
    body: options.body,
    signal: options.signal,
    timeout: options.timeout,
  });
}

export function createGuidedPlanGenerationService(options: Readonly<{
  invoke?: GuidedPlanInvocation;
  timeoutMs?: number;
}> = {}): GuidedPlanGenerationService {
  const invoke = options.invoke ?? defaultInvoke;
  return {
    async generate(request, signal) {
      if (signal?.aborted) return { kind: 'transport_error', error: { kind: 'aborted', retryable: false } };
      try {
        const result = await invoke('generate-plan', { body: request, signal, timeout: options.timeoutMs ?? 30_000 });
        const parsed = validateGeneratePlanResponse(result.data);
        if (parsed.success) return { kind: 'response', response: parsed.data };
        const body = await errorResponseBody(result.error);
        if (body !== null) {
          const errorResponse = validateGeneratePlanResponse(body);
          if (errorResponse.success) return { kind: 'response', response: errorResponse.data };
        }
        if (result.error) return { kind: 'transport_error', error: mapTransportError(result.error, signal) };
        return { kind: 'transport_error', error: { kind: 'malformed_response', retryable: true } };
      } catch (error) {
        return { kind: 'transport_error', error: mapTransportError(error, signal) };
      }
    },
  };
}

export const guidedPlanGeneration = createGuidedPlanGenerationService();

/** Adapt the validated server proposal to the existing Plan/Itinerary model. */
export function adaptGuidedPlanProposal(
  response: Extract<GeneratePlanResponseV1, { outcome: 'proposal' | 'partial_plan' }>,
  request: GeneratePlanRequestV1,
): GuidedPlanProposal {
  const state: ItineraryState = {
    ...response.proposal.state,
    currencyCode: response.proposal.state.currencyCode ?? response.proposal.intent.budget.currencyCode,
    stages: response.proposal.state.stages.map((stage): ItineraryStage => ({
      ...stage,
      categoryCodes: [...stage.categoryCodes],
      selectionConstraint: stage.selectionConstraint as ItineraryStage['selectionConstraint'],
    })),
    stops: response.proposal.state.stops.map((stop) => ({
      ...stop,
      place: stop.place as PricedNearbyPlace,
    })),
  };
  return {
    ...response.proposal,
    source: 'guided',
    outcome: response.outcome,
    state,
    request,
    anchorReviews: response.anchorReviews,
  };
}

export function planningIntentForGuidedProposal(proposal: GuidedPlanProposal): PlanningIntent {
  return proposal.intent;
}
