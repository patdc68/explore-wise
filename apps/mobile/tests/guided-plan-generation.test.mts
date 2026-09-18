import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import * as contracts from '../../../packages/planning/src/contracts.ts';
import { createPlannerDraft } from '../../../packages/planning/src/draft.ts';
import * as policy from '../../../packages/planning/src/policy.ts';

const placeId = '11111111-1111-4111-8111-111111111111';
const intent = {
  planningIntentVersion: 1,
  occasion: 'date',
  location: { source: 'selected_area', label: 'Test area', coordinates: { latitude: 14.55, longitude: 121.05 }, context: { locality: null, city: null, region: null, countryCode: 'PH' }, geography: { kind: 'radius', radiusMeters: 5_000 } },
  party: { size: 2, children: null },
  budget: { amountMinor: 100_000, currencyCode: 'PHP', basis: 'total', strictness: 'strict', unknownPricePolicy: 'allow_with_disclosure' },
  schedule: { kind: 'duration', durationMinutes: 150, outingDate: null, startTime: null, timeZone: null },
  moods: { state: 'selected', values: ['romantic'] }, food: { state: 'selected', values: ['cafe'] }, activities: { state: 'selected', values: ['art_museum'] }, mobility: { state: 'selected', value: 'keep_close' },
  anchors: [], constraints: { excludedPlaceIds: [], excludedCategoryCodes: [], categoryScope: { kind: 'any' } },
} as const;

const place = {
  place_id: placeId, name: 'Grounded Cafe', category_code: 'food.cafe', category_name: 'Cafe', latitude: 14.55, longitude: 121.05,
  has_price: true, estimated_group_min_minor: 20_000, estimated_group_max_minor: 30_000, currency_code: 'PHP',
};

function proposal() {
  return {
    intent,
    state: { start: { latitude: 14.55, longitude: 121.05, label: 'Test area' }, budgetMinor: 100_000, partySize: 2, currencyCode: 'PHP', stages: [{ id: 'cafe-1', title: 'Coffee', categoryCodes: ['food.cafe'], required: true, source: 'wise' }], stops: [{ stageId: 'cafe-1', place }] },
    missingStageIds: [], historyKey: `cafe-1:${placeId}`, budgetSummary: { currencyCode: 'PHP', basis: 'total', strictness: 'strict', budgetMinor: 100_000, normalizedTotalMinor: 100_000, partySize: 2, knownMinMinor: 20_000, knownMaxMinor: 30_000, knownStopCount: 1, unknownStopCount: 0, currencyMismatchStopCount: 0, affordability: 'verified' },
    anchorInclusions: [], appliedPreferences: [], unappliedPreferences: [], warnings: [{ code: 'budget_unverified', message: 'Some price evidence is unverified.' }],
  };
}

function response(outcome: 'proposal' | 'partial_plan' | 'clarification_needed' | 'no_plan' | 'error'): any {
  if (outcome === 'proposal' || outcome === 'partial_plan') return { responseVersion: 1, requestId: `request-${outcome}`, outcome, anchorReviews: [{ placeId, intent: 'preferred', status: 'valid', checkedRevision: 7 }], proposal: proposal() };
  if (outcome === 'clarification_needed' || outcome === 'no_plan') return { responseVersion: 1, requestId: `request-${outcome}`, outcome, anchorReviews: [], issues: [{ code: outcome === 'no_plan' ? 'no_candidates' : 'strict_budget_impossible', message: 'Safe user-facing issue.' }] };
  return { responseVersion: 1, requestId: 'request-error', outcome, error: { code: 'database_error', message: 'Retry later.', retryable: true } };
}

