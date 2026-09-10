import { areRequiredStagesComplete, stageSelectionConstraint, type ItineraryStage, type ItineraryState } from './itinerary.ts';
import { isActivityStage, isFoodStage } from './food-candidate-diversity.ts';

/** Copy owned by the focused Customize stage, never by a raw stage identifier. */
export function stageSelectionHeading(stage: Pick<ItineraryStage, 'title' | 'categoryCodes' | 'source' | 'selectionConstraint'>): string {
  const constraint = stageSelectionConstraint(stage);
  if (constraint === 'cafe') return 'Choose a caf' + String.fromCharCode(233);
  if (constraint === 'dinner') return 'Choose a dinner spot';
  if (constraint === 'dessert') return 'Choose a dessert spot';
  if (constraint === 'food') return 'Choose a food spot';
  if (constraint === 'cinema') return 'Choose a cinema';
  if (constraint === 'recreation') return 'Choose a recreation spot';
  if (constraint === 'museum' || constraint === 'attraction') return 'Choose an attraction';
  if (constraint === 'outdoor') return 'Choose an outdoor spot';
  if (constraint === 'entertainment' || constraint === 'auditorium') return 'Choose an entertainment option';
  if (constraint === 'generic_activity') return 'Choose something fun';
  const codes = stage.categoryCodes;
  const title = stage.title.trim().toLowerCase();
  if (stage.source === 'user_added') {
    if (title.includes('entertainment')) return 'Choose entertainment';
    if (title.includes('cinema')) return 'Choose a cinema';
    if (codes.some((code) => code === 'food.cafe')) return 'Choose a cafÃ©';
    if (codes.some((code) => code === 'food.dessert' || code === 'food.bakery')) return 'Choose a dessert spot';
    if (codes.some((code) => code === 'food.restaurant' || code === 'food')) return title.includes('restaurant') ? 'Choose a restaurant' : 'Choose a food spot';
    if (codes.some((code) => code === 'entertainment.cinema')) return 'Choose a cinema';
    if (codes.some((code) => code === 'entertainment')) return 'Choose entertainment';
    if (codes.some((code) => code.startsWith('outdoor'))) return 'Choose an outdoor spot';
    if (codes.some((code) => code.startsWith('attraction'))) return 'Choose an attraction';
    return 'Choose something fun';
  }
  if (title.includes('coffee') || title.includes('café') || title.includes('cafe')) return 'Choose a café';
  if (codes.some((code) => code === 'food' || code.startsWith('food.'))) {
    if (title.includes('dinner')) return 'Choose a dinner spot';
    if (title.includes('lunch')) return 'Choose a lunch spot';
    if (title.includes('breakfast')) return 'Choose a breakfast spot';
    return 'Choose a food spot';
  }
  if (codes.length > 0 && codes.every((code) => code.startsWith('attraction'))) return 'Choose an attraction';
  if (codes.some((code) => code.startsWith('activity') || code === 'entertainment' || code.startsWith('outdoor') || code.startsWith('attraction'))) return 'Choose something fun';
  return 'Choose a place';
}

export function originSuggestionLabel(origin: { label?: string | null } | null | undefined): string | null {
  const label = origin?.label?.trim();
  return label ? `Suggestions near ${label}` : null;
}

/** Human copy for the expanded browse route; stages remain an implementation detail. */
export function alternativesTitle(stage: Pick<ItineraryStage, 'title' | 'categoryCodes'>): string {
  const title = stage.title.trim().toLowerCase();
  if (isFoodStage(stage.categoryCodes)) {
    if (title.includes('dinner')) return 'More dinner options';
    if (title.includes('coffee') || title.includes('cafÃ©') || title.includes('cafe')) return 'More cafÃ© options';
    return 'More restaurant options';
  }
  if (isActivityStage(stage.categoryCodes)) return 'More things to do';
  return 'More options';
}

export function customizeNavigation(state: ItineraryState, stageIndex: number, options: Readonly<{ loading?: boolean; currentSelectionValid?: boolean }> = {}) {
  const current = state.stages[stageIndex];
  const automaticRequiredStage = Boolean(current?.required);
  const currentSelected = Boolean(current && state.stops.some((stop) => stop.stageId === current.id));
  const laterRequired = state.stages.slice(stageIndex + 1).some((stage) => stage.required);
  const review = !laterRequired;
  const selectionValid = options.currentSelectionValid ?? currentSelected;
  const canContinue = Boolean(current) && !options.loading && (automaticRequiredStage ? currentSelected && selectionValid : review ? areRequiredStagesComplete(state) : currentSelected);
  return {
    backDisabled: stageIndex === 0,
    canContinue,
    primaryLabel: options.loading ? 'Finding places…' : automaticRequiredStage ? currentSelected && selectionValid ? review ? 'Review your plan' : 'Next' : 'Select a place' : 'Skip',
    review,
  };
}
