import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, supabaseEnv } from "./env";

/**
 * Routes accessibles sans session.
 *
 * `/` est la page de présentation publique : elle doit s'ouvrir sans
 * compte, sinon un visiteur ne rencontre jamais que l'écran de connexion.
 * L'application, elle, vit sous `/dashboard` et `/portal`.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/setup",
  "/mentions-legales",
  "/confidentialite",
  "/cgu",
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
const ANONYMOUS_PATHS = [
  "/",
  "/setup",
  "/mentions-legales",
  "/confidentialite",
  "/cgu",
];

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

  // Sortie immédiate sur les pages identiques pour tous : aucun cookie à
  // rafraîchir, donc aucun appel au serveur d'authentification.
  if (ANONYMOUS_PATHS.includes(pathname)) {
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

  // Ne pas remplacer par getSession() : seul getUser() revalide le jeton
  // auprès du serveur Auth. getSession() fait confiance au cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
