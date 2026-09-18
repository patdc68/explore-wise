import {
  GENERATION_REQUEST_VERSION,
  GENERATION_RESPONSE_VERSION,
  MAX_CATEGORY_CODES_PER_QUERY,
  MAX_REQUEST_BODY_BYTES,
} from '../../../packages/planning/src/policy.ts';
import {
  validateGeneratePlanRequest,
  validateGeneratePlanResponse,
  type AnchorReview,
  type GeneratePlanRequestV1,
  type GeneratePlanResponseV1,
  type PlannerIssue,
  type PlannerIssueCode,
} from '../../../packages/planning/src/contracts.ts';
import type { PlanningIntent } from '../../../packages/planning/src/intent.ts';
import type {
  AnchorCatalogRecord,
  PlannerAuthenticator,
  PlannerGenerationInput,
  PlannerGenerator,
  PlannerLogEvent,
  PlannerLogger,
  PlannerRateLimiter,
  PlanningBoundaryRepository,
} from './types.ts';
import { deferredPlannerGenerator } from './generator.ts';

export const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-forwarded-for, cf-connecting-ip',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const safeMessage = {
  invalidRequest: 'The planning request is invalid.',
  unsupportedVersion: 'This planning request version is not supported.',
  unsupportedGeography: 'Choose a radius-based location before generating a plan.',
  anchorIncompatible: 'Review the highlighted place before generating a plan.',
  databaseError: 'The planner is temporarily unavailable. Please try again.',
  internalError: 'The planner is temporarily unavailable. Please try again.',
  rateLimited: 'Too many planning requests. Please try again shortly.',
  unauthorized: 'This planning request is not authorized.',
  unsupportedMedia: 'Planning requests must use application/json.',
  bodyTooLarge: 'The planning request is too large.',
} as const;

type BoundaryOptions = Readonly<{
  repository: PlanningBoundaryRepository;
  generator?: PlannerGenerator;
  authorize: PlannerAuthenticator;
  rateLimiter?: PlannerRateLimiter;
  logger?: PlannerLogger;
  requestId?: () => string;
  now?: () => number;
}>;

type BoundaryIssue = Readonly<{ code: PlannerIssueCode; message: string; path?: string }>;

function defaultRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto);
  return `gp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function json(body: GeneratePlanResponseV1, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function emptyOptions(status = 204): Response {
  return new Response(null, { status, headers: CORS_HEADERS });
}

function isJsonContentType(request: Request): boolean {
  const value = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  return value === 'application/json';
}

class BoundaryHttpError extends Error {
  readonly kind: 'content_type' | 'body_too_large' | 'invalid_json';
  constructor(kind: 'content_type' | 'body_too_large' | 'invalid_json') {
    super(kind);
    this.kind = kind;
  }
}

async function readBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > maxBytes) throw new BoundaryHttpError('body_too_large');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new BoundaryHttpError('invalid_json');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BoundaryHttpError('body_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BoundaryHttpError('invalid_json');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BoundaryHttpError('invalid_json');
  }
}

function errorBody(requestId: string, code: PlannerIssueCode, message: string, retryable: boolean): GeneratePlanResponseV1 {
  return {
    responseVersion: GENERATION_RESPONSE_VERSION,
    requestId,
    outcome: 'error',
    error: { code, message, retryable },
  };
}

function clarificationBody(requestId: string, issues: readonly PlannerIssue[], anchorReviews: readonly AnchorReview[]): GeneratePlanResponseV1 {
  return { responseVersion: GENERATION_RESPONSE_VERSION, requestId, outcome: 'clarification_needed', issues, anchorReviews };
}

function issue(code: PlannerIssueCode, message: string, path?: string): BoundaryIssue {
  return { code, message, path };
}

function issueFromValidation(value: unknown, resultIssues: readonly Readonly<{ path: string; message: string }>[]): BoundaryIssue {
  const first = resultIssues[0];
  const path = first?.path;
  const message = first?.message ?? safeMessage.invalidRequest;
  if (isRecord(value) && value.requestVersion !== GENERATION_REQUEST_VERSION && Object.hasOwn(value, 'requestVersion')) {
    return issue('unsupported_version', safeMessage.unsupportedVersion, '$.requestVersion');
  }
  if (path?.endsWith('.anchors') && /duplicate/i.test(message)) return issue('anchor_duplicate', safeMessage.anchorIncompatible, path);
  if (path?.endsWith('.anchors') && /explicit exclusion/i.test(message)) return issue('anchor_excluded', safeMessage.anchorIncompatible, path);
  if (path?.includes('.schedule')) return issue('unsupported_time_window', message, path);
  if (path?.includes('.location.geography')) return issue('unsupported_geography', message, path);
  return issue('invalid_request', safeMessage.invalidRequest, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function anchorIdsFor(intent: PlanningIntent): readonly string[] {
  return intent.anchors.map((anchor) => anchor.placeId);
}

function distanceMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }): number {
  const earthRadiusMeters = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitudeA = radians(left.latitude);
  const latitudeB = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function anchorReview(intent: PlanningIntent, placeId: string, status: AnchorReview['status'], reason: PlannerIssueCode | undefined): AnchorReview {
  const requested = intent.anchors.find((anchor) => anchor.placeId === placeId)!;
  return { placeId, intent: requested.intent, status, ...(reason ? { reason } : {}) };
}

function categoryCodesForLookup(intent: PlanningIntent): readonly string[] {
  const values = [
    ...intent.constraints.excludedCategoryCodes,
    ...(intent.constraints.categoryScope.kind === 'only' ? intent.constraints.categoryScope.categoryCodes : []),
  ];
  return [...new Set(values)];
}

function responseStatus(response: GeneratePlanResponseV1): number {
  if (response.outcome === 'error') {
    if (response.error.code === 'rate_limited') return 429;
    if (response.error.retryable) return 503;
    if (response.error.code === 'internal_error' || response.error.code === 'database_error') return 503;
    return 400;
  }
  if (response.outcome === 'clarification_needed') return 422;
  if (response.outcome === 'no_plan') return 422;
  return 200;
}

function withAuthoritativeReviews(response: GeneratePlanResponseV1, reviews: readonly AnchorReview[]): GeneratePlanResponseV1 {
  if (response.outcome === 'proposal' || response.outcome === 'partial_plan' || response.outcome === 'clarification_needed' || response.outcome === 'no_plan') {
    return { ...response, anchorReviews: reviews };
  }
  return response;
}

function logResult(logger: PlannerLogger, event: Omit<PlannerLogEvent, 'event'>): void {
  try {
    logger({ event: 'generate_plan_boundary', ...event });
  } catch {
    // Logging must never change the response or reveal an internal logger error.
  }
}

export function createGeneratePlanHandler(options: BoundaryOptions): (request: Request) => Promise<Response> {
  const generator = options.generator ?? deferredPlannerGenerator;
  const rateLimiter = options.rateLimiter ?? (() => false);
  const logger = options.logger ?? ((event) => console.log(JSON.stringify(event)));
  const requestIdFactory = options.requestId ?? defaultRequestId;
  const clock = options.now ?? (() => Date.now());

  return async (request) => {
    const startedAt = clock();
    const requestId = requestIdFactory();
    const baseLog = (extra: Omit<PlannerLogEvent, 'event' | 'requestId' | 'latencyMs'>): void => logResult(logger, {
      ...extra,
      requestId,
      latencyMs: Math.max(0, clock() - startedAt),
    });
    const httpFailure = (code: PlannerIssueCode, message: string, status: number, retryable = false, stage: PlannerLogEvent['validationStage'] = 'http'): Response => {
      const response = errorBody(requestId, code, message, retryable);
      baseLog({ requestVersion: GENERATION_REQUEST_VERSION, responseVersion: GENERATION_RESPONSE_VERSION, authClass: 'anonymous', outcome: 'error', failureCode: code, validationStage: stage, anchorCount: 0, databaseCallCount: 0, retryable });
      return json(response, status);
    };
    if (request.method === 'OPTIONS') return emptyOptions();
    if (request.method !== 'POST') return httpFailure('invalid_request', safeMessage.invalidRequest, 405);
    if (!isJsonContentType(request)) return httpFailure('invalid_request', safeMessage.unsupportedMedia, 415);
    if (rateLimiter(request)) return httpFailure('rate_limited', safeMessage.rateLimited, 429, true);

    let body: unknown;
    try {
      body = await readBody(request, MAX_REQUEST_BODY_BYTES);
    } catch (error) {
      if (error instanceof BoundaryHttpError && error.kind === 'body_too_large') return httpFailure('invalid_request', safeMessage.bodyTooLarge, 413);
      return httpFailure('invalid_request', safeMessage.invalidRequest, 400);
    }
    if (!isRecord(body)) return httpFailure('invalid_request', safeMessage.invalidRequest, 400);

    let auth;
    try {
      auth = await options.authorize(request);
    } catch {
      return httpFailure('internal_error', safeMessage.internalError, 503, true);
    }
    if (!auth) return httpFailure('invalid_request', safeMessage.unauthorized, 401);

    const parsed = validateGeneratePlanRequest(body);
    if (!parsed.success) {
      const mapped = issueFromValidation(body, parsed.issues);
      if (mapped.code === 'anchor_duplicate' || mapped.code === 'anchor_excluded') {
        const response = clarificationBody(requestId, [{ code: mapped.code, message: mapped.message, ...(mapped.path ? { path: mapped.path } : {}) }], []);
        baseLog({ requestVersion: GENERATION_REQUEST_VERSION, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'clarification_needed', failureCode: mapped.code, validationStage: 'contract', anchorCount: 0, databaseCallCount: 0, retryable: false });
        return json(response, 422);
      }
      const response = errorBody(requestId, mapped.code, mapped.code === 'unsupported_version' ? safeMessage.unsupportedVersion : mapped.message, false);
      baseLog({ requestVersion: GENERATION_REQUEST_VERSION, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'error', failureCode: mapped.code, validationStage: 'contract', anchorCount: 0, databaseCallCount: 0, retryable: false });
      return json(response, 400);
    }

    const requestValue = parsed.data;
    const intent = requestValue.intent;
    if (intent.location.geography.kind === 'locality') {
      const response = clarificationBody(requestId, [{ code: 'unsupported_geography', message: safeMessage.unsupportedGeography, path: '$.intent.location.geography' }], []);
      baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'clarification_needed', failureCode: 'unsupported_geography', validationStage: 'geography', anchorCount: intent.anchors.length, databaseCallCount: 0, retryable: false });
      return json(response, 422);
    }
    if (categoryCodesForLookup(intent).length > MAX_CATEGORY_CODES_PER_QUERY) {
      return httpFailure('invalid_request', safeMessage.invalidRequest, 400, false, 'contract');
    }

    let databaseCallCount = 0;
    try {
      const categoryCodes = categoryCodesForLookup(intent);
      const categories = categoryCodes.length > 0
        ? await (async () => { databaseCallCount += 1; return options.repository.findActiveCategories(categoryCodes); })()
        : [];
      const categorySet = new Set(categories.map((category) => category.code));
      const missingCategories = categoryCodes.filter((code) => !categorySet.has(code));
      if (missingCategories.length > 0) {
        const response = clarificationBody(requestId, [{ code: 'hard_constraint_unsatisfied', message: 'One or more requested category constraints are not active in the catalog.', path: '$.intent.constraints' }], []);
        baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'clarification_needed', failureCode: 'hard_constraint_unsatisfied', validationStage: 'categories', anchorCount: intent.anchors.length, databaseCallCount, retryable: false });
        return json(response, 422);
      }

      const anchorIds = anchorIdsFor(intent);
      const records = anchorIds.length > 0
        ? await (async () => { databaseCallCount += 1; return options.repository.readAnchors(anchorIds); })()
        : [];
      const recordById = new Map(records.map((record) => [record.placeId.toLowerCase(), record]));
      const hardRadius = intent.location.geography.radiusMeters;
      const reviews: AnchorReview[] = [];
      const validAnchors: AnchorCatalogRecord[] = [];
      const anchorIssues: PlannerIssue[] = [];
      const excludedPlaces = new Set(intent.constraints.excludedPlaceIds.map((placeId) => placeId.toLowerCase()));
      const excludedCategories = new Set(intent.constraints.excludedCategoryCodes);
      const onlyCategories = intent.constraints.categoryScope.kind === 'only' ? new Set(intent.constraints.categoryScope.categoryCodes) : null;
      for (const anchor of intent.anchors) {
        const record = recordById.get(anchor.placeId.toLowerCase());
        let reason: PlannerIssueCode | undefined;
        if (!record || record.status !== 'active' || !record.categoryActive || !record.place) reason = 'anchor_inactive';
        else if (excludedPlaces.has(anchor.placeId.toLowerCase()) || (record.categoryCode !== null && excludedCategories.has(record.categoryCode))) reason = 'anchor_excluded';
        else if (onlyCategories && (!record.categoryCode || !onlyCategories.has(record.categoryCode))) reason = 'anchor_scope_conflict';
        else if (distanceMeters(intent.location.coordinates, record.place) > hardRadius) reason = 'anchor_outside_geography';
        const review = anchorReview(intent, anchor.placeId, reason ? 'incompatible' : 'valid', reason);
        reviews.push(requestValue.draftRevision === undefined ? review : { ...review, checkedRevision: requestValue.draftRevision });
        if (reason) {
          anchorIssues.push({ code: reason, message: safeMessage.anchorIncompatible, placeId: anchor.placeId });
        } else if (record) {
          validAnchors.push(record);
        }
      }
      if (anchorIssues.length > 0) {
        const response = clarificationBody(requestId, anchorIssues, reviews);
        baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'clarification_needed', failureCode: anchorIssues[0]?.code, validationStage: 'anchors', anchorCount: intent.anchors.length, databaseCallCount, retryable: false });
        return json(response, 422);
      }

      const generationInput: PlannerGenerationInput = { request: requestValue, requestId, auth, anchors: validAnchors, anchorReviews: reviews };
      let generated: GeneratePlanResponseV1;
      try {
        generated = await generator(generationInput);
      } catch {
        const response = errorBody(requestId, 'internal_error', safeMessage.internalError, true);
        baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'error', failureCode: 'internal_error', validationStage: 'generator', anchorCount: intent.anchors.length, databaseCallCount, retryable: true });
        return json(response, 503);
      }
      const validatedResponse = validateGeneratePlanResponse(generated);
      if (!validatedResponse.success) {
        const response = errorBody(requestId, 'internal_error', safeMessage.internalError, true);
        baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'error', failureCode: 'internal_error', validationStage: 'generator', anchorCount: intent.anchors.length, databaseCallCount, retryable: true });
        return json(response, 503);
      }
      const response = withAuthoritativeReviews(validatedResponse.data, reviews);
      baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: response.outcome, validationStage: 'generator', anchorCount: intent.anchors.length, databaseCallCount, retryable: response.outcome === 'error' ? response.error.retryable : false, ...(response.outcome === 'error' ? { failureCode: response.error.code } : {}) });
      return json(response, responseStatus(response));
    } catch {
      const response = errorBody(requestId, 'database_error', safeMessage.databaseError, true);
      baseLog({ requestVersion: requestValue.requestVersion, responseVersion: GENERATION_RESPONSE_VERSION, authClass: auth.authClass, outcome: 'error', failureCode: 'database_error', validationStage: databaseCallCount > 0 ? 'anchors' : 'categories', anchorCount: intent.anchors.length, databaseCallCount, retryable: true });
      return json(response, 503);
    }
  };
}

export const DEFAULT_GENERATE_PLAN_BODY_LIMIT = MAX_REQUEST_BODY_BYTES;
