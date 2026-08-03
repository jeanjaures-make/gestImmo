import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Point d'atterrissage des liens reçus par e-mail : confirmation de compte,
 * invitation, réinitialisation de mot de passe. Échange le code contre une
 * session, puis dépose l'utilisateur là où il devait aller.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // `next` vient de l'URL : la garde partagée n'accepte qu'un chemin
  // interne, jamais une redirection vers un domaine tiers.
  const destination = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=lien-invalide", origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=lien-expire", origin));
  }

  return NextResponse.redirect(new URL(destination, origin));
}
