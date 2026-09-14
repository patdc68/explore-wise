import type { ItineraryState } from './itinerary';
import { createExecution, executionStopId, markExecutionContributed, transitionExecution, type ExecutionAction, type ItineraryExecution, type LiveItinerary } from './itinerary-execution.ts';

export const LIVE_ITINERARY_KEY = '@explorewise/live-itinerary/v1';
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableText = (value: unknown) => value == null || typeof value === 'string';
const nullableNumber = (value: unknown) => value === null || finite(value);
const coordinate = (value: unknown, limit: number) => finite(value) && Math.abs(value) <= limit;
const optionalTimestamp = (value: unknown) => value === undefined || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));

/** Validate everything used by the restored finalized screen before rendering stored JSON. */
function validItinerary(value: unknown): value is ItineraryState {
  if (!record(value) || value.finalized !== true || !record(value.start)
    || !coordinate(value.start.latitude, 90) || !coordinate(value.start.longitude, 180) || !text(value.start.label)
    || !finite(value.budgetMinor) || value.budgetMinor < 0 || !Number.isInteger(value.partySize) || (value.partySize as number) < 1
    || !Array.isArray(value.stages) || !Array.isArray(value.stops) || !value.stops.length) return false;
  const stageIds = new Set<string>();
  for (const stage of value.stages) {
    if (!record(stage) || !text(stage.id) || stageIds.has(stage.id) || !text(stage.title)
      || !Array.isArray(stage.categoryCodes) || !stage.categoryCodes.every(text)
      || typeof stage.required !== 'boolean' || typeof stage.source !== 'string' || !['wise', 'user_added'].includes(stage.source)) return false;
    stageIds.add(stage.id);
  }
  const selectedStages = new Set<string>(); const places = new Set<string>();
  for (const stop of value.stops) {
    if (!record(stop) || !text(stop.stageId) || !stageIds.has(stop.stageId) || selectedStages.has(stop.stageId) || !record(stop.place)) return false;
    const place = stop.place;
    if (!text(place.place_id) || places.has(place.place_id) || !text(place.name)
      || !(place.latitude === null || coordinate(place.latitude, 90)) || !(place.longitude === null || coordinate(place.longitude, 180))
      || typeof place.has_price !== 'boolean' || !nullableNumber(place.estimated_group_min_minor) || !nullableNumber(place.estimated_group_max_minor)
      || !['category_name', 'category_code', 'pricing_basis', 'pricing_status', 'price_source_label', 'budget_status'].every((key) => nullableText(place[key]))) return false;
    selectedStages.add(stop.stageId); places.add(place.place_id);
  }
  return value.stages.every((stage) => !stage.required || selectedStages.has(stage.id));
}

function validExecution(value: unknown, itinerary: ItineraryState): value is ItineraryExecution {
  if (!record(value) || !text(value.itineraryId) || typeof value.status !== 'string' || !['planned', 'in_progress', 'completed'].includes(value.status)
    || !optionalTimestamp(value.startedAt) || !optionalTimestamp(value.completedAt)
    || !Array.isArray(value.stops) || value.stops.length !== itinerary.stops.length) return false;
  let current = 0; let encounteredActive = false;
  for (let index = 0; index < value.stops.length; index++) {
    const stop = value.stops[index];
    if (!record(stop) || stop.id !== executionStopId(itinerary.stops[index])
      || typeof stop.status !== 'string' || !['upcoming', 'current', 'completed', 'skipped'].includes(stop.status)
      || !optionalTimestamp(stop.completedAt) || !optionalTimestamp(stop.skippedAt)
      || (stop.completedAt !== undefined && stop.status !== 'completed') || (stop.skippedAt !== undefined && stop.status !== 'skipped')) return false;
    if (value.status === 'planned' && stop.status !== 'upcoming') return false;
    if (stop.status === 'completed' || stop.status === 'skipped') {
      if (encounteredActive) return false;
    } else {
      if (value.status === 'completed') return false;
      if (stop.status === 'current') { if (encounteredActive) return false; current++; }
      encounteredActive = true;
    }
  }
  return (value.status === 'in_progress' ? current === 1 : current === 0)
    && (value.status === 'completed' || value.completedAt === undefined)
    && (value.status !== 'planned' || value.startedAt === undefined);
}

