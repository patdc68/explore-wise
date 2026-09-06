export type GuidedSelectionTransition = Readonly<{ kind: 'stage'; stageIndex: number }> | Readonly<{ kind: 'review' }>;

/** One committed tap advances exactly one stage, unless it completes a manual or final stop. */
export function guidedSelectionTransition(stageIndex: number, stageCount: number, returnToReview: boolean): GuidedSelectionTransition {
  return returnToReview || stageIndex >= stageCount - 1 ? { kind: 'review' } : { kind: 'stage', stageIndex: stageIndex + 1 };
}

export function canCommitGuidedSelection(transitionPending: boolean) { return !transitionPending; }
