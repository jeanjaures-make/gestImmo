import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Point d'atterrissage des liens envoyés par e-mail (confirmation de compte,
 * réinitialisation de mot de passe). Échange le code contre une session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // `next` vient de l'URL : n'accepter qu'un chemin interne, jamais une
  // redirection ouverte vers un domaine tiers.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=lien-invalide", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=lien-expire", origin));
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}
