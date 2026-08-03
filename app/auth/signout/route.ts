import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Déconnexion.
 *
 * POST uniquement : en GET, un simple `<img src="/auth/signout">` sur un
 * site tiers — ou un préchargement de lien — déconnecterait l'utilisateur
 * à son insu. Les Server Actions et les formulaires POST de Next portent
 * déjà la vérification d'origine.
 *
 * Retour sur la page de présentation plutôt que sur l'écran de connexion :
 * on vient de partir, on ne cherche pas à revenir tout de suite.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // 303 : le navigateur suit en GET, sans réémettre le POST.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
