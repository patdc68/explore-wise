import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { consumePendingWiseRequest as consumePending, pendingWiseRequest, type PendingWiseRequest } from '@/services/planning-session';

type PlanningHandoff = Readonly<{
  pendingWiseRequest: PendingWiseRequest | null;
  submitFromExplore: (prompt: string) => PendingWiseRequest;
  consumePendingWiseRequest: (id: string) => PendingWiseRequest | null;
}>;

const PlanningHandoffContext = createContext<PlanningHandoff | null>(null);

/** A one-use bridge for an explicit Explore Ask Wise submission. */
export function PlanningHandoffProvider({ children }: PropsWithChildren) {
  const serial = useRef(0);
  const pendingRef = useRef<PendingWiseRequest | null>(null);
  const [pending, setPending] = useState<PendingWiseRequest | null>(null);

  const submitFromExplore = useCallback((prompt: string) => {
    const request = pendingWiseRequest(`explore-${Date.now()}-${++serial.current}`, prompt);
    pendingRef.current = request;
    setPending(request);
    return request;
  }, []);

  const consumePendingWiseRequest = useCallback((id: string) => {
    const consumed = consumePending(pendingRef.current, id);
    if (!consumed.request) return null;
    pendingRef.current = consumed.pending;
    setPending(consumed.pending);
    return consumed.request;
  }, []);

  const value = useMemo(() => ({ pendingWiseRequest: pending, submitFromExplore, consumePendingWiseRequest }), [consumePendingWiseRequest, pending, submitFromExplore]);
  return <PlanningHandoffContext.Provider value={value}>{children}</PlanningHandoffContext.Provider>;
}

export function usePlanningHandoff() {
  const value = useContext(PlanningHandoffContext);
  if (!value) throw new Error('usePlanningHandoff must be used within PlanningHandoffProvider.');
  return value;
}
