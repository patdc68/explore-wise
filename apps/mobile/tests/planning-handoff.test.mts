import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { consumePendingWiseRequest, pendingWiseRequest } from '../src/services/planning-session.ts';

test('Explore pending request preserves the exact text and is consumed exactly once', () => {
  const prompt = 'Four friends in BGC tonight';
  const pending = pendingWiseRequest('explore-1', prompt);
  const ignored = consumePendingWiseRequest(pending, 'different-request');
  assert.equal(ignored.request, null);
  assert.equal(ignored.pending?.prompt, prompt);
  const consumed = consumePendingWiseRequest(ignored.pending, pending.id);
  assert.deepEqual(consumed, { request: pending, pending: null });
  assert.deepEqual(consumePendingWiseRequest(consumed.pending, pending.id), { request: null, pending: null });
});

test('Explore submits the editable prompt through the shared handoff; Plan consumes it without route-param replay', () => {
  const explore = readFileSync(new URL('../src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  const provider = readFileSync(new URL('../src/providers/planning-handoff-provider.tsx', import.meta.url), 'utf8');
  assert.match(explore, /submitFromExplore\(submittedPrompt\)/);
  assert.match(explore, /onChangePrompt=\{setWisePrompt\} onSubmit=\{\(\) => submitWise\(wisePrompt\)\}/);
  assert.doesNotMatch(explore, /onSuggestionSubmit/);
  assert.match(plan, /const \[prompt, setPrompt\] = useState\(''\)/);
  assert.match(plan, /consumePendingWiseRequest\(pendingWiseRequest\.id\)/);
  assert.match(plan, /setPrompt\(request\.prompt\)/);
  assert.match(plan, /void begin\(request\.prompt\)/);
  assert.match(plan, /autoSubmittedRequestIds\.current\.add\(request\.id\)/);
  assert.doesNotMatch(plan, /useLocalSearchParams|params\.prompt/);
  assert.match(provider, /pendingRef\.current = consumed\.pending/);
});

test('handoff failures leave the exact Plan input available for retry and normal tab navigation has no automatic old prompt', () => {
  const plan = readFileSync(new URL('../src/app/(tabs)/plan.tsx', import.meta.url), 'utf8');
  assert.match(plan, /const exactPrompt = submittedPrompt\.trim\(\)/);
  assert.match(plan, /parseAskWise\(exactPrompt\)/);
  assert.doesNotMatch(plan, /setPrompt\(''\).*Ask Wise isn/);
  assert.match(plan, /if \(!pendingWiseRequest \|\| autoSubmittedRequestIds\.current\.has\(pendingWiseRequest\.id\)\) return/);
  assert.match(plan, /proposal\?\.intent\.budgetMinor === null \? null : remaining\.conservativeMinor \?\? state\.budgetMinor/);
});
