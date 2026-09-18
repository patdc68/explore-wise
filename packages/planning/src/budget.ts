import type { PlanningIntent } from './intent.ts';
import { PLANNER_POLICY } from './policy.ts';

export type BudgetStatus = 'fits' | 'likely_fits' | 'may_exceed' | 'exceeds' | 'likely_exceeds' | 'unknown';

export type PriceEvidenceInput = Readonly<{
  has_price: boolean;
  pricing_basis?: string | null;
  estimated_group_min_minor: number | null;
  estimated_group_max_minor: number | null;
  currency_code?: string | null;
}>;

export type PriceEvidenceClassification = Readonly<{
  kind: 'known' | 'unknown';
  reason: 'known' | 'missing' | 'invalid' | 'currency_mismatch' | 'currency_missing';
  currencyCode: string | null;
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
}>;

export type NormalizedBudget = Readonly<{
  amountMinor: number;
  totalAmountMinor: number;
  currencyCode: string;
  basis: PlanningIntent['budget']['basis'];
  strictness: PlanningIntent['budget']['strictness'];
  unknownPricePolicy: PlanningIntent['budget']['unknownPricePolicy'];
  partySize: number;
}>;

export type SelectedPriceSummary = Readonly<{
  minAmountMinor: number;
  maxAmountMinor: number;
  uncertain: boolean;
  knownStopCount: number;
  unknownStopCount: number;
}>;

export type CurrencyAwarePriceSummary = SelectedPriceSummary & Readonly<{
  currencyCode: string;
  currencyMismatchStopCount: number;
}>;

const validMinor = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Safe integer multiplication for total/per-person budget normalization. */
export function multiplyMinorUnits(amountMinor: number, multiplier: number): number | null {
  if (!validMinor(amountMinor) || !Number.isSafeInteger(multiplier) || multiplier < 1) return null;
  const result = amountMinor * multiplier;
  return Number.isSafeInteger(result) ? result : null;
}

/** Normalize the user's explicit budget to one total minor-unit cap exactly once. */
export function normalizeBudgetMinor(budget: PlanningIntent['budget'], partySize: number): number | null {
  if (!validMinor(budget.amountMinor) || !Number.isSafeInteger(partySize)
    || partySize < PLANNER_POLICY.partySize.min || partySize > PLANNER_POLICY.partySize.max) return null;
  return budget.basis === 'total' ? budget.amountMinor : multiplyMinorUnits(budget.amountMinor, partySize);
}

export function normalizeBudget(budget: PlanningIntent['budget'], partySize: number): NormalizedBudget | null {
  const totalAmountMinor = normalizeBudgetMinor(budget, partySize);
  if (totalAmountMinor === null) return null;
  return {
    amountMinor: budget.amountMinor,
    totalAmountMinor,
    currencyCode: budget.currencyCode,
    basis: budget.basis,
    strictness: budget.strictness,
    unknownPricePolicy: budget.unknownPricePolicy,
    partySize,
  };
}

/** Unknown or differently denominated evidence is never treated as zero/free. */
export function classifyPriceEvidence(place: PriceEvidenceInput, expectedCurrencyCode?: string | null): PriceEvidenceClassification {
  const currencyCode = place.currency_code?.toUpperCase() ?? null;
  if (!place.has_price || !validMinor(place.estimated_group_min_minor) || !validMinor(place.estimated_group_max_minor)
    || place.estimated_group_max_minor < place.estimated_group_min_minor) {
    return { kind: 'unknown', reason: place.has_price ? 'invalid' : 'missing', currencyCode, minAmountMinor: null, maxAmountMinor: null };
  }
  if (expectedCurrencyCode !== undefined && expectedCurrencyCode !== null) {
    const expected = expectedCurrencyCode.toUpperCase();
    if (!currencyCode) return { kind: 'unknown', reason: 'currency_missing', currencyCode, minAmountMinor: null, maxAmountMinor: null };
    if (currencyCode !== expected) return { kind: 'unknown', reason: 'currency_mismatch', currencyCode, minAmountMinor: null, maxAmountMinor: null };
  }
  return { kind: 'known', reason: 'known', currencyCode, minAmountMinor: place.estimated_group_min_minor, maxAmountMinor: place.estimated_group_max_minor };
}

/** Preserve the existing RPC status semantics while making them reusable by generation. */
export function classifyBudgetStatus(
  place: PriceEvidenceInput,
  budgetMinor: number | null | undefined,
  expectedCurrencyCode?: string | null,
): BudgetStatus {
  if (budgetMinor === null || budgetMinor === undefined || !validMinor(budgetMinor)) return 'unknown';
  const evidence = classifyPriceEvidence(place, expectedCurrencyCode);
  if (evidence.kind === 'unknown') return 'unknown';
  const exact = place.pricing_basis === 'branch_verified';
  if (evidence.maxAmountMinor! <= budgetMinor) return exact ? 'fits' : 'likely_fits';
  if (evidence.minAmountMinor! > budgetMinor) return exact ? 'exceeds' : 'likely_exceeds';
  return 'may_exceed';
}

/** Exact compatibility shape used by the existing mobile budget summary. */
export function summarizeSelectedPrices(stops: readonly Readonly<{ place: PriceEvidenceInput }>[]): SelectedPriceSummary {
  let min = 0;
  let max = 0;
  let uncertain = false;
  let knownStopCount = 0;
  let unknownStopCount = 0;
  for (const { place } of stops) {
    // Compatibility semantics intentionally mirror the existing mobile
    // itinerary summary: only missing/unknown ranges are uncertain.  Trusted
    // server generation performs the stricter safe-integer classification.
    if (!place.has_price || place.estimated_group_min_minor === null || place.estimated_group_max_minor === null) {
      uncertain = true;
      unknownStopCount += 1;
      continue;
    }
    knownStopCount += 1;
    min += place.estimated_group_min_minor;
    max += place.estimated_group_max_minor;
  }
  return { minAmountMinor: min, maxAmountMinor: max, uncertain, knownStopCount, unknownStopCount };
}

export function summarizeCurrencyAwarePrices(
  stops: readonly Readonly<{ place: PriceEvidenceInput }>[],
  currencyCode: string,
): CurrencyAwarePriceSummary {
  let min = 0;
  let max = 0;
  let uncertain = false;
  let knownStopCount = 0;
  let unknownStopCount = 0;
  let currencyMismatchStopCount = 0;
  for (const { place } of stops) {
    const evidence = classifyPriceEvidence(place, currencyCode);
    if (evidence.kind === 'unknown') {
      uncertain = true;
      unknownStopCount += 1;
      if (evidence.reason === 'currency_mismatch' || evidence.reason === 'currency_missing') currencyMismatchStopCount += 1;
      continue;
    }
    knownStopCount += 1;
    min += evidence.minAmountMinor!;
    max += evidence.maxAmountMinor!;
  }
  return { currencyCode, minAmountMinor: min, maxAmountMinor: max, uncertain, knownStopCount, unknownStopCount, currencyMismatchStopCount };
}
