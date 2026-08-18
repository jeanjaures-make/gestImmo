import "server-only";

import { headers } from "next/headers";

/**
 * Fabrique le lien d'activation remis au gestionnaire.
 *
 * ─── Pourquoi ne pas utiliser `action_link` ─────────────────────────────
 * `generateLink` renvoie un `action_link` tout prêt, mais il pointe vers
 * le domaine Supabase, qui vérifie le jeton puis rebondit vers nous en
 * plaçant la session dans le *fragment* de l'URL (`#access_token=…`). Or
 * un fragment n'est jamais transmis au serveur : notre route d'atterrissage
 * ne verrait rien passer, et l'invité retomberait sur l'écran de
 * connexion sans que rien n'explique pourquoi.
 *
 * Le jeton haché, lui, se vérifie côté serveur — la session s'ouvre dans
 * les cookies, comme pour une connexion ordinaire. En prime, le lien porte
 * notre domaine (plus rassurant sur WhatsApp) et ne dépend pas de la liste
 * d'URL autorisées du projet Supabase, réglage invisible depuis le code et
 * facile à oublier lors d'un déploiement.
 */
export type ActivationType = "invite" | "recovery";

export async function buildActivationLink(
  tokenHash: string,
  type: ActivationType,
): Promise<string> {
  const h = await headers();
  const origin = h.get("origin") ?? `${scheme(h)}://${h.get("host")}`;

  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    // `bienvenue` change le texte de l'écran d'arrivée : on y choisit son
    // mot de passe pour la première fois, on ne « réinitialise » rien.
    next: "/reset-password?bienvenue=1",
  });

  return `${origin}/auth/callback?${params}`;
}

/**
 * Schéma à employer quand l'en-tête `Origin` fait défaut.
 *
 * Il fait défaut plus souvent qu'il n'y paraît : un navigateur ne l'envoie
 * pas sur une navigation GET de premier niveau. L'invitation d'un
 * collaborateur ne s'en apercevait pas — elle part d'une Server Action,
 * donc d'un POST, qui en porte un. Le retour de paiement, lui, arrive par
 * un simple clic : sans repli correct, le lien fabriqué pointait vers
 * `https://localhost:3000` et le navigateur échouait sur une erreur TLS.
 *
 * `x-forwarded-proto` est posé par tout hébergeur qui termine le TLS,
 * Vercel compris. À défaut, seule une adresse locale peut légitimement
 * être servie en clair — partout ailleurs, HTTPS est la bonne réponse.
 */
function scheme(h: Headers): string {
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const host = (h.get("host") ?? "").toLowerCase();
  const local = ["localhost", "127.0.0.1", "[::1]"].some(
    (name) => host === name || host.startsWith(`${name}:`),
  );

  return local ? "http" : "https";
}
