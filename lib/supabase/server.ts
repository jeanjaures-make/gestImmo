import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "./env";

/**
 * Client Supabase pour Server Components, Server Actions et Route Handlers.
 *
 * `cookies()` est asynchrone depuis Next.js 15 : cette fonction doit donc
 * être awaitée (`const supabase = await createClient()`).
 *
 * L'ordre des deux premières lignes n'est pas cosmétique. Lire les cookies
 * signale à Next.js que la route dépend de la requête, donc qu'elle ne peut
 * pas être prérendue à la compilation. En lisant la configuration d'abord,
 * une variable d'environnement absente levait une exception AVANT ce
 * signal : Next tentait alors un rendu statique, échouait, et faisait
 * échouer tout le build — au lieu de laisser la page se rendre à la requête
 * et rediriger vers le diagnostic `/setup`.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

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
