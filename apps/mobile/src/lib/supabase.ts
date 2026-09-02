import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const expectedProjectHost = 'wkgvnpamnhesmmbyikml.supabase.co';

function isExploreWiseProjectUrl(url: string | undefined) {
  if (!url) return false;

  try {
    return new URL(url).hostname === expectedProjectHost;
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  supabasePublishableKey && isExploreWiseProjectUrl(supabaseUrl),
);

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
    throw new Error(
      'ExploreWise is not configured for its production project. Add the required public Supabase URL and publishable key to .env.local.',
    );
  }

  return supabase;
}
