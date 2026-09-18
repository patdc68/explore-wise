import { validatePlanningIntent } from './intent.ts';
import type { PlanningCoordinates, PricedNearbyPlace } from './domain.ts';
import type { PriceEvidenceInput } from './budget.ts';

export type PlanningCategory = Readonly<{ code: string; name: string; isActive?: boolean }>;
export type CatalogPlaceAnchor = PricedNearbyPlace & Readonly<{ isActive?: boolean }>;

export type AnchorLookup = Readonly<{
  findActivePlaces: (placeIds: readonly string[]) => Promise<readonly CatalogPlaceAnchor[]>;
}>;

export type CategoryLookup = Readonly<{
  findActiveCategories: (categoryCodes: readonly string[]) => Promise<readonly PlanningCategory[]>;
}>;

export type CandidateRetrievalRequest = Readonly<{
  origin: PlanningCoordinates;
  hardOrigin: PlanningCoordinates;
  radiusMeters: number;
  hardRadiusMeters: number;
  categoryCodes: readonly string[];
  budgetMinor: number | null;
  partySize: number;
  currencyCode: string;
  limit: number;
  stageId: string;
}>;

export type CandidateRetriever = Readonly<{
  retrieveCandidates: (request: CandidateRetrievalRequest) => Promise<readonly PricedNearbyPlace[]>;
}>;

export type PriceEvidenceProvider = Readonly<{
  getPriceEvidence: (placeIds: readonly string[]) => Promise<readonly (PriceEvidenceInput & Readonly<{ placeId: string }>)[]>;
}>;

export type ChainMembership = Readonly<{ placeId: string; chainId: string }>;
export type ChainMembershipProvider = Readonly<{
  getChainMembership: (placeIds: readonly string[]) => Promise<readonly ChainMembership[]>;
}>;

export type PlannerRuntime = Readonly<{
  now: () => Date;
  requestId: () => string;
}>;

/** All I/O is injected; this package never imports Supabase, Deno, React Native, or Google APIs. */
export type PlanningDependencies = Readonly<{
  anchors: AnchorLookup;
  categories: CategoryLookup;
  candidates: CandidateRetriever;
  prices?: PriceEvidenceProvider;
  chains?: ChainMembershipProvider;
  runtime?: PlannerRuntime;
}>;

export type PlanningEngine = Readonly<{ dependencies: PlanningDependencies; validateIntent: typeof validatePlanningIntent }>;

export function createPlanningEngine(dependencies: PlanningDependencies): PlanningEngine {
  return Object.freeze({
    dependencies,
    validateIntent: validatePlanningIntent,
  });
}
