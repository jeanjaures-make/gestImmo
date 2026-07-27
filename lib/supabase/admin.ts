import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client à privilèges élevés — contourne le RLS.
 *
 * Réservé aux opérations d'administration que l'API publique ne permet pas
 * (créer un utilisateur, écrire un profil pour quelqu'un d'autre). La clé
 * n'est JAMAIS préfixée NEXT_PUBLIC_ : elle ne doit pas atteindre le
 * navigateur, sous peine d'annuler toute l'isolation multi-tenant.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
