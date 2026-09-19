import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchPlacePresentations,
  presentationByPlaceId,
  type PlacePresentationCandidate,
} from '@/services/place-presentation';
import type { PlacePresentationV1, PlacePresentationVariant } from '../../../../packages/place-presentation/src/contracts.ts';

export function usePlacePresentations(
  candidates: readonly PlacePresentationCandidate[],
  variant: PlacePresentationVariant,
  options: Readonly<{ allowGoogle?: boolean }> = {},
) {
  // Callers provide only measured/viewable records. The service enforces the
  // protocol's maximum batch size; this hook must not invent visibility by
  // slicing a rendered collection.
  const visible = useMemo(() => candidates, [candidates]);
  const key = `${variant}:${options.allowGoogle !== false}:${visible.map((candidate) => `${candidate.place_id}:${candidate.category_code ?? ''}:${candidate.google_match_status ?? ''}`).join('|')}`;
  const [presentations, setPresentations] = useState<readonly PlacePresentationV1[]>([]);
  const [revisionById, setRevisionById] = useState<Readonly<Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const refreshes = useRef(new Set<string>());
  const requestSignatureById = useRef(new Map<string, string>());
  const mounted = useRef(false);
  const epoch = useRef(0);
  const refreshControllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    mounted.current = true;
    const controllers = refreshControllers.current;
    return () => {
      mounted.current = false;
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const requestEpoch = ++epoch.current;
    for (const refreshController of refreshControllers.current.values()) refreshController.abort();
    refreshControllers.current.clear();
    refreshes.current = new Set();
    const requestContext = `${variant}:${options.allowGoogle !== false}`;
    const missing = visible.filter((candidate) => {
      const id = candidate.place_id.toLowerCase();
      const signature = `${requestContext}:${candidate.category_code ?? ''}:${candidate.google_match_status ?? ''}`;
      const changed = requestSignatureById.current.get(id) !== signature;
      requestSignatureById.current.set(id, signature);
      return changed || !presentations.some((presentation) => presentation.ewPlaceId.toLowerCase() === id);
    });
    if (missing.length === 0) {
      setLoading(false);
      return () => { active = false; controller.abort(); };
    }
    setLoading(true);
    void fetchPlacePresentations(missing, variant, { allowGoogle: options.allowGoogle, signal: controller.signal })
      .then((next) => { if (active && mounted.current && requestEpoch === epoch.current) setPresentations((current) => [...current.filter((item) => !next.some((candidate) => candidate.ewPlaceId.toLowerCase() === item.ewPlaceId.toLowerCase())), ...next]); })
      .finally(() => { if (active && mounted.current && requestEpoch === epoch.current) setLoading(false); });
    return () => { active = false; controller.abort(); };
    // The serialized key intentionally controls the bounded visible request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = useCallback((placeId: string) => {
    const normalized = placeId.toLowerCase();
    if (refreshes.current.has(normalized)) return;
    const candidate = visible.find((item) => item.place_id.toLowerCase() === normalized);
    if (!candidate || options.allowGoogle === false) return;
    refreshes.current.add(normalized);
    const controller = new AbortController();
    const requestEpoch = epoch.current;
    refreshControllers.current.get(normalized)?.abort();
    refreshControllers.current.set(normalized, controller);
    setRevisionById((current) => ({ ...current, [normalized]: (current[normalized] ?? 0) + 1 }));
    void fetchPlacePresentations([candidate], variant, { allowGoogle: options.allowGoogle, signal: controller.signal })
      .then((next) => {
        if (!mounted.current || requestEpoch !== epoch.current || controller.signal.aborted) return;
        setPresentations((current) => [...current.filter((item) => item.ewPlaceId.toLowerCase() !== normalized), ...next]);
      })
      .finally(() => {
        if (refreshControllers.current.get(normalized) === controller) refreshControllers.current.delete(normalized);
      });
  }, [options.allowGoogle, variant, visible]);

  return {
    presentations: presentationByPlaceId(presentations),
    revisionById,
    loading,
    refresh,
  };
}
