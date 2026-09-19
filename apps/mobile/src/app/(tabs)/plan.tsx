import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFloatingTabInset } from '@/hooks/use-floating-tab-inset';
import { AskWiseCard } from '@/components/ask-wise-card';
import { LocationSearchSheet } from '@/components/discovery/location-search-sheet';
import { StateCard } from '@/components/discovery/state-card';
import { ItineraryContributions } from '@/components/itinerary/itinerary-contributions';
import { ItineraryProgress } from '@/components/itinerary/itinerary-progress';
import { useItineraryExecution } from '@/providers/itinerary-execution-provider';
import { executionStopId, type ItineraryExecution, type ExecutionAction } from '@/services/itinerary-execution';
import { ItineraryMap } from '@/components/itinerary/itinerary-map';
import { StartOverAction } from '@/components/itinerary/start-over-action';
import { BudgetSummaryCard, CustomizeCandidateCard, ItineraryStopCard, StageProgress } from '@/components/itinerary/itinerary-ui';
import { ThemedText } from '@/components/themed-text';
import { ClayCard, ClayInput, ClaySurface, LoadingCard, PrimaryButton, SecondaryButton, ScreenSection, SectionHeader } from '@/components/ui/clay';
import { WiseProposalCard } from '@/components/wise-proposal-card';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlacePresentations } from '@/hooks/use-place-presentations';
import { presentationViewportContext, type PresentationViewport } from '@/hooks/use-place-presentation-viewport';
import { useCurrentLocation } from '@/providers/current-location-provider';
import { usePlanningAlternatives } from '@/providers/planning-alternatives-provider';
import { usePlanningHandoff } from '@/providers/planning-handoff-provider';
import { parseAskWise, type AskWiseIntent } from '@/services/ask-wise';
import { customizeNavigation, originSuggestionLabel, stageSelectionHeading } from '@/services/customize-ui';
import { buildFoodCandidatePool, CUSTOMIZE_CANDIDATE_LIMIT, foodFocusLabel, isFoodStage, orderStageCandidates, shortlistWithSelectedCandidate, stageRankingContextFromIntent, STAGE_CANDIDATE_POOL_LIMIT } from '@/services/food-candidate-diversity';
import { ADD_STOP_CATEGORIES, addCatalogPlace, addUserStage, areRequiredStagesComplete, filterCandidatesForStage, finalizeItinerary, isPlaceAvailableForStage, mapStops, MAX_ITINERARY_STOPS, navigationUrl, nextStageOrigin, remainingBudget, removeUserStage, selectStop, selectedPlaceExclusionKey, stageActivityFocus, stageIndexAfterRemoval, stageOrigin, stageOriginKey, type AddStopCategoryId, type ItineraryState } from '@/services/itinerary';
import { resolvePlanLocation } from '@/services/plan-location';
import { emptyPlanningSession, START_OVER_MESSAGE, START_OVER_TITLE, startOverConfirmation } from '@/services/planning-session';
import { fetchPlanningNearbyPlaces, fetchPricedNearbyPlaces, formatDistance, searchCatalogPlaces, type PricedNearbyPlace } from '@/services/places';
import { sequentialStopDistances, stageDistanceLabel, stageDistanceOrigin, type StageDistanceOrigin } from '@/services/planning-distance';
import { canCommitGuidedSelection, guidedSelectionTransition } from '@/services/guided-selection';
import { logWiseBudget } from '@/services/wise-budget-diagnostics';
import { logFoodPipeline } from '@/services/wise-food-diagnostics';
import { adaptGuidedPlanProposal, guidedPlanGeneration, type GuidedPlanGenerationResult, type GuidedPlanProposal } from '@/services/guided-plan-generation';
import { guidedCandidateAllowed, guidedCategoryScopeAllows, guidedStageIsLocked, validateGuidedCandidate, validateGuidedItinerary } from '@/services/guided-plan-constraints';
import { buildWiseProposal, type PlanProposal } from '@/services/wise-proposal';
import { resolveNamedCatalogPlace, type CatalogSearchCandidate } from '@/services/catalog-search';
import { mergeGoogleIdentityResults, warmVisibleGooglePlaceIdentities, type GoogleIdentityResult } from '@/services/google-place-identity';
import { googlePresentationAllowed } from '@/services/place-presentation-policy';
import { visiblePresentationIds } from '@/services/place-presentation-visibility';
import type { GeneratePlanRequestV1 } from '../../../../../packages/planning/src/contracts.ts';

type Screen = 'initial' | 'proposal' | 'guided' | 'review' | 'finalized' | 'add-category';

function isGuidedProposal(proposal: PlanProposal | null): proposal is GuidedPlanProposal {
  return Boolean(proposal && 'source' in proposal && proposal.source === 'guided');
}

function rankingIntentForProposal(proposal: PlanProposal | null): Parameters<typeof stageRankingContextFromIntent>[0] {
  if (!proposal) return null;
  if (!isGuidedProposal(proposal)) return proposal.intent;
  const foodValues = proposal.intent.food.state === 'selected' ? proposal.intent.food.values : [];
  const foodFocus: AskWiseIntent['foodFocus'] = foodValues.find((value) => value === 'restaurant' || value === 'cafe' || value === 'dessert' || value === 'fast_food') ?? null;
  const outingContext = proposal.intent.occasion === 'date' ? 'date' : proposal.intent.occasion === 'friends' ? 'friends_group' : proposal.intent.occasion === 'family' ? 'family' : 'solo';
  return {
    explicitQuickService: foodValues.includes('fast_food'),
    explicitNightlife: false,
    foodFocus,
    outingContext,
    budgetMinor: proposal.state.budgetMinor,
    partySize: proposal.intent.party.size,
    currencyCode: proposal.intent.budget.currencyCode,
  };
}

function stageRankingContextFromProposal(proposal: PlanProposal | null, activityFocus: Parameters<typeof stageRankingContextFromIntent>[1]) {
  return stageRankingContextFromIntent(rankingIntentForProposal(proposal), activityFocus);
}

