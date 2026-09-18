/** Small, dependency-free validators following the existing Wise boundary pattern. */
export type Issue = Readonly<{ path: string; message: string }>;
export type Result<T> = Readonly<{ success: true; data: T } | { success: false; issues: readonly Issue[] }>;
export type Validator<T> = (value: unknown, path: string) => T;
export type Infer<V> = V extends Validator<infer T> ? T : never;

class InvalidInput extends Error {
  readonly issue: Issue;
  constructor(issue: Issue) { super(`${issue.path}: ${issue.message}`); this.issue = issue; }
}
export function fail(path: string, message: string): never { throw new InvalidInput({ path, message }); }
export function validate<T>(validator: Validator<T>, value: unknown): Result<T> {
  try { return { success: true, data: validator(value, '$') }; }
  catch (error) {
    if (error instanceof InvalidInput) return { success: false, issues: [error.issue] };
    throw error;
  }
}
export function object<S extends Record<string, Validator<unknown>>>(shape: S): Validator<{ readonly [K in keyof S]: Infer<S[K]> }> {
  return (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Expected object');
    const input = value as Record<string, unknown>;
    for (const key of Object.keys(input)) if (!(Object.hasOwn(shape, key))) fail(`${path}.${key}`, 'Unknown field');
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) output[key] = shape[key](input[key], `${path}.${key}`);
    return output as { readonly [K in keyof S]: Infer<S[K]> };
  };
}
export function enumeration<const T extends readonly (string | number)[]>(values: T): Validator<T[number]> {
  return (value, path) => values.includes(value as T[number]) ? value as T[number] : fail(path, `Expected one of: ${values.join(', ')}`);
}
export const text: Validator<string> = (value, path) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200
  ? value : fail(path, 'Expected nonblank text (at most 200 characters)');
export const number = (min: number, max: number, integer = false): Validator<number> => (value, path) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isSafeInteger(value))
    ? value : fail(path, `Expected ${integer ? 'safe integer' : 'number'} between ${min} and ${max}`);
export const nullable = <T>(inner: Validator<T>): Validator<T | null> => (value, path) => value === null ? null : inner(value, path);
export const optional = <T>(inner: Validator<T>): Validator<T | undefined> => (value, path) => value === undefined ? undefined : inner(value, path);
export function partial<S extends Record<string, Validator<unknown>>>(shape: S): Validator<{ readonly [K in keyof S]?: Infer<S[K]> }> {
  return (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Expected object');
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (!Object.hasOwn(shape, key)) fail(`${path}.${key}`, 'Unknown field');
      output[key] = shape[key](input[key], `${path}.${key}`);
    }
    return output as { readonly [K in keyof S]?: Infer<S[K]> };
  };
}
export const array = <T>(inner: Validator<T>, min = 0, max = 50): Validator<readonly T[]> => (value, path) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `Expected array with ${min}-${max} items`);
  return value.map((item, index) => inner(item, `${path}[${index}]`));
};
export function refine<T>(inner: Validator<T>, check: (value: T) => boolean, message: string): Validator<T> {
  return (value, path) => { const parsed = inner(value, path); return check(parsed) ? parsed : fail(path, message); };
}
export function union<const V extends readonly Validator<unknown>[]>(...variants: V): Validator<Infer<V[number]>> {
  return (value, path) => {
    for (const variant of variants) {
      try { return variant(value, path) as Infer<V[number]>; }
      catch (error) { if (!(error instanceof InvalidInput)) throw error; }
    }
    return fail(path, 'Value does not match an allowed variant');
  };
}
export const unique = <T>(inner: Validator<readonly T[]>): Validator<readonly T[]> => refine(inner, (items) => new Set(items).size === items.length, 'Duplicate values');
