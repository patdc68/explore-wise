/** Stable deterministic ordering primitives shared by mobile and server planners. */
export function stableSortBy<T>(items: readonly T[], compare: (left: T, right: T) => number): T[] {
  return items
    .map((value, index) => ({ value, index }))
    .sort((left, right) => compare(left.value, right.value) || left.index - right.index)
    .map(({ value }) => value);
}

/** Score descending with a caller-owned secondary comparison and stable ties. */
export function rankByScore<T>(items: readonly T[], score: (item: T) => number, tieBreak?: (left: T, right: T) => number): T[] {
  return stableSortBy(items, (left, right) => score(right) - score(left) || tieBreak?.(left, right) || 0);
}

export function uniqueByKey<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const identity = key(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }
  return result;
}

/** Round-robin family diversity while retaining the input order inside each family. */
export function roundRobinByKey<T>(items: readonly T[], key: (item: T) => string): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const family = key(item);
    const bucket = buckets.get(family) ?? [];
    bucket.push(item);
    buckets.set(family, bucket);
  }
  const families = [...buckets.keys()];
  const result: T[] = [];
  for (let index = 0; result.length < items.length; index += 1) {
    for (const family of families) {
      const bucket = buckets.get(family);
      if (bucket && index < bucket.length) result.push(bucket[index]);
    }
  }
  return result;
}

/** Put the first member of each key group ahead of later repeats. */
export function deferRepeatedKeys<T>(items: readonly T[], key: (item: T) => string | null): T[] {
  const first: T[] = [];
  const repeats: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const identity = key(item);
    if (identity !== null && seen.has(identity)) repeats.push(item);
    else {
      if (identity !== null) seen.add(identity);
      first.push(item);
    }
  }
  return [...first, ...repeats];
}
