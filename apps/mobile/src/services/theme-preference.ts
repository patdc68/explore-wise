export type ThemePreference = 'light' | 'dark';

export const THEME_PREFERENCE_KEY = '@explorewise/appearance';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

type PreferenceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function resolveThemePreference(value: unknown): ThemePreference {
  return value === 'dark' ? 'dark' : DEFAULT_THEME_PREFERENCE;
}

/** Local UI state only. Ordered writes keep rapid toggles persistent in the same order. */
export function createThemePreferenceStore(storage: PreferenceStorage) {
  let snapshot = { preference: DEFAULT_THEME_PREFERENCE, ready: false };
  let hydration: Promise<void> | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (preference: ThemePreference) => {
    snapshot = { preference, ready: true };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    hydrate() {
      hydration ??= (async () => {
        let preference = DEFAULT_THEME_PREFERENCE;
        try {
          preference = resolveThemePreference(await storage.getItem(THEME_PREFERENCE_KEY));
        } catch {
          // Unavailable storage must not block startup.
        }
        if (!snapshot.ready) publish(preference);
      })();
      return hydration;
    },
    setPreference(preference: ThemePreference) {
      const resolved = resolveThemePreference(preference);
      publish(resolved);
      writes = writes.then(() => storage.setItem(THEME_PREFERENCE_KEY, resolved)).catch(() => {
        // Keep the current session usable even if device storage is unavailable.
      });
      return writes;
    },
  };
}
