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
 * ne verrait rien passer, et le locataire retomberait sur l'écran de
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
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    // `bienvenue` change le texte de l'écran d'arrivée : on y choisit son
    // mot de passe pour la première fois, on ne « réinitialise » rien.
    next: "/reset-password?bienvenue=1",
  });

  return `${origin}/auth/callback?${params}`;
}
