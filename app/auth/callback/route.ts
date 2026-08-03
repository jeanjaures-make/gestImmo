import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = [
  "invite",
  "recovery",
  "signup",
  "magiclink",
  "email",
  "email_change",
] as const;

function otpType(raw: string | null): EmailOtpType | null {
  return OTP_TYPES.includes(raw as (typeof OTP_TYPES)[number])
    ? (raw as EmailOtpType)
    : null;
}

/**
 * Point d'atterrissage des liens d'activation : invitation d'un locataire ou
 * d'un collaborateur, réinitialisation de mot de passe, confirmation de compte.
 *
 * Deux formes de jeton arrivent ici, et il faut savoir traiter les deux :
 *
 *  • `token_hash` — les liens que l'application fabrique elle-même
 *    (voir `lib/activation-link.ts`). Ils se vérifient ici, côté serveur,
 *    et posent directement les cookies de session.
 *
 *  • `code` — le flux PKCE, utilisé quand la demande est partie du
 *    navigateur (mot de passe oublié en libre-service). Le code ne vaut
 *    que pour le navigateur qui l'a demandé.
 *
 * Dans les deux cas la session est ouverte avant la redirection : l'écran
 * suivant trouve un utilisateur authentifié, sans aller-retour visible.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // `next` vient de l'URL : la garde partagée n'accepte qu'un chemin
  // interne, jamais une redirection vers un domaine tiers.
  const destination = safeNext(searchParams.get("next"));

  const tokenHash = searchParams.get("token_hash");
  const type = otpType(searchParams.get("type"));
  const code = searchParams.get("code");

  if (!tokenHash && !code) {
    return NextResponse.redirect(new URL("/login?error=lien-invalide", origin));
  }

  const supabase = await createClient();

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        // Sans type explicite, Supabase refuse le jeton : le défaut couvre
        // le cas courant plutôt que d'échouer sur un paramètre tronqué.
        type: type ?? "invite",
        token_hash: tokenHash,
      })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=lien-expire", origin));
  }

  return NextResponse.redirect(new URL(destination, origin));
}
