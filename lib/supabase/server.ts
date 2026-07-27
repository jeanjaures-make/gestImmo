import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "./env";

/**
 * Client Supabase pour Server Components, Server Actions et Route Handlers.
 *
 * `cookies()` est asynchrone depuis Next.js 15 : cette fonction doit donc
 * être awaitée (`const supabase = await createClient()`).
 */
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un Server Component : l'écriture de cookies y est
          // interdite. Le middleware rafraîchit déjà la session, on ignore.
        }
      },
    },
  });
}
