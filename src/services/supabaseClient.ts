import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = Boolean(supabaseProjectUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseProjectUrl as string, supabasePublishableKey as string, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
