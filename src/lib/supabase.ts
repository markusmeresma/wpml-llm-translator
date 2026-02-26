import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "./env.js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const env = getEnv();

  supabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseClient;
}
