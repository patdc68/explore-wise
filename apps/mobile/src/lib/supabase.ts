import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { DiscoveryError } from '@/lib/discovery-errors';
import { normalizeExploreWiseProjectUrl, normalizePublishableKey } from '@/lib/supabase-config';
import type { Database } from '@/types/database';

// Expo inlines EXPO_PUBLIC_* values into the React Native bundle. Do not use a
// Node-only dotenv loader here.
const supabaseUrl = normalizeExploreWiseProjectUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabasePublishableKey = normalizePublishableKey(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

const serverStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => undefined,
  removeItem: async (_key: string) => undefined,
};

// Native persists through AsyncStorage. Web static rendering has no window, so
// it uses a harmless in-memory adapter until the browser hydrates.
const authStorage = Platform.OS === 'web'
  ? (typeof window === 'undefined' ? serverStorage : window.localStorage)
  : AsyncStorage;

// Discovery remains anonymous, while signed-in sessions persist for account-only actions.
export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new DiscoveryError(
      'configuration',
      'Discovery is not configured on this build.',
    );
  }

  return supabase;
}