export function decodeLiveItinerary(raw: string | null): { active: LiveItinerary | null; invalid: boolean } {
  if (raw === null) return { active: null, invalid: false };
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1) throw new Error('Unknown storage version');
    if (data.active === null) return { active: null, invalid: false };
    if (!record(data.active) || !validItinerary(data.active.itinerary) || !validExecution(data.active.execution, data.active.itinerary)) throw new Error('Invalid itinerary');
    const execution = data.active.execution;
    // Optional metadata must not invalidate an otherwise valid v1 outing.
    const completedKeys = new Set(execution.status === 'completed' ? execution.stops.filter((stop) => stop.status === 'completed').map((stop) => stop.id) : []);
    const contributedStopKeys = Array.isArray(execution.contributedStopKeys)
      ? [...new Set(execution.contributedStopKeys.filter((key) => typeof key === 'string' && completedKeys.has(key)))] : [];
    return { active: { itinerary: data.active.itinerary, execution: { ...execution, contributedStopKeys } }, invalid: false };
  } catch { return { active: null, invalid: true }; }
}

export function encodeLiveItinerary(active: LiveItinerary | null) { return JSON.stringify({ version: 1, active }); }

/** Device-local finalized snapshot, separate from ephemeral planning and account data. */
export function createItineraryExecutionStore(storage: Storage) {
  let snapshot: { active: LiveItinerary | null; ready: boolean; loadFailed: boolean; error: string | null } = { active: null, ready: false, loadFailed: false, error: null };
  let hydration: Promise<void> | undefined;
  let restoring: Promise<void> | undefined;
  let writes = Promise.resolve();
  let resetting = false;
  const listeners = new Set<() => void>();
  const publish = (update: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...update }; listeners.forEach((listener) => listener()); };
  const persist = (active: LiveItinerary | null) => {
    const raw = encodeLiveItinerary(active);
    const write = writes.then(() => storage.setItem(LIVE_ITINERARY_KEY, raw));
    writes = write.catch(() => {});
    return write.then(() => { publish({ error: null }); return true; }, () => {
      publish({ error: 'Progress could not be saved on this device. Retry before closing the app.' }); return false;
    });
  };
  const restore = () => {
    restoring ??= (async () => {
      try {
        const decoded = decodeLiveItinerary(await storage.getItem(LIVE_ITINERARY_KEY));
        publish({ active: decoded.active, ready: true, loadFailed: false, error: decoded.invalid ? 'The saved itinerary could not be restored. Please build a new plan.' : null });
      } catch { publish({ ready: true, loadFailed: true, error: 'The saved itinerary could not be loaded. Retry before starting a new plan.' }); }
      finally { restoring = undefined; }
    })();
    return restoring;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate() {
      hydration ??= restore();
      return hydration;
    },
    finalize(itineraryId: string, itinerary: ItineraryState) {
      if (!snapshot.ready || snapshot.loadFailed || resetting || snapshot.active) return null;
      // Detach the execution snapshot from every planner/candidate reference.
      const frozenPlan: ItineraryState = JSON.parse(JSON.stringify(itinerary));
      const execution = createExecution(itineraryId, frozenPlan);
      const active = { itinerary: frozenPlan, execution };
      publish({ active }); void persist(active);
      return active;
    },
    dispatch(action: ExecutionAction) {
      if (!snapshot.ready || resetting || !snapshot.active) return;
      const execution = transitionExecution(snapshot.active.execution, action);
      if (execution === snapshot.active.execution) return;
      const active = { ...snapshot.active, execution };
      publish({ active }); void persist(active);
    },
    async markContributed(itineraryId: string, stopId: string) {
      if (!snapshot.ready || resetting || !snapshot.active) return false;
      const execution = markExecutionContributed(snapshot.active.execution, itineraryId, stopId);
      if (execution === snapshot.active.execution) return false;
      const active = { ...snapshot.active, execution };
      publish({ active });
      return persist(active);
    },
    async clear(itineraryId?: string) {
      if (!snapshot.ready || snapshot.loadFailed || resetting || snapshot.active?.execution.itineraryId !== itineraryId) return false;
      resetting = true;
      // Confirmed resets only disappear from the UI once the reset is durable.
      const saved = await persist(null);
      resetting = false;
      if (!saved) return false;
      if (snapshot.active?.execution.itineraryId !== itineraryId) return false;
      publish({ active: null }); return true;
    },
    retry() { return snapshot.loadFailed ? restore() : resetting ? writes : persist(snapshot.active); },
  };
}