export default function PlanScreen() {
  const { active, loadFailed, store: executionStore } = useItineraryExecution();
  const location = useCurrentLocation(); const theme = useTheme(); const router = useRouter();
  const { pendingWiseRequest, consumePendingWiseRequest, guidedPlanProposal, consumeGuidedPlanProposal } = usePlanningHandoff(); const { openAlternatives, clearAlternatives } = usePlanningAlternatives();
  const [prompt, setPrompt] = useState(''); const [activeRequest, setActiveRequest] = useState<string | null>(null); const [screen, setScreen] = useState<Screen>(active ? 'finalized' : 'initial'); const [proposal, setProposal] = useState<PlanProposal | null>(null); const [state, setState] = useState<ItineraryState | null>(active?.itinerary ?? null); const [stageIndex, setStageIndex] = useState(0); const [candidatePool, setCandidatePool] = useState<PricedNearbyPlace[]>([]); const [candidateStageKey, setCandidateStageKey] = useState<string | null>(null); const [highlightedId, setHighlightedId] = useState<string | null>(null); const [selectionTransition, setSelectionTransition] = useState<Readonly<{ stageId: string; placeName: string; returnToReview: boolean }> | null>(null); const [candidateRefreshKey, setCandidateRefreshKey] = useState(0); const [loading, setLoading] = useState(false); const [loadingLabel, setLoadingLabel] = useState(''); const [locationSearchVisible, setLocationSearchVisible] = useState(false); const [error, setError] = useState<string | null>(null); const [errorRetryable, setErrorRetryable] = useState(false); const [history, setHistory] = useState<string[]>([]); const [notice, setNotice] = useState<string | null>(null); const [selectionNotice, setSelectionNotice] = useState<string | null>(null); const [addPlaceQuery, setAddPlaceQuery] = useState(''); const [addPlaceResults, setAddPlaceResults] = useState<CatalogSearchCandidate[]>([]); const [addPlaceSearching, setAddPlaceSearching] = useState(false); const [addPlaceSearchError, setAddPlaceSearchError] = useState<string | null>(null);
  const askIntent = proposal && !isGuidedProposal(proposal) ? proposal.intent : null;
  const guidedProposal = isGuidedProposal(proposal) ? proposal : null;
  useEffect(() => { if (active && !state) { setState(active.itinerary); setScreen('finalized'); } }, [active, state]);
  const autoSubmittedRequestIds = useRef(new Set<string>());
  const addingStopRef = useRef(false);
  const selectionTransitionRef = useRef(false);
  const guidedGenerationController = useRef<AbortController | null>(null);
  const currentStage = state?.stages[stageIndex];
  const origin = useMemo(() => state ? stageOrigin(state, stageIndex) : null, [stageIndex, state]);
  const currentCandidateKey = currentStage && origin && state ? `${currentStage.id}:${stageOriginKey(state, stageIndex)}:${origin.latitude}:${origin.longitude}:${selectedPlaceExclusionKey(state, currentStage.id)}` : null;
  useEffect(() => {
    if (!guidedPlanProposal) return;
    const next = consumeGuidedPlanProposal();
    if (!next) return;
    const apply = () => {
      setProposal(next);
      setState(next.state);
      setHistory([]);
      setActiveRequest(null);
      setError(null); setErrorRetryable(false);
      setNotice(null);
      setLoading(false); setLoadingLabel('');
      setScreen('proposal');
    };
    if (!active) { apply(); return; }
    Alert.alert(START_OVER_TITLE, 'Starting a new plan will remove this finalized itinerary and its progress.', startOverConfirmation(() => {
      void executionStore.clear(active.execution.itineraryId).then((cleared) => {
        if (cleared) apply();
        else setError('The current itinerary could not be cleared. Your guided proposal is still available after you try again.');
      });
    }));
  }, [active, consumeGuidedPlanProposal, executionStore, guidedPlanProposal]);
  useEffect(() => { if ((screen === 'review' || screen === 'finalized') && state) logWiseBudget('review', state.budgetMinor); }, [screen, state]);
  useEffect(() => () => { guidedGenerationController.current?.abort(); guidedGenerationController.current = null; }, []);
  useEffect(() => { if (screen !== 'add-category') addingStopRef.current = false; }, [screen]);
  useEffect(() => { if (screen === 'initial') { selectionTransitionRef.current = false; setSelectionTransition(null); } }, [screen]);
  useEffect(() => {
    if (!selectionTransition || !state) return;
    const transition = setTimeout(() => {
      selectionTransitionRef.current = false;
      const selectedIndex = state.stages.findIndex((stage) => stage.id === selectionTransition.stageId);
      setSelectionTransition(null);
      const next = guidedSelectionTransition(selectedIndex, state.stages.length, selectionTransition.returnToReview);
      if (next.kind === 'review') setScreen('review'); else setStageIndex(next.stageIndex);
    }, 380);
    return () => clearTimeout(transition);
  }, [selectionTransition, state]);
  const resolveExplicitLocation = async (query: string) => { const result = (await Location.geocodeAsync(query))[0]; return result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude) ? { coordinates: { latitude: result.latitude, longitude: result.longitude }, label: query, source: 'location-search' as const } : null; };
  const fetchProposal = useCallback(async (intent: AskWiseIntent, previous: readonly string[], requestText: string) => {
    setLoading(true); setLoadingLabel('Resolving your location…'); setError(null); setErrorRetryable(false); setNotice(null);
    const resolved = await resolvePlanLocation({ explicitLocation: intent.location, currentLocation: location.selection, requestCurrentLocation: location.requestCurrentLocation, resolveExplicitLocation }).catch(() => ({ selection: null, reason: 'unavailable' as const }));
    if (!resolved.selection) { setLoading(false); setLoadingLabel(''); setError(resolved.reason === 'explicit-unavailable' ? 'We couldn’t find ' + intent.location + '. Choose another location to continue.' : 'Wise needs your location to build this plan.'); return; }
    setLoadingLabel('Building your plan…');
    try { const anchor = await resolveNamedCatalogPlace({ prompt: requestText, localityHint: intent.location ?? resolved.selection.label, coordinates: resolved.selection.coordinates, budgetMinor: intent.budgetMinor, partySize: intent.partySize ?? 1, search: searchCatalogPlaces }).catch(() => null); const next = await buildWiseProposal({ intent, start: { ...resolved.selection.coordinates, label: resolved.selection.label }, anchor, excludedCombinations: previous.flatMap((key) => key.split('|')), fetcher: (input) => isFoodStage(input.categoryCodes) ? fetchPlanningNearbyPlaces({ ...input, radiusMeters: 5000, resultLimit: STAGE_CANDIDATE_POOL_LIMIT, foodFocus: intent.foodFocus }) : fetchPricedNearbyPlaces({ ...input, radiusMeters: 5000, resultLimit: 30 }) }); logWiseBudget('proposal', next.state.budgetMinor); setProposal(next); setState(next.state); setScreen('proposal'); } catch { setError('We couldn’t build a grounded plan right now. You can still explore places manually.'); } finally { setLoading(false); setLoadingLabel(''); }
  }, [location.requestCurrentLocation, location.selection]);
  const begin = useCallback(async (submittedPrompt = prompt) => {
    const exactPrompt = submittedPrompt.trim(); if (loading || loadFailed || !exactPrompt) return;
    setHistory([]); setProposal(null); setLoading(true); setLoadingLabel('Understanding your plan…'); setError(null); setErrorRetryable(false);
    const intent = await parseAskWise(exactPrompt).catch(() => null);
    if (!intent) { setLoading(false); setLoadingLabel(''); setError('Ask Wise isn’t available right now. You can still explore places manually.'); return; }
    setActiveRequest(exactPrompt); await fetchProposal(intent, [], exactPrompt);
  }, [fetchProposal, loadFailed, loading, prompt]);
  useEffect(() => {
    if (loadFailed) return;
    if (!pendingWiseRequest || autoSubmittedRequestIds.current.has(pendingWiseRequest.id)) return;
    const request = consumePendingWiseRequest(pendingWiseRequest.id); if (!request) return;
    autoSubmittedRequestIds.current.add(request.id);
    const replace = async () => {
      if (!await executionStore.clear(active?.execution.itineraryId)) return;
      setState(null); setScreen('initial'); clearAlternatives();
      setPrompt(request.prompt); void begin(request.prompt);
    };
    if (active) Alert.alert(START_OVER_TITLE, 'Starting a new plan will remove this finalized itinerary and its progress.', startOverConfirmation(() => { void replace(); }));
    else { setPrompt(request.prompt); void begin(request.prompt); }
  }, [active, begin, clearAlternatives, consumePendingWiseRequest, executionStore, loadFailed, pendingWiseRequest]);
  const runGuidedGeneration = async (request: GeneratePlanRequestV1, nextHistory: readonly string[]) => {
    if (guidedGenerationController.current) return;
    const controller = new AbortController();
    guidedGenerationController.current = controller;
    setLoading(true); setLoadingLabel('Building your outing…'); setError(null); setErrorRetryable(false); setNotice(null);
    let result: GuidedPlanGenerationResult;
    try {
      result = await guidedPlanGeneration.generate(request, controller.signal);
    } catch {
      if (guidedGenerationController.current !== controller) return;
      guidedGenerationController.current = null;
      setError('Wise is temporarily unavailable. Your guided choices are still here. Try again.');
      setErrorRetryable(true); setLoading(false); setLoadingLabel('');
      return;
    }
    if (guidedGenerationController.current !== controller) return;
    guidedGenerationController.current = null;
    if (result.kind === 'transport_error') {
      if (result.error.kind !== 'aborted') { setError(result.error.retryable ? 'Wise is temporarily unavailable. Your guided choices are still here. Try again.' : 'Wise could not build this outing. Review your guided choices and try again.'); setErrorRetryable(result.error.retryable); }
      setLoading(false); setLoadingLabel('');
      return;
    }
    if (result.response.outcome === 'proposal' || result.response.outcome === 'partial_plan') {
      const next = adaptGuidedPlanProposal(result.response, request);
      setProposal(next); setState(next.state); setHistory([...nextHistory]); setErrorRetryable(false); setScreen('proposal');
      setLoading(false); setLoadingLabel('');
      return;
    }
    const response = result.response;
    const message = response.outcome === 'clarification_needed'
      ? (response.issues[0]?.code === 'strict_budget_impossible' ? 'This outing needs a budget adjustment before Wise can build it.' : 'Review your guided choices before trying again.')
      : response.outcome === 'no_plan'
        ? 'We couldn’t build another outing with these choices. Your current proposal is still here.'
        : response.outcome === 'error' && response.error.retryable
          ? 'Wise is temporarily unavailable. Your guided choices are still here. Try again.'
          : 'Wise could not build this outing. Review your guided choices and try again.';
    setError(message); setErrorRetryable(response.outcome === 'no_plan' || (response.outcome === 'error' && response.error.retryable)); setLoading(false); setLoadingLabel('');
  };
  const retryGuided = async () => {
    if (!isGuidedProposal(proposal)) return;
    await runGuidedGeneration(proposal.request, history);
  };
  const tryAnother = async () => {
    if (!proposal) return;
    if (!isGuidedProposal(proposal)) {
      const nextHistory = [...history, proposal.historyKey]; setHistory(nextHistory); await fetchProposal(proposal.intent, nextHistory, activeRequest ?? prompt);
      return;
    }
    const nextHistory = [...history, proposal.historyKey];
    const ordinal = Math.min(4, (proposal.request.attempt?.ordinal ?? 0) + 1);
    const request: GeneratePlanRequestV1 = {
      ...proposal.request,
      attempt: {
        ordinal,
        excludedCombinations: nextHistory.flatMap((key) => key.split('|')).slice(-6),
      },
    };
    await runGuidedGeneration(request, nextHistory);
  };
  useEffect(() => {
    if (screen !== 'add-category' || !state) return;
    const query = addPlaceQuery.trim();
    if (!query) { setAddPlaceResults([]); setAddPlaceSearching(false); setAddPlaceSearchError(null); return; }
    let active = true;
    const timeout = setTimeout(() => {
      setAddPlaceSearching(true); setAddPlaceSearchError(null);
      const latestStop = state.stops.at(-1)?.place;
      void searchCatalogPlaces({
        query,
        coordinates: nextStageOrigin(state),
        localityHint: latestStop?.city ?? state.start.label,
        budgetMinor: remainingBudget(state).conservativeMinor,
        partySize: state.partySize,
        resultLimit: 12,
      }).then((results) => { if (active) setAddPlaceResults(guidedProposal ? results.filter((place) => guidedCandidateAllowed({ intent: guidedProposal.intent, state, origin: nextStageOrigin(state) }, place as PricedNearbyPlace)) : results); })
        .catch(() => { if (active) { setAddPlaceResults([]); setAddPlaceSearchError('We couldn’t search the catalog right now. Try again.'); } })
        .finally(() => { if (active) setAddPlaceSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timeout); };
  }, [addPlaceQuery, guidedProposal, screen, state]);
  useEffect(() => {
    if (screen !== 'guided' || !state || !currentStage || !origin) return;
    // Ask Wise retains its existing budget gate: proposal?.intent.budgetMinor === null ? null : remaining.conservativeMinor ?? state.budgetMinor
    let active = true; setLoading(true); setError(null); setSelectionNotice(null); setCandidateStageKey(null); setCandidatePool([]); setHighlightedId(null); const remaining = remainingBudget(state); const guided = Boolean(guidedProposal); const rankingContext = stageRankingContextFromProposal(proposal, stageActivityFocus(currentStage)); const budgetMinor = guided ? state.budgetMinor : askIntent?.budgetMinor === null ? null : remaining.conservativeMinor ?? state.budgetMinor;
    const radiusMeters = guidedProposal?.intent.location.geography.kind === 'radius' ? guidedProposal.intent.location.geography.radiusMeters : 5000;
    const request = isFoodStage(currentStage.categoryCodes)
      ? fetchPlanningNearbyPlaces({ coordinates: origin, radiusMeters, categoryCodes: [...currentStage.categoryCodes], resultLimit: STAGE_CANDIDATE_POOL_LIMIT, budgetMinor, partySize: state.partySize, foodFocus: guided ? rankingContext.foodFocus : askIntent?.foodFocus })
      : fetchPricedNearbyPlaces({ coordinates: origin, radiusMeters, categoryCodes: [...currentStage.categoryCodes], resultLimit: STAGE_CANDIDATE_POOL_LIMIT, budgetMinor, partySize: state.partySize });
    void request.then((result) => {
      if (!active) return; const compatible = guidedProposal ? result.filter((place) => guidedCandidateAllowed({ intent: guidedProposal.intent, state, stage: currentStage, origin }, place)) : result; const eligible = filterCandidatesForStage(state, currentStage.id, compatible); const ranked = orderStageCandidates(currentStage.categoryCodes, eligible, rankingContext); if (isFoodStage(currentStage.categoryCodes)) logFoodPipeline(currentStage.id, result, eligible, rankingContext); setCandidatePool(ranked); setCandidateStageKey(currentCandidateKey);
      const selected = state.stops.find((stop) => stop.stageId === currentStage.id)?.place.place_id; setHighlightedId(selected ?? ranked[0]?.place_id ?? null);
    }).catch(() => active && setError('We couldn’t load suggestions right now. Try again in a moment.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  // A current-stage selection changes the next stage's origin, not this request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateRefreshKey, currentCandidateKey, currentStage, askIntent?.activityFocus, askIntent?.budgetMinor, askIntent?.explicitQuickService, askIntent?.foodFocus, askIntent?.outingContext, proposal, screen, state?.partySize]);
  const applyGoogleIdentityResults = useCallback((results: readonly GoogleIdentityResult[]) => {
    const mergeState = (current: ItineraryState | null): ItineraryState | null => current ? {
      ...current,
      stops: current.stops.map((stop) => ({ ...stop, place: mergeGoogleIdentityResults([stop.place], results)[0]! })),
    } : current;
    setCandidatePool((current) => mergeGoogleIdentityResults(current, results));
    setState(mergeState);
    setProposal((current) => current ? { ...current, state: mergeState(current.state)! } : current);
  }, []);
  const visibleIdentityCandidates = useMemo(() => {
    if (screen === 'proposal') return proposal?.state.stops.map((stop) => stop.place) ?? [];
    if (screen !== 'guided' || !state || !currentStage) return [];
    const selectedId = state.stops.find((stop) => stop.stageId === currentStage.id)?.place.place_id ?? null;
    const rankingContext = stageRankingContextFromProposal(proposal, stageActivityFocus(currentStage));
    return shortlistWithSelectedCandidate(currentStage.categoryCodes, candidatePool, selectedId, CUSTOMIZE_CANDIDATE_LIMIT, rankingContext);
  }, [candidatePool, currentStage, proposal, screen, state]);
  useEffect(() => {
    void warmVisibleGooglePlaceIdentities(visibleIdentityCandidates, applyGoogleIdentityResults);
  }, [applyGoogleIdentityResults, visibleIdentityCandidates]);
  const updateStop = (place: PricedNearbyPlace, returnAddedStopToReview = false): boolean => {
    if (!currentStage || !state || !isPlaceAvailableForStage(state, currentStage.id, place.place_id) || (guidedProposal && guidedStageIsLocked(guidedProposal.intent, currentStage.id, state, guidedProposal.anchorInclusions)) || !canCommitGuidedSelection(selectionTransitionRef.current)) return false;
    if (guidedProposal) {
      const validation = validateGuidedCandidate({ intent: guidedProposal.intent, state, stage: currentStage, origin: origin ?? undefined }, place);
      if (!validation.valid) {
        setSelectionNotice(validation.message);
        return false;
      }
    }
    setSelectionNotice(null);
    selectionTransitionRef.current = true;
    setState((current) => current ? selectStop(current, currentStage.id, place) : current);
    setCandidatePool((current) => current.some((item) => item.place_id === place.place_id) ? current : [place, ...current]); setHighlightedId(place.place_id);
    setSelectionTransition({ stageId: currentStage.id, placeName: place.name, returnToReview: returnAddedStopToReview && currentStage.source === 'user_added' });
    return true;
  };
  const openStage = (stageId: string) => { if (!state) return; if (guidedProposal && guidedStageIsLocked(guidedProposal.intent, stageId, state, guidedProposal.anchorInclusions)) { setNotice('Must-visit places stay fixed in a Guided Planner outing.'); return; } const index = state.stages.findIndex((stage) => stage.id === stageId); if (index < 0) return; setStageIndex(index); setCandidatePool([]); setHighlightedId(null); setCandidateRefreshKey((key) => key + 1); setScreen('guided'); };
  const removeAddedStage = (stageId: string) => { const removedIndex = state?.stages.findIndex((stage) => stage.id === stageId) ?? -1; const remainingCount = Math.max(0, (state?.stages.length ?? 0) - 1); setState((current) => current ? removeUserStage(current, stageId) : current); if (removedIndex >= 0) setStageIndex((index) => stageIndexAfterRemoval(index, removedIndex, remainingCount)); setCandidatePool([]); setCandidateStageKey(null); setHighlightedId(null); setCandidateRefreshKey((key) => key + 1); if (screen !== 'guided') setScreen('review'); };
  const chooseAddedCategory = (categoryId: AddStopCategoryId) => { if (!state || state.stages.length >= MAX_ITINERARY_STOPS || addingStopRef.current) return; const category = ADD_STOP_CATEGORIES.find((item) => item.id === categoryId); if (guidedProposal && category && !guidedCategoryScopeAllows(guidedProposal.intent, category.categoryCodes)) { setNotice('This category is outside the Guided Planner choices.'); return; } addingStopRef.current = true; const nextIndex = state.stages.length; setState((current) => current ? addUserStage(current, categoryId) : current); setStageIndex(nextIndex); setCandidatePool([]); setCandidateStageKey(null); setHighlightedId(null); setCandidateRefreshKey((key) => key + 1); setScreen('guided'); };
  const addSearchedPlace = (place: CatalogSearchCandidate) => {
    if (!state) return;
    if (state?.stops.some((stop) => stop.place.place_id === place.place_id)) { setAddPlaceSearchError(`${place.name} is already in this itinerary.`); return; }
    if (guidedProposal && !guidedCandidateAllowed({ intent: guidedProposal.intent, state, origin: nextStageOrigin(state) }, place as PricedNearbyPlace)) { setAddPlaceSearchError('This place does not fit the Guided Planner choices.'); return; }
    setState((current) => current ? addCatalogPlace(current, place) : current);
    setNotice(`${place.name} added from the ExploreWise catalog.`);
    setAddPlaceQuery(''); setAddPlaceResults([]); setAddPlaceSearchError(null); setScreen('review');
  };
  const clearPlan = () => Alert.alert(START_OVER_TITLE, active ? 'This will remove your itinerary and all completed or skipped stop progress.' : START_OVER_MESSAGE, startOverConfirmation(() => { guidedGenerationController.current?.abort(); guidedGenerationController.current = null; setLoading(false); setLoadingLabel(''); void (async () => { if (active && !await executionStore.clear(active.execution.itineraryId)) return; const cleared = emptyPlanningSession(); clearAlternatives(); setProposal(null); setState(null); setHistory(cleared.history); setCandidatePool([]); setHighlightedId(null); setStageIndex(0); setNotice(null); setError(null); setErrorRetryable(false); setActiveRequest(null); setPrompt(''); setScreen(cleared.phase); })(); }));
  const locationError = error === 'Wise needs your location to build this plan.' || error?.startsWith('We couldn’t find');
  if (screen === 'initial') return <Shell theme={theme}><Heading eyebrow="PLAN AN OUTING" title="Make the pieces work." subtitle="Wise understands your request; ExploreWise selects real places." /><AskWiseCard prompt={prompt} onChangePrompt={setPrompt} onSubmit={() => void begin()} isLoading={loading} />{loading ? <LoadingCard label={loadingLabel} /> : null}{error ? locationError ? <><StateCard title="Wise needs your location to build this plan." message={error} actionLabel="Use my location" onAction={() => void begin()} /><SecondaryButton label="Choose location" onPress={() => setLocationSearchVisible(true)} /></> : <StateCard title="Ask Wise is unavailable" message={error} actionLabel="Try again" onAction={() => void begin()} /> : null}<ClaySurface elevation="subtle" style={styles.manual}><ThemedText style={Typography.cardTitle}>Prefer to browse?</ThemedText><ThemedText type="small" themeColor="textSecondary">Explore places manually anytime — planning never blocks discovery.</ThemedText></ClaySurface><LocationSearchSheet visible={locationSearchVisible} onClose={() => setLocationSearchVisible(false)} onUseCurrentLocation={() => { setLocationSearchVisible(false); void begin(); }} /></Shell>;
  if (screen === 'proposal' && proposal) return <Shell theme={theme} capturePresentationVisibility><Heading eyebrow="YOUR PROPOSAL" title="Your outing, taking shape." subtitle="A grounded sequence of real ExploreWise places, ready to shape." />{loading ? <LoadingCard label={loadingLabel} /> : <WiseProposalCard proposal={proposal} requestText={activeRequest} busy={loading} onUse={() => { logWiseBudget('itinerary', proposal.state.budgetMinor); setState(proposal.state); setScreen('review'); }} onCustomize={() => { setState(proposal.state); setStageIndex(0); setCandidateRefreshKey((key) => key + 1); setScreen('guided'); }} onTryAnother={() => void tryAnother()} onStartOver={clearPlan} />}{error ? <StateCard title="Plan unavailable" message={error} actionLabel={guidedProposal && errorRetryable ? 'Retry' : undefined} onAction={guidedProposal && errorRetryable ? () => void retryGuided() : undefined} /> : null}</Shell>;
  if (!state) return null;
  if (screen === 'add-category') return <Shell theme={theme}><Heading eyebrow="ADD A STOP" title="Find a place or browse nearby." subtitle="Search every active ExploreWise place by name, or choose a category for nearby suggestions." /><ScreenSection><SectionHeader title="Search ExploreWise" description="Names, accents, punctuation, and small typos are handled." /><ClayInput accessibilityLabel="Search ExploreWise places" autoCapitalize="words" autoCorrect={false} placeholder="Place name" returnKeyType="search" value={addPlaceQuery} onChangeText={setAddPlaceQuery} />{addPlaceSearching ? <LoadingCard label="Searching the catalog…" /> : null}{addPlaceSearchError ? <StateCard title="Place search" message={addPlaceSearchError} /> : null}{!addPlaceSearching && addPlaceQuery.trim() && !addPlaceSearchError && addPlaceResults.length === 0 ? <StateCard title="No confident matches" message="Check the spelling or include more of the place name." /> : null}{addPlaceResults.map((place) => <CustomizeCandidateCard key={place.place_id} place={place} distanceLabel={place.distance_meters === null ? place.city : formatDistance(place.distance_meters)} highlighted={highlightedId === place.place_id} selected={false} onHighlight={() => setHighlightedId(place.place_id)} onSelect={() => addSearchedPlace(place)} />)}</ScreenSection><ScreenSection><SectionHeader title="Browse nearby" description="Choose a category for recommendations from your latest stop." /><View style={styles.categoryChoices}>{ADD_STOP_CATEGORIES.map((category) => <SecondaryButton key={category.id} label={category.label} accessibilityLabel={'Add ' + category.label + ' stop'} onPress={() => chooseAddedCategory(category.id)} />)}</View></ScreenSection><SecondaryButton label="Back" onPress={() => setScreen('review')} /></Shell>;
  if (screen === 'guided') {
    if (selectionTransition && currentStage?.id === selectionTransition.stageId) return <Shell theme={theme}><Heading eyebrow="CUSTOMIZE YOUR PLAN" title={`Customize Stop ${stageIndex + 1}`} subtitle={originSuggestionLabel(origin) ?? ''} /><StageProgress state={state} stageIndex={stageIndex} /><BudgetSummaryCard state={state} /><ClaySurface elevation="raised" style={styles.manual} accessibilityLiveRegion="polite"><Ionicons name="checkmark-circle" size={28} color={theme.accent} /><ThemedText style={Typography.cardTitle}>{selectionTransition.placeName} selected</ThemedText><ThemedText type="small" themeColor="textSecondary">Loading the next step…</ThemedText></ClaySurface><View style={styles.stageActions}><SecondaryButton label="Back" disabled={stageIndex === 0} onPress={() => { selectionTransitionRef.current = false; setSelectionTransition(null); setStageIndex((index) => Math.max(0, index - 1)); }} style={styles.flex} /></View><StartOverAction onPress={clearPlan} /></Shell>;
    if (error) return <Shell theme={theme}><Heading eyebrow="CUSTOMIZE YOUR PLAN" title={`Customize Stop ${stageIndex + 1}`} subtitle={originSuggestionLabel(origin) ?? ''} /><StageProgress state={state} stageIndex={stageIndex} /><StateCard title="Suggestions unavailable" message="We couldn’t load suggestions for this stop. Your existing plan is still intact." actionLabel="Retry" onAction={() => setCandidateRefreshKey((key) => key + 1)} /><View style={styles.stageActions}><SecondaryButton label="Back" disabled={stageIndex === 0} onPress={() => setStageIndex((index) => Math.max(0, index - 1))} style={styles.flex} /></View><StartOverAction onPress={clearPlan} /></Shell>;
    if (!loading && currentStage && candidateStageKey === currentCandidateKey && candidatePool.length === 0) return <Shell theme={theme}><Heading eyebrow="CUSTOMIZE YOUR PLAN" title={`Customize Stop ${stageIndex + 1}`} subtitle={originSuggestionLabel(origin) ?? ''} /><StageProgress state={state} stageIndex={stageIndex} /><StateCard title="No good matches found for this stop." message="Try again or change this stage of your plan." actionLabel="Retry" onAction={() => setCandidateRefreshKey((key) => key + 1)} />{currentStage.source === 'user_added' ? <SecondaryButton label="Remove stop" onPress={() => removeAddedStage(currentStage.id)} /> : null}<View style={styles.stageActions}><SecondaryButton label="Back" disabled={stageIndex === 0} onPress={() => setStageIndex((index) => Math.max(0, index - 1))} style={styles.flex} /><PrimaryButton label={stageIndex === state.stages.length - 1 ? 'Review your plan' : 'Next'} disabled style={styles.flex} /></View><StartOverAction onPress={clearPlan} /></Shell>;
    const selectedId = currentStage ? state.stops.find((stop) => stop.stageId === currentStage.id)?.place.place_id ?? null : null;
    const currentSelectionValid = Boolean(selectedId && candidateStageKey === currentCandidateKey && candidatePool.some((candidate) => candidate.place_id === selectedId));
    const navigation = customizeNavigation(state, stageIndex, { loading, currentSelectionValid });
    const rankingContext = stageRankingContextFromProposal(proposal, currentStage ? stageActivityFocus(currentStage) : null);
    const foodPool = currentStage && isFoodStage(currentStage.categoryCodes) ? buildFoodCandidatePool(candidatePool, rankingContext) : null;
    const shortlist = currentStage ? shortlistWithSelectedCandidate(currentStage.categoryCodes, candidatePool, selectedId, CUSTOMIZE_CANDIDATE_LIMIT, rankingContext) : [];
    const shortlistIds = shortlist.map((place) => place.place_id);
    const distanceOrigin = stageDistanceOrigin(state, stageIndex);
    const viewMore = () => { if (!proposal || !currentStage || !origin) return; openAlternatives({ proposal, state, stage: currentStage, stageIndex, origin, distanceOrigin, candidates: candidatePool, shortlistedIds: shortlistIds, broaderCandidateIds: foodPool?.broader.map((place) => place.place_id) ?? [], explicitFoodFocus: foodPool?.explicitFocus ?? null, selectedId, select: (place) => { updateStop(place); router.back(); } }); router.push('/plan/alternatives' as never); };
    const explicitNoMatch = foodPool?.mode === 'explicit_food_no_match' ? foodPool.explicitFocus : null;
    return <Shell theme={theme} capturePresentationVisibility><Heading eyebrow="CUSTOMIZE YOUR PLAN" title={`Customize Stop ${stageIndex + 1}`} subtitle={originSuggestionLabel(origin) ?? ''} /><StageProgress state={state} stageIndex={stageIndex} /><BudgetSummaryCard state={state} />{selectionNotice ? <StateCard title="Choose another stop" message={selectionNotice} /> : null}{loading ? <LoadingCard label="Matching real places for this stage…" /> : explicitNoMatch ? <><StateCard title={`No strong ${foodFocusLabel(explicitNoMatch)} matches found nearby.`} message="Broader food alternatives are available, but they do not satisfy the explicit request." actionLabel={foodPool?.broader.length ? 'View more options' : undefined} onAction={foodPool?.broader.length ? viewMore : undefined} />{shortlist.length && currentStage ? <CandidateList title="Selected broader alternative" candidates={shortlist} distanceOrigin={distanceOrigin} hasMoreOptions={candidatePool.length > shortlist.length} highlightedId={highlightedId} selectedId={selectedId} onHighlight={setHighlightedId} onSelect={(place) => updateStop(place, currentStage.source === 'user_added')} onViewMore={viewMore} /> : null}</> : currentStage ? <CandidateList title={stageSelectionHeading(currentStage)} candidates={shortlist} distanceOrigin={distanceOrigin} hasMoreOptions={candidatePool.length > shortlist.length} highlightedId={highlightedId} selectedId={selectedId} onHighlight={setHighlightedId} onSelect={(place) => updateStop(place, currentStage.source === 'user_added')} onViewMore={viewMore} /> : null}{currentStage?.source === 'user_added' && selectedId ? <SecondaryButton label="Remove stop" accessibilityLabel={'Remove ' + currentStage.title + ' stop'} onPress={() => removeAddedStage(currentStage.id)} /> : null}<View style={styles.stageActions}><SecondaryButton label="Back" accessibilityLabel="Back to previous Customize stage" disabled={navigation.backDisabled} onPress={() => setStageIndex((index) => Math.max(0, index - 1))} style={styles.flex} /><PrimaryButton label={navigation.review ? 'Done Customizing' : navigation.primaryLabel} accessibilityLabel={navigation.review ? 'Done Customizing' : navigation.primaryLabel} disabled={!navigation.canContinue} onPress={() => navigation.review ? setScreen('review') : setStageIndex((index) => index + 1)} style={styles.flex} /></View><StartOverAction onPress={clearPlan} /></Shell>;
  }
  const execution = state.finalized ? active?.execution : undefined;
  const executionPresentationKey = execution ? JSON.stringify([execution.itineraryId, execution.status, execution.stops.find((stop) => stop.status === 'current')?.id]) : undefined;
  const finalizeCurrentPlan = () => {
    if (guidedProposal) {
      const guidedContext = { intent: guidedProposal.intent, anchorInclusions: guidedProposal.anchorInclusions } as const;
      const validation = validateGuidedItinerary(state, guidedContext);
      if (!validation.valid) {
        setNotice(validation.message);
        return;
      }
      const guidedState = finalizeItinerary(state, guidedContext);
      if (!guidedState) {
        setNotice('This outing still needs a small adjustment before it can be finalized.');
        return;
      }
      const finalized = executionStore.finalize(randomUUID(), guidedState);
      if (!finalized) return;
      setState(finalized.itinerary); clearAlternatives(); setScreen('finalized'); setNotice(null);
      return;
    }
    const finalized = executionStore.finalize(randomUUID(), finalizeItinerary(state));
    if (!finalized) return;
    setState(finalized.itinerary); clearAlternatives(); setScreen('finalized'); setNotice(null);
  };
  const complete = areRequiredStagesComplete(state); const editable = screen === 'review' && !state.finalized; const canAdd = editable && state.stages.length < MAX_ITINERARY_STOPS;
  return <Shell theme={theme} resetScrollKey={executionPresentationKey} bottomAction={execution?.status === 'planned' ? <PrimaryButton label="Start itinerary" accessibilityLabel="Start itinerary" labelNumberOfLines={0} fullWidth style={styles.plannedStart} onPress={() => executionStore.dispatch({ type: 'start', itineraryId: execution.itineraryId })} /> : undefined}>{execution ? <ItineraryProgress execution={execution} /> : <Heading eyebrow="REVIEW YOUR PLAN" title="Check the details." subtitle={notice ?? 'Edit any stop before you finalize.'} />}
    {execution?.status === 'planned' ? <>
      <BudgetSummaryCard state={state} planned />
      <ScreenSection>
        <ThemedText accessibilityRole="header" style={Typography.cardTitle}>Stops on the map</ThemedText>
        <ClayCard variant="subtle" padding="none" style={styles.plannedMap}><ItineraryMap compact start={state.start} candidates={[]} selected={state.stops.map((stop) => stop.place)} highlightedId={null} onPressCandidate={() => {}} /></ClayCard>
      </ScreenSection>
    </> : null}
    {!execution ? <><BudgetSummaryCard state={state} /><ClaySurface style={styles.mapSurface}><ItineraryMap start={state.start} candidates={[]} selected={state.stops.map((stop) => stop.place)} highlightedId={null} onPressCandidate={() => {}} /></ClaySurface><ThemedText accessibilityRole="header" style={Typography.cardTitle}>Your stops</ThemedText></> : null}
    {execution?.status === 'planned' ? <ScreenSection>
      <SectionHeader title="Your stops" />
      <SelectedStops state={state} editable={editable} execution={execution} onProgress={executionStore.dispatch} onRemoveAdded={removeAddedStage} onReplace={openStage} />
    </ScreenSection> : null}
    {!execution ? <SelectedStops state={state} editable={editable} onProgress={executionStore.dispatch} onRemoveAdded={removeAddedStage} onReplace={openStage} /> : null}
    {execution?.status === 'in_progress' ? <>
      <SelectedStops state={state} editable={false} execution={execution} onProgress={executionStore.dispatch} onRemoveAdded={removeAddedStage} onReplace={openStage} />
      <BudgetSummaryCard state={state} compact />
      <ScreenSection><SectionHeader title="Stops on the map" description="Map overview for this itinerary." /><ClaySurface style={styles.mapSurface}><ItineraryMap compact start={state.start} candidates={[]} selected={state.stops.map((stop) => stop.place)} highlightedId={null} onPressCandidate={() => {}} /></ClaySurface></ScreenSection>
      <StartOverAction onPress={clearPlan} />
    </> : null}
    {execution?.status === 'completed' ? <>
      <BudgetSummaryCard state={state} compact />
      <SelectedStops state={state} editable={false} execution={execution} onProgress={executionStore.dispatch} onRemoveAdded={removeAddedStage} onReplace={openStage} />
      {active ? <ItineraryContributions active={active} /> : null}
      <ScreenSection><SectionHeader title="Route recap" description="Your planned stop sequence." /><ClaySurface style={styles.mapSurface}><ItineraryMap compact start={state.start} candidates={[]} selected={state.stops.map((stop) => stop.place)} highlightedId={null} onPressCandidate={() => {}} /></ClaySurface></ScreenSection>
      <SecondaryButton label="Back to Explore" onPress={() => router.navigate('/' as never)} fullWidth />
      <StartOverAction onPress={clearPlan} />
    </> : null}
    {!execution ? <>{canAdd ? <SecondaryButton label="+ Add another stop" accessibilityLabel="Add another stop" onPress={() => { setAddPlaceQuery(''); setAddPlaceResults([]); setAddPlaceSearchError(null); setScreen('add-category'); }} /> : editable ? <ThemedText type="small" themeColor="textSecondary">Maximum of {MAX_ITINERARY_STOPS} stops reached. Remove a manually added stop to add another.</ThemedText> : null}{!complete ? <ThemedText type="small" themeColor="textSecondary">Required stages are incomplete. Add the missing stops before finalizing.</ThemedText> : editable ? <PrimaryButton label="Finalize itinerary" onPress={finalizeCurrentPlan} /> : null}<View style={styles.actions}>{editable ? <SecondaryButton label="Customize" onPress={() => { setStageIndex(0); setScreen('guided'); }} /> : null}<StartOverAction onPress={clearPlan} /></View></> : execution.status === 'planned' ? <View style={styles.actions}><StartOverAction onPress={clearPlan} /></View> : null}</Shell>;
}

function Shell({ children, theme, bottomAction, resetScrollKey, capturePresentationVisibility = false }: { children: React.ReactNode; theme: ReturnType<typeof useTheme>; bottomAction?: React.ReactNode; resetScrollKey?: string; capturePresentationVisibility?: boolean }) {
  const { error, store } = useItineraryExecution();
  const bottomInset = useFloatingTabInset();
  const scrollRef = useRef<ScrollView>(null);
  const [presentationViewport, setPresentationViewport] = useState<PresentationViewport>({ scrollY: 0, viewportHeight: 0 });
  // Starting from a scrolled preview must reveal the current stop immediately.
  useEffect(() => { if (resetScrollKey) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [resetScrollKey]);
  return <presentationViewportContext.Provider value={capturePresentationVisibility ? presentationViewport : null}><View style={[styles.screen, { backgroundColor: theme.background }]}>
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomAction ? Spacing.lg : bottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onLayout={capturePresentationVisibility ? (event) => setPresentationViewport((current) => ({ ...current, viewportHeight: event.nativeEvent.layout.height })) : undefined} onScroll={capturePresentationVisibility ? (event) => setPresentationViewport((current) => ({ ...current, scrollY: event.nativeEvent.contentOffset.y })) : undefined} scrollEventThrottle={capturePresentationVisibility ? 100 : undefined}>
        {error ? <StateCard title="Device storage" message={error} actionLabel="Retry" onAction={() => void store.retry()} /> : null}
        {children}
      </ScrollView>
      {/* Keep the measured CTA above the capsule; its height is reserved by flex layout. */}
      {bottomAction ? <SafeAreaView testID="itinerary-bottom-action" edges={[]} style={[styles.bottomAction, { marginBottom: bottomInset, backgroundColor: theme.elevatedSurface, borderTopColor: theme.border }]}>
        <View style={styles.bottomActionContent}>{bottomAction}</View>
      </SafeAreaView> : null}
    </SafeAreaView>
  </View></presentationViewportContext.Provider>;
}
function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <View style={styles.heading}><ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>{eyebrow}</ThemedText><ThemedText style={Typography.screenHeading}>{title}</ThemedText>{subtitle ? <ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText> : null}</View>; }
function CandidateList({ title, candidates, distanceOrigin, hasMoreOptions, highlightedId, selectedId, onHighlight, onSelect, onViewMore }: { title: string; candidates: PricedNearbyPlace[]; distanceOrigin: StageDistanceOrigin; hasMoreOptions: boolean; highlightedId: string | null; selectedId: string | null; onHighlight: (id: string) => void; onSelect: (place: PricedNearbyPlace) => void; onViewMore: () => void }) {
  const viewport = useContext(presentationViewportContext);
  const [listTop, setListTop] = useState<number | null>(null);
  const [layouts, setLayouts] = useState<Readonly<Record<string, Readonly<{ y: number; height: number }>>> >({});
  const measuredLayouts = useMemo(() => listTop === null ? {} : Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, { y: listTop + layout.y, height: layout.height }])), [layouts, listTop]);
  const presentationCandidates = useMemo(() => {
    const ids = visiblePresentationIds(candidates.map((candidate) => candidate.place_id), viewport, measuredLayouts);
    return ids.map((id) => candidates.find((candidate) => candidate.place_id.toLowerCase() === id.toLowerCase())).filter((candidate): candidate is PricedNearbyPlace => Boolean(candidate));
  }, [candidates, measuredLayouts, viewport]);
  const { presentations, revisionById, refresh } = usePlacePresentations(presentationCandidates, 'thumbnail', { allowGoogle: googlePresentationAllowed('customize') });
  if (!candidates.length) return <StateCard title="No matching places yet" message="Try another location or adjust this stage of your plan." />;
  return <View style={styles.candidateSection} accessibilityLabel={title} onLayout={(event) => setListTop(event.nativeEvent.layout.y)}>
    <SectionHeader title={title} description={`${candidates.length} alternatives to compare`} />
    {candidates.map((place) => <CustomizeCandidateCard key={place.place_id} onLayout={(event) => { const layout = event.nativeEvent.layout; setLayouts((current) => ({ ...current, [place.place_id.toLowerCase()]: { y: layout.y, height: layout.height } })); }} place={place}
      distanceLabel={stageDistanceLabel(distanceOrigin, place)} highlighted={highlightedId === place.place_id}
      selected={selectedId === place.place_id} onHighlight={() => onHighlight(place.place_id)} onSelect={() => onSelect(place)} presentation={presentations.get(place.place_id.toLowerCase())} presentationRevision={revisionById[place.place_id.toLowerCase()] ?? 0} onPresentationImageError={() => refresh(place.place_id)} />)}
    {hasMoreOptions ? <SecondaryButton label="View more options" accessibilityLabel="View more options" onPress={onViewMore} /> : null}
  </View>;
}

