"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Rattrape les liens d'authentification que Supabase renvoie en échec.
 *
 * ─── Pourquoi ce détour par le navigateur ───────────────────────────────
 * Un lien de « mot de passe oublié » part par e-mail et transite par le
 * domaine Supabase, qui vérifie le jeton avant de nous le rendre. Quand
 * le jeton est mort, Supabase ne nous rend rien : il redirige vers le
 * *Site URL* du projet — l'accueil — en plaçant la cause dans le
 * FRAGMENT de l'URL :
 *
 *   https://exemple.com/?error=access_denied&error_code=otp_expired
 *     #error=access_denied&error_code=otp_expired&…
 *
 * Or un fragment n'est jamais transmis au serveur. Ni le rendu, ni le
 * proxy, ni `/auth/callback` ne peuvent le voir : seul du code exécuté
 * dans le navigateur y a accès. Sans ce composant, la personne qui vient
 * de demander à récupérer son mot de passe atterrit sur la page de vente,
 * sans un mot — et conclut que le produit est cassé.
 *
 * ─── Ce qu'il ne fait pas ───────────────────────────────────────────────
 * Il ne réagit qu'aux paramètres propres à Supabase (`error_code`,
 * `error_description`). Nos propres redirections posent `?error=lien-expire`,
 * que la page de connexion lit déjà côté serveur : les confondre créerait
 * une boucle, chaque arrivée sur `/login` en déclenchant une nouvelle.
 */

/** Les codes que Supabase renvoie, traduits vers les nôtres. */
function internalCode(errorCode: string | null, error: string | null) {
  if (errorCode === "otp_expired") return "lien-expire";
  if (errorCode === "over_request_rate_limit") return "trop-de-tentatives";
  if (error === "access_denied") return "lien-expire";
  return "lien-invalide";
}

export function AuthBounce() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    // Supabase pose la cause dans les deux, mais seul le fragment est
    // garanti : on lit d'abord celui-ci.
    const errorCode =
      hash.get("error_code") ?? query.get("error_code");
    const description =
      hash.get("error_description") ?? query.get("error_description");
    if (!errorCode && !description) return;

    const error = hash.get("error") ?? query.get("error");
    router.replace(`/login?error=${internalCode(errorCode, error)}`);
  }, [router]);

  return null;
}
