import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, supabaseEnv } from "./env";

/** Routes accessibles sans session. */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/setup",
];

/** Routes d'entrée dont un utilisateur déjà connecté n'a plus besoin. */
const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

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

  const { pathname } = request.nextUrl;
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
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
