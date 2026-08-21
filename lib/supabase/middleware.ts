import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, supabaseEnv } from "./env";

/**
 * Routes accessibles sans session.
 *
 * `/` est la page de présentation publique : elle doit s'ouvrir sans
 * compte, sinon un visiteur ne rencontre jamais que l'écran de connexion.
 * L'application, elle, vit sous `/dashboard` et les trois carnets.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/setup",
  "/legal",
  // Pages de retour après paiement / facturation (accessibles avec ou sans session)
  "/billing",
  "/payment",
  // Le choix de l'offre précède l'inscription : il doit donc être
  // consultable sans compte. L'oublier ici renvoyait vers la connexion
  // toute personne cliquant « Commencer » — soit l'inverse du parcours.
  "/offres",
  // Le webhook du fournisseur de paiement n'a pas de session Supabase :
  // il est donc public. Sa sécurité tient à la signature HMAC de la
  // notification, puis à une re-vérification serveur de la transaction.
  "/api/webhooks",
  // Le planificateur de Vercel non plus. La route se garde elle-même
  // par `CRON_SECRET` et reste inerte si le secret n'est pas configuré.
  "/api/cron",
  // Sondage et réclamation d'une inscription : appelés par un visiteur
  // qui, par construction, n'a encore aucune session — c'est justement ce
  // que ces routes s'apprêtent à lui donner, une fois le paiement confirmé.
  "/api/signup",
  // Fichiers de métadonnées produits par Next : ils n'ont pas d'extension,
  // et échappaient donc à l'exclusion du matcher (`proxy.ts`). Ils
  // repartaient en redirection vers `/login`.
  //
  // `/opengraph-image` est le plus coûteux des deux : c'est la vignette que
  // WhatsApp, Facebook et LinkedIn vont chercher quand on partage un lien.
  // À la place, ils recevaient une page HTML de connexion — donc aucune
  // vignette. Sur un marché où le lien circule d'abord par WhatsApp, c'est
  // la première impression qui se perdait.
  "/opengraph-image",
  "/apple-icon",
];

/** Routes d'entrée dont un utilisateur déjà connecté n'a plus besoin. */
const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

/**
 * Routes publiques dont le rendu ne dépend pas de l'utilisateur.
 *
 * Sur celles-ci, on ne vérifie pas le jeton : la page est identique pour
 * tout le monde. Cela évite un aller-retour vers le serveur d'
 * authentification à chaque affichage — et surtout à chaque préchargement
 * de lien. La page de présentation pointe vers `/login` et `/signup` à une
 * dizaine d'endroits ; Next les précharge dès qu'ils entrent dans le champ
 * de vision, et chacun déclenchait une vérification. Un visiteur qui ne se
 * connecte jamais consommait ainsi le quota d'authentification, jusqu'au
 * `429 — Request rate limit reached` qui touchait alors les vrais
 * utilisateurs.
 */
const ANONYMOUS_PATHS = ["/", "/setup", "/offres"];

/** Même logique, pour un préfixe entier : les pages légales et de retour paiement. */
const ANONYMOUS_PREFIXES = ["/legal/", "/payment/", "/billing/"];

/**
 * Rafraîchit le jeton de session à chaque requête et protège le dashboard.
 *
 * Le motif `getAll` / `setAll` est important : les cookies rafraîchis doivent
 * être écrits **à la fois** sur la requête (pour le rendu en aval) et sur la
 * réponse (pour le navigateur).
 */
export async function updateSession(request: NextRequest) {
  // Sans clés Supabase, on laisse passer : la page affichera l'écran de setup
  // plutôt qu'une erreur 500 sur chaque route.
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Le banc de rendu des pièces imprimées ne lit ni session ni base : il
  // compose des données figées dans son propre fichier. La page se garde
  // elle-même par un `notFound()` en production ; cette seconde condition
  // évite qu'une erreur de configuration ne l'expose jamais.
  if (
    process.env.NODE_ENV !== "production" &&
    pathname === "/print-preview"
  ) {
    return NextResponse.next({ request });
  }

  // Sortie immédiate sur les pages identiques pour tous : aucun cookie à
  // rafraîchir, donc aucun appel au serveur d'authentification.
  if (
    ANONYMOUS_PATHS.includes(pathname) ||
    ANONYMOUS_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  /**
   * Ici, et ici seulement, on se contente de `getSession()`.
   *
   * Le proxy ne décide de rien d'autre qu'une redirection : envoyer un
   * visiteur sans session vers l'écran de connexion. Ce n'est pas la
   * frontière de sécurité — elle se trouve deux étages plus bas :
   *
   *   1. `requireSession()` appelle `getUser()`, qui revalide le jeton
   *      auprès du serveur Auth avant que la page ne lise quoi que ce soit ;
   *   2. le RLS, qui vérifie la signature du jeton à chaque requête.
   *
   * Un cookie forgé franchirait donc le proxy pour se heurter aussitôt à
   * ces deux barrières : il n'obtient aucune donnée, seulement une page de
   * connexion affichée un instant plus tard.
   *
   * Ce que cela évite : `getUser()` est un aller-retour réseau vers le
   * serveur Auth. L'appeler ici EN PLUS de la page doublait le coût de
   * chaque affichage et saturait le quota — `429 over_request_rate_limit`
   * après quelques dizaines de navigations, y compris pour de simples
   * préchargements de liens. `getSession()` lit le cookie localement et ne
   * sort sur le réseau que pour renouveler un jeton expiré.
   */
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && GUEST_ONLY_PATHS.includes(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