function loadService(client: any = { functions: { invoke: async () => ({ data: null, error: null }) } }) {
  const code = ts.transpileModule(readFileSync(new URL('../src/services/guided-plan-generation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  new Function('exports', 'require', '__DEV__', code)(exports, (name: string) => {
    if (name === '@/lib/supabase') return { getSupabaseClient: () => client };
    if (name === '../../../../packages/planning/src/contracts.ts') return contracts;
    if (name === '../../../../packages/planning/src/intent.ts') return requireIntent;
    if (name === '../../../../packages/planning/src/draft.ts') return requireDraft;
    if (name === '../../../../packages/planning/src/policy.ts') return policy;
    if (name === '../../../../packages/planning/src/validation.ts') return {};
    throw new Error(`Unexpected generation dependency: ${name}`);
  }, true);
  return exports;
}

// The service's runtime imports are mapped to the already-loaded planning modules.
import * as requireIntent from '../../../packages/planning/src/intent.ts';
import * as requireDraft from '../../../packages/planning/src/draft.ts';

const request = () => ({ requestVersion: 1, intent, draftRevision: 7, attempt: { ordinal: 0, excludedCombinations: [] } });

test('builds a canonical GeneratePlanRequestV1 and never serializes PlannerDraft state', () => {
  const service = loadService();
  const draft = { ...createPlannerDraft(), revision: 7, answers: intent } as any;
  const result = service.buildGeneratePlanRequest(draft, 7, request().attempt);
  assert.equal(result.success, true);
  assert.equal(contracts.validateGeneratePlanRequest(result.data).success, true);
  const serialized = JSON.stringify(result.data);
  assert.doesNotMatch(serialized, /plannerDraftVersion|currentQuestion|anchorReviews/);
  assert.equal(result.data.requestVersion, 1);
  assert.equal(result.data.draftRevision, 7);
  assert.equal(service.buildGeneratePlanRequest(draft, 6).success, false);
});

test('parses and adapts proposal and partial responses without losing currency, warnings, or anchors', async () => {
  const calls: any[] = [];
  const service = loadService();
  const generation = service.createGuidedPlanGenerationService({ invoke: async (name: string, options: any) => { calls.push({ name, options }); return { data: response('proposal'), error: null }; } });
  const result = await generation.generate(request());
  assert.equal(result.kind, 'response');
  const adapted = service.adaptGuidedPlanProposal(result.response, request());
  assert.equal(adapted.source, 'guided');
  assert.equal(adapted.state.currencyCode, 'PHP');
  assert.equal(adapted.state.stops[0].place.place_id, placeId);
  assert.equal(adapted.warnings[0].code, 'budget_unverified');
  assert.equal(adapted.anchorReviews[0].checkedRevision, 7);
  assert.equal(calls[0].name, 'generate-plan');
  const partial = loadService().createGuidedPlanGenerationService({ invoke: async () => ({ data: response('partial_plan'), error: null }) });
  const partialResult = await partial.generate(request());
  assert.equal(partialResult.kind, 'response');
  assert.equal(partialResult.response.outcome, 'partial_plan');
});

test('keeps semantic clarification, no-plan, and typed error outcomes separate from transport errors', async () => {
  for (const outcome of ['clarification_needed', 'no_plan', 'error'] as const) {
    const service = loadService().createGuidedPlanGenerationService({ invoke: async () => ({ data: response(outcome), error: null }) });
    const result = await service.generate(request());
    assert.equal(result.kind, 'response');
    assert.equal(result.response.outcome, outcome);
  }
  const network = loadService().createGuidedPlanGenerationService({ invoke: async () => { throw new Error('offline'); } });
  const networkResult = await network.generate(request());
  assert.deepEqual(networkResult, { kind: 'transport_error', error: { kind: 'network', retryable: true } });
  const malformed = loadService().createGuidedPlanGenerationService({ invoke: async () => ({ data: { unexpected: true }, error: null }) });
  const malformedResult = await malformed.generate(request());
  assert.deepEqual(malformedResult, { kind: 'transport_error', error: { kind: 'malformed_response', retryable: true } });
});

test('supports abort and structured HTTP failures without exposing server internals', async () => {
  let invoked = false;
  const client = { functions: { invoke: async (_name: string, _options: any) => { invoked = true; return { data: null, error: { context: { status: 503 } } }; } } };
  const service = loadService(client);
  const controller = new AbortController(); controller.abort();
  const aborted = await service.guidedPlanGeneration.generate(request(), controller.signal);
  assert.deepEqual(aborted, { kind: 'transport_error', error: { kind: 'aborted', retryable: false } });
  assert.equal(invoked, false);
  const result = await service.guidedPlanGeneration.generate(request());
  assert.deepEqual(result, { kind: 'transport_error', error: { kind: 'http', retryable: true } });
  const captured: any[] = [];
  const defaultClient = { functions: { invoke: async (name: string, options: any) => { captured.push({ name, options }); return { data: response('no_plan'), error: null }; } } };
  const defaultService = loadService(defaultClient);
  const defaultResult = await defaultService.guidedPlanGeneration.generate(request());
  assert.equal(defaultResult.kind, 'response');
  assert.equal(captured[0].name, 'generate-plan');
  assert.equal('headers' in captured[0].options, false);
  assert.deepEqual(captured[0].options.body, request());
});