function SelectedStops({ state, editable, onRemoveAdded, onReplace, execution, onProgress }: { state: ItineraryState; editable: boolean; onRemoveAdded: (id: string) => void; onReplace: (id: string) => void; execution?: ItineraryExecution; onProgress: (action: ExecutionAction) => void }) { const distances = sequentialStopDistances(state);
  if (execution) {
    // Compute distance and stop numbers in the original plan order before grouping for display.
    const stops = mapStops(state).map((stop, index) => {
      const stopId = executionStopId(stop);
      return { ...stop, stopId, distanceLabel: distances[index]?.label, status: execution.stops.find((item) => item.id === stopId)?.status };
    });
    const renderStops = (items: typeof stops) => items.map(({ place, number, stageId, stopId, distanceLabel, status }, index) => {
      const isCurrent = execution.status === 'in_progress' && status === 'current';
      return <ItineraryStopCard key={stageId} place={place} currencyCode={state.currencyCode} number={number} distanceLabel={distanceLabel} status={status}
        planned={execution.status === 'planned'}
        connectToNext={index < items.length - 1}
        onComplete={isCurrent ? () => onProgress({ type: 'complete', itineraryId: execution.itineraryId, stopId }) : undefined}
        onSkip={isCurrent ? () => onProgress({ type: 'skip', itineraryId: execution.itineraryId, stopId }) : undefined}
        onNavigate={state.finalized && isCurrent ? () => void Linking.openURL(navigationUrl(place)) : undefined} />;
    });
    if (execution.status === 'planned') return <View testID="itinerary-ordered-stops">{renderStops(stops)}</View>;
    if (execution.status === 'completed') {
      const completedStops = stops.filter((stop) => stop.status === 'completed');
      const skippedStops = stops.filter((stop) => stop.status === 'skipped');
      return <View testID="itinerary-ordered-stops" style={styles.completedStops}>
        {completedStops.length ? <View style={styles.stopGroup}><SectionHeader title="Completed stops" description={`${completedStops.length} ${completedStops.length === 1 ? 'stop' : 'stops'} completed`} /><View>{renderStops(completedStops)}</View></View> : null}
        {skippedStops.length ? <View style={styles.stopGroup}><SectionHeader title="Skipped stops" description={`${skippedStops.length} ${skippedStops.length === 1 ? 'stop was' : 'stops were'} skipped`} /><View>{renderStops(skippedStops)}</View></View> : null}
      </View>;
    }
    const upcoming = stops.filter((stop) => stop.status === 'upcoming');
    const earlier = stops.filter((stop) => stop.status === 'completed' || stop.status === 'skipped');
    return <View style={styles.liveStops}>
      <View accessibilityLiveRegion="polite">{renderStops(stops.filter((stop) => stop.status === 'current'))}</View>
      {upcoming.length ? <View testID="itinerary-upcoming" style={styles.stopGroup}><SectionHeader title="Up next" description={`${upcoming.length} ${upcoming.length === 1 ? 'stop' : 'stops'} remaining`} /><View>{renderStops(upcoming)}</View></View> : null}
      {earlier.length ? <View testID="itinerary-earlier" style={styles.stopGroup}><ThemedText accessibilityRole="header" style={Typography.cardTitle} themeColor="textSecondary">Earlier stops</ThemedText><View>{renderStops(earlier)}</View></View> : null}
    </View>;
  }
  return <View style={styles.candidates}>{mapStops(state).map(({ place, number, stageId }, index) => { const stage = state.stages.find((item) => item.id === stageId); return <View key={stageId} style={styles.candidates}><ItineraryStopCard place={place} currencyCode={state.currencyCode} number={number} distanceLabel={distances[index]?.label} onRemove={editable && stage?.source === 'user_added' ? () => onRemoveAdded(stageId) : undefined} />{editable ? <SecondaryButton label={stage?.source === 'user_added' ? 'Change ' + place.name : 'Replace ' + place.name} onPress={() => onReplace(stageId)} /> : null}</View>; })}</View>;
}
const styles = StyleSheet.create({ liveStops: { gap: Spacing.lg }, completedStops: { gap: Spacing.lg }, stopGroup: { gap: Spacing.sm }, screen: { flex: 1 }, safe: { flex: 1 }, scroll: { flex: 1 },
  plannedStart: { borderRadius: Radius.pill },
  plannedMap: { overflow: 'hidden' },
  // Footer space is reserved by flex layout; padding gives the final stop breathing room.
  contentWithBottomAction: { paddingBottom: Spacing.lg },
  bottomAction: { flexShrink: 0, borderTopWidth: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  bottomActionContent: { alignSelf: 'center', maxWidth: MaxContentWidth, width: '100%' },
  content: { alignSelf: 'center', gap: Spacing.lg, maxWidth: MaxContentWidth, paddingBottom: Spacing.six, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, width: '100%' }, heading: { gap: Spacing.xs }, eyebrow: { fontSize: 11, letterSpacing: 1.1 }, manual: { gap: Spacing.xs }, mapSurface: { padding: 0, overflow: 'hidden', borderRadius: Radius.media }, candidates: { gap: Spacing.sm }, candidateSection: { gap: Spacing.sm }, candidateHeading: { gap: Spacing.xs }, carouselContent: { paddingRight: Spacing.md }, candidate: { gap: Spacing.sm, marginRight: Spacing.sm }, candidateFrame: { marginRight: Spacing.sm }, candidateCopy: { gap: Spacing.xs, minHeight: 138 }, actions: { gap: Spacing.sm }, stageActions: { flexDirection: 'row', gap: Spacing.sm }, flex: { flex: 1 }, categoryChoices: { gap: Spacing.sm } });
