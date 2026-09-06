import assert from 'node:assert/strict';
import test from 'node:test';

import { canCommitGuidedSelection, guidedSelectionTransition } from '../src/services/guided-selection.ts';

test('required intermediate selection advances exactly one stage without a Next action', () => {
  assert.deepEqual(guidedSelectionTransition(0, 2, false), { kind: 'stage', stageIndex: 1 });
});

test('final required and user-added selections go directly to Review', () => {
  assert.deepEqual(guidedSelectionTransition(1, 2, false), { kind: 'review' });
  assert.deepEqual(guidedSelectionTransition(2, 5, true), { kind: 'review' });
});

test('optional stages can skip through normal progression while selected stages still advance', () => {
  assert.deepEqual(guidedSelectionTransition(1, 3, false), { kind: 'stage', stageIndex: 2 });
});

test('five-stage selection flow advances one stage at a time and ends at Review', () => {
  for (let index = 0; index < 4; index += 1) assert.deepEqual(guidedSelectionTransition(index, 5, false), { kind: 'stage', stageIndex: index + 1 });
  assert.deepEqual(guidedSelectionTransition(4, 5, false), { kind: 'review' });
});

test('a pending selection transition rejects a double tap', () => {
  assert.equal(canCommitGuidedSelection(false), true);
  assert.equal(canCommitGuidedSelection(true), false);
});
