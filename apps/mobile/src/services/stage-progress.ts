/** Center the active step when the progress row exceeds a narrow viewport. */
export function stageProgressItemWidth(_stageCount: number) { return 104; }

export function stageProgressOffset(stageIndex: number, stageCount: number, viewportWidth: number) {
  const itemWidth = stageProgressItemWidth(stageCount);
  return Math.max(0, stageIndex * itemWidth - Math.max(0, viewportWidth - itemWidth) / 2);
}
