export function summarizeLoadProgress(completedBatches: readonly number[], appliedThisInvocation: readonly number[]): object {
  const applied = new Set(appliedThisInvocation);
  return {
    completed: [...completedBatches].sort((a, b) => a - b),
    appliedThisInvocation: [...appliedThisInvocation].sort((a, b) => a - b),
    alreadyCompleted: completedBatches.filter((batch) => !applied.has(batch)).sort((a, b) => a - b),
  };
}
