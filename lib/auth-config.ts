import "server-only";

import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * Comment un compte est créé.
 *
 * Deux modes, et un seul endroit qui tranche. Le reste de l'application
 * n'a pas à savoir lequel est actif.
 *
 * ─── « instant » (par défaut) ───────────────────────────────────────────
 * Le compte est créé côté serveur avec la clé d'administration, déjà
 * confirmé, puis la session est ouverte dans la foulée. Aucun e-mail n'est
 * émis, donc rien ne dépend d'un serveur SMTP.
 *
 * Ce n'est pas un contournement : c'est le comportement attendu d'un SaaS
 * professionnel en libre-service. La vérification d'adresse a son intérêt
 * — lutter contre les inscriptions automatisées, s'assurer qu'on peut
 * joindre le client — mais elle se paie d'un abandon massif à
 * l'inscription. On la réintroduira quand un vrai fournisseur d'envoi sera
 * raccordé, pas avant.
 *
 * Constaté sur ce projet : `signUp()` refuse l'adresse dès que la
 * confirmation est active et que la délivrabilité paraît douteuse
 * (`email_address_invalid`), et le service d'envoi intégré épuise son
 * quota après quelques messages (`429`). L'inscription en libre-service
 * est donc, en l'état, purement et simplement impossible par ce chemin.
 *
 * ─── « email-confirmation » ─────────────────────────────────────────────
 * Le chemin classique de Supabase : `signUp()` envoie un lien, la session
 * ne s'ouvre qu'après le clic. À activer en posant
 * `AUTH_REQUIRE_EMAIL_CONFIRMATION=true`, une fois un SMTP configuré.
 * Aucune autre ligne n'est à changer.
 */
export type SignupMode = "instant" | "email-confirmation";

export function signupMode(): SignupMode {
  if (process.env.AUTH_REQUIRE_EMAIL_CONFIRMATION === "true") {
    return "email-confirmation";
  }

  // Sans clé d'administration, le mode instantané est impossible : on
  // retombe sur le chemin standard plutôt que d'échouer en silence.
  return isAdminConfigured() ? "instant" : "email-confirmation";
}

/**
 * Vrai si l'inscription est hors service.
 *
 * Cas précis : la confirmation par e-mail n'est pas demandée, mais la clé
 * d'administration manque — l'application retombe alors sur `signUp()`,
 * qui exige un SMTP. Mieux vaut le dire à l'écran que laisser un visiteur
 * buter sur un message technique de Supabase.
 */
export function signupNeedsAttention() {
  return (
    process.env.AUTH_REQUIRE_EMAIL_CONFIRMATION !== "true" &&
    !isAdminConfigured()
  );
}
