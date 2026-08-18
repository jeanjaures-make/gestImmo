import { NextResponse, type NextRequest } from "next/server";

import { buildActivationLink } from "@/lib/activation-link";
import { reportError } from "@/lib/observability";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ouvre la session du compte fraîchement activé — une fois, jamais deux.
 *
 * ─── Pourquoi ce détour, et pas une session posée directement ──────────
 * Le webhook (event serveur à serveur) a déjà créé le compte, mais aucun
 * navigateur n'était présent à cet instant pour recevoir une session.
 * Cette route, elle, s'exécute dans le navigateur qui revient de Moneroo :
 * c'est le bon moment, et le bon endroit, pour produire un lien
 * d'activation et immédiatement rediriger dessus.
 *
 * Le jeton (`hashed_token`) n'est JAMAIS stocké : il naît ici et se
 * consomme dans la redirection qui suit, exactement comme le fait
 * l'invitation d'un collaborateur (`buildActivationLink`), simplement sans
 * intermédiaire pour le transmettre — c'est l'intéressé lui-même qui est
 * au bout de la requête.
 *
 * `claim_signup_intent()` verrouille l'intention de façon atomique : un
 * second appel — onglet dupliqué, bouton Précédent, lien repris depuis
 * l'historique — ne obtient plus de session, il retombe sur `/login`.
 */
export async function GET(request: NextRequest) {
  // Même remarque que pour `/api/signup/status` : la clé est l'adresse
  // IP, souvent partagée. Une réclamation est un geste unique par
  // inscription — la marge couvre plusieurs souscripteurs derrière un
  // même routeur, et leurs éventuelles reprises. Ce n'est pas elle qui
  // protège le lien : `ref` est un UUID, et `claim_signup_intent` ne
  // s'ouvre qu'une fois.
  const limit = await rateLimit({
    key: await callerKey("signup-claim"),
    limit: 30,
    windowMs: 10 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.redirect(
      new URL("/login?error=trop-de-tentatives", request.url),
    );
  }

  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref || !/^[0-9a-f-]{36}$/i.test(ref)) {
    return NextResponse.redirect(new URL("/login?error=lien-invalide", request.url));
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.redirect(new URL("/login?error=lien-invalide", request.url));
  }

  const { data, error } = await admin
    .rpc("claim_signup_intent", { p_intent_id: ref })
    .maybeSingle<{ claimed: boolean; email: string | null }>();

  if (error || !data?.claimed || !data.email) {
    // Pas encore actif, ou déjà réclamé : dans les deux cas, aucune
    // session ne s'ouvre. Le message reste générique — il ne doit pas
    // distinguer « pas encore payé » de « déjà utilisé » à qui n'a pas
    // le droit de le savoir.
    return NextResponse.redirect(new URL("/login?error=lien-expire", request.url));
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: data.email,
  });

  if (linkError || !link) {
    reportError(linkError ?? new Error("generateLink recovery vide"), {
      scope: "signup-claim",
      extra: { intentId: ref },
    });
    return NextResponse.redirect(new URL("/login?error=lien-expire", request.url));
  }

  const destination = await buildActivationLink(
    link.properties.hashed_token,
    "recovery",
  );
  return NextResponse.redirect(destination);
}
