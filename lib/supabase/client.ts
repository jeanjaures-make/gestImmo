import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnv } from "./env";

/** Client Supabase pour les Client Components ("use client"). */
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}
