import type { ItineraryState, ItineraryStop } from './itinerary';

export type ExecutionStatus = 'planned' | 'in_progress' | 'completed';
export type StopStatus = 'upcoming' | 'current' | 'completed' | 'skipped';
export type ExecutionStop = Readonly<{ id: string; status: StopStatus; completedAt?: string; skippedAt?: string }>;
export type ItineraryExecution = Readonly<{
  itineraryId: string;
  status: ExecutionStatus;
  stops: readonly ExecutionStop[];
  startedAt?: string;
  completedAt?: string;
  contributedStopKeys?: readonly string[];
}>;
export type LiveItinerary = Readonly<{ itinerary: ItineraryState; execution: ItineraryExecution }>;

/** The stage and exact place identify a stop within a particular execution. Names are never keys. */
export const executionStopId = (stop: ItineraryStop) => JSON.stringify([stop.stageId, stop.place.place_id]);

export function createExecution(itineraryId: string, itinerary: ItineraryState): ItineraryExecution {
  if (!itineraryId || !itinerary.finalized || !itinerary.stops.length) throw new Error('A finalized itinerary with stops is required.');
  const ids = itinerary.stops.map(executionStopId);
  if (new Set(ids).size !== ids.length || new Set(itinerary.stops.map((stop) => stop.place.place_id)).size !== ids.length) throw new Error('Stops must have unique places and identities.');
  return { itineraryId, status: 'planned', contributedStopKeys: [], stops: ids.map((id) => ({ id, status: 'upcoming' })) };
}

/** Contribution is optional metadata; it never advances or completes an outing. */
export function markExecutionContributed(execution: ItineraryExecution, itineraryId: string, stopId: string): ItineraryExecution {
  if (execution.itineraryId !== itineraryId || execution.status !== 'completed'
    || !execution.stops.some((stop) => stop.id === stopId && stop.status === 'completed')
    || execution.contributedStopKeys?.includes(stopId)) return execution;
  return { ...execution, contributedStopKeys: [...(execution.contributedStopKeys ?? []), stopId] };
}

export function executionProgress(execution: ItineraryExecution) {
  const completed = execution.stops.filter((stop) => stop.status === 'completed').length;
  const skipped = execution.stops.filter((stop) => stop.status === 'skipped').length;
  return {
    total: execution.stops.length, completed, skipped,
    remaining: execution.stops.length - completed - skipped,
    current: execution.stops.find((stop) => stop.status === 'current') ?? null,
    next: execution.stops.find((stop) => stop.status === 'upcoming') ?? null,
  };
}

export type ExecutionAction = Readonly<{ type: 'start'; itineraryId: string }> | Readonly<{ type: 'complete' | 'skip'; itineraryId: string; stopId: string }>;

/** Manual, sequential transitions only. Expected identities also make stale/double taps harmless. */
export function transitionExecution(execution: ItineraryExecution, action: ExecutionAction, at = new Date().toISOString()): ItineraryExecution {
  if (action.itineraryId !== execution.itineraryId) return execution;
  if (action.type === 'start') {
    if (execution.status !== 'planned' || !execution.stops.length) return execution;
    return { ...execution, status: 'in_progress', startedAt: at, stops: execution.stops.map((stop, index) => index === 0 ? { ...stop, status: 'current' } : stop) };
  }
  if (execution.status !== 'in_progress') return execution;
  const index = execution.stops.findIndex((stop) => stop.status === 'current');
  if (index < 0 || execution.stops[index].id !== action.stopId) return execution;
  const stops: ExecutionStop[] = execution.stops.map((stop, stopIndex) => stopIndex === index
    ? action.type === 'complete' ? { ...stop, status: 'completed', completedAt: at } : { ...stop, status: 'skipped', skippedAt: at }
    : stop);
  const next = stops.findIndex((stop) => stop.status === 'upcoming');
  if (next < 0) return { ...execution, stops, status: 'completed', completedAt: at };
  stops[next] = { ...stops[next], status: 'current' };
  return { ...execution, stops };
}
