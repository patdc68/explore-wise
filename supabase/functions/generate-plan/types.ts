import type {
  AnchorReview,
  GeneratePlanRequestV1,
  GeneratePlanResponseV1,
} from '../../../packages/planning/src/contracts.ts';
import type { CatalogPlaceAnchor } from '../../../packages/planning/src/engine.ts';
import { MAX_DATABASE_CALLS } from '../../../packages/planning/src/policy.ts';

export type PlannerAuthClass = 'anonymous' | 'authenticated';

export type PlannerAuthContext = Readonly<{
  authClass: PlannerAuthClass;
  userId?: string;
}>;

export type AnchorCatalogRecord = Readonly<{
  placeId: string;
  status: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryActive: boolean;
  place: CatalogPlaceAnchor | null;
}>;

type CatalogAnchorLookup = Readonly<{
  findActivePlaces: (placeIds: readonly string[]) => Promise<readonly CatalogPlaceAnchor[]>;
}>;

type CategoryLookup = Readonly<{
  findActiveCategories: (categoryCodes: readonly string[]) => Promise<readonly Readonly<{ code: string; name: string; isActive?: boolean }>[]>;
}>;

/** Read-only metadata required by the boundary. Candidate retrieval is deliberately absent. */
export type PlanningBoundaryRepository = Readonly<{
  readAnchors: (placeIds: readonly string[]) => Promise<readonly AnchorCatalogRecord[]>;
  findActivePlaces: CatalogAnchorLookup['findActivePlaces'];
  findActiveCategories: CategoryLookup['findActiveCategories'];
}>;

/**
 * Mutable only through the request-local method.  The boundary and generator
 * share this object so preflight and retrieval consume one allowance.
 */
export type PlannerDatabaseBudget = Readonly<{
  maxCalls: number;
  readonly usedCalls: number;
  readonly remainingCalls: number;
  tryConsume: () => boolean;
}>;

export function createPlannerDatabaseBudget(maxCalls = MAX_DATABASE_CALLS): PlannerDatabaseBudget {
  const cap = Number.isSafeInteger(maxCalls) ? Math.min(MAX_DATABASE_CALLS, Math.max(0, maxCalls)) : MAX_DATABASE_CALLS;
  let usedCalls = 0;
  return {
    maxCalls: cap,
    get usedCalls() { return usedCalls; },
    get remainingCalls() { return Math.max(0, cap - usedCalls); },
    tryConsume: () => {
      if (usedCalls >= cap) return false;
      usedCalls += 1;
      return true;
    },
  };
}

export type PlannerGenerationInput = Readonly<{
  request: GeneratePlanRequestV1;
  requestId: string;
  auth: PlannerAuthContext;
  anchors: readonly AnchorCatalogRecord[];
  anchorReviews: readonly AnchorReview[];
  databaseBudget: PlannerDatabaseBudget;
}>;

/** The Edge boundary invokes the deterministic V1 generator through this seam. */
export type PlannerGenerator = (input: PlannerGenerationInput) => Promise<GeneratePlanResponseV1>;

export type PlannerAuthenticator = (request: Request) => Promise<PlannerAuthContext | null>;

export type PlannerRateLimiter = (request: Request) => boolean;

export type PlannerLogEvent = Readonly<{
  event: 'generate_plan_boundary';
  requestId: string;
  requestVersion: number;
  responseVersion: number;
  authClass: PlannerAuthClass;
  outcome: 'proposal' | 'partial_plan' | 'clarification_needed' | 'no_plan' | 'error';
  failureCode?: string;
  validationStage: 'http' | 'contract' | 'geography' | 'categories' | 'anchors' | 'generator';
  anchorCount: number;
  databaseCallCount: number;
  latencyMs: number;
  retryable: boolean;
}>;

export type PlannerLogger = (event: PlannerLogEvent) => void;
