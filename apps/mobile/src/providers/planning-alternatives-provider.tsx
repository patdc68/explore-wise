import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import type { ItineraryStage, ItineraryState } from '@/services/itinerary';
import type { PricedNearbyPlace } from '@/services/places';
import type { WiseProposal } from '@/services/wise-proposal';
import type { FoodFocus } from '@/services/ask-wise-normalization';
import type { StageDistanceOrigin } from '@/services/planning-distance';

export type PlanningAlternativesSession = Readonly<{
  proposal: WiseProposal;
  state: ItineraryState;
  stage: ItineraryStage;
  stageIndex: number;
  origin: { latitude: number; longitude: number; label?: string | null };
  distanceOrigin: StageDistanceOrigin;
  candidates: readonly PricedNearbyPlace[];
  shortlistedIds: readonly string[];
  broaderCandidateIds: readonly string[];
  explicitFoodFocus: Exclude<FoodFocus, null> | null;
  selectedId: string | null;
  select: (place: PricedNearbyPlace) => void;
}>;

type PlanningAlternatives = Readonly<{
  session: PlanningAlternativesSession | null;
  openAlternatives: (session: PlanningAlternativesSession) => void;
  clearAlternatives: () => void;
}>;

const PlanningAlternativesContext = createContext<PlanningAlternatives | null>(null);

/** Ephemeral, in-memory bridge between Customize and its pushed alternatives route. */
export function PlanningAlternativesProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<PlanningAlternativesSession | null>(null);
  const openAlternatives = useCallback((next: PlanningAlternativesSession) => setSession(next), []);
  const clearAlternatives = useCallback(() => setSession(null), []);
  const value = useMemo(() => ({ session, openAlternatives, clearAlternatives }), [clearAlternatives, openAlternatives, session]);
  return <PlanningAlternativesContext.Provider value={value}>{children}</PlanningAlternativesContext.Provider>;
}

export function usePlanningAlternatives() {
  const value = useContext(PlanningAlternativesContext);
  if (!value) throw new Error('usePlanningAlternatives must be used within PlanningAlternativesProvider.');
  return value;
}
