export const START_OVER_TITLE = 'Start over?';
export const START_OVER_MESSAGE = 'This will remove all places and selections from your current itinerary.';

export function startOverConfirmation(onConfirm: () => void) {
  return [{ text: 'Cancel', style: 'cancel' as const }, { text: START_OVER_LABEL, style: 'destructive' as const, onPress: onConfirm }];
}
export const START_OVER_LABEL = 'Start over';

export type PendingWiseRequest = Readonly<{ id: string; prompt: string }>;

/**
 * A pending request is intentionally distinct from a plan. It exists only long
 * enough to move an explicit Explore submission to the already-mounted Plan tab.
 */
export function pendingWiseRequest(id: string, prompt: string): PendingWiseRequest {
  return { id, prompt };
}

/** Return a request once and clear only that exact pending handoff. */
export function consumePendingWiseRequest(pending: PendingWiseRequest | null, id: string) {
  return pending?.id === id ? { request: pending, pending: null } : { request: null, pending };
}

/** Only ephemeral planning state belongs here; account and user-owned data do not. */
export function emptyPlanningSession() {
  return { request: null, proposal: null, itinerary: null, history: [] as string[], candidates: [] as string[], highlightedId: null, stageIndex: 0, notice: null, error: null, phase: 'initial' as const };
}
