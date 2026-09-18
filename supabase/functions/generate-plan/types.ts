import type {
  AnchorReview,
  GeneratePlanRequestV1,
  GeneratePlanResponseV1,
} from '../../../packages/planning/src/contracts.ts';
import type { CatalogPlaceAnchor } from '../../../packages/planning/src/engine.ts';

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

export type PlannerGenerationInput = Readonly<{
  request: GeneratePlanRequestV1;
  requestId: string;
  auth: PlannerAuthContext;
  anchors: readonly AnchorCatalogRecord[];
  anchorReviews: readonly AnchorReview[];
}>;

/** Phase 3B.3/3B.4 will provide the real deterministic generator through this seam. */
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
