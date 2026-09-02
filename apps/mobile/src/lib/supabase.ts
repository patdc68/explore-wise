import { createClient } from '@supabase/supabase-js';

import { DiscoveryError } from '@/lib/discovery-errors';
import { normalizeExploreWiseProjectUrl, normalizePublishableKey } from '@/lib/supabase-config';
import type { Database } from '@/types/database';

// Expo inlines EXPO_PUBLIC_* values into the React Native bundle. Do not use a
// Node-only dotenv loader here.
const supabaseUrl = normalizeExploreWiseProjectUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabasePublishableKey = normalizePublishableKey(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

// Discovery is anonymous. Auth persistence will be introduced together with the sign-in flow.
export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
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
