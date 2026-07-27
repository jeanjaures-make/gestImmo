import "server-only";

/**
 * Traduction des échecs d'envoi d'e-mail.
 *
 * Toute la mise en service d'un locataire tient à une invitation reçue par
 * e-mail. Quand l'envoi échoue, Supabase renvoie des messages techniques —
 * « Email address "x@y.z" is invalid », « Error sending invite email » —
 * qu'un gestionnaire ne peut ni comprendre ni corriger. Pire : le premier
 * accuse l'adresse du locataire alors que la cause est presque toujours la
 * configuration du projet.
 *
 * L'application ne peut pas interroger Supabase sur l'état de son SMTP :
 * aucune API ne l'expose. On interprète donc l'échec, et on nomme la cause
 * la plus probable avec le geste qui la corrige.
 */

/** Vrai si le message dénonce l'adresse elle-même. */
function looksLikeAddressRejection(message: string) {
  return /email address .* is invalid|invalid email/i.test(message);
}

/** Vrai si le message dénonce l'acheminement. */
function looksLikeDeliveryFailure(message: string) {
  return /sending|smtp|mailer|rate limit|too many requests|confirmation email/i.test(
    message,
  );
}

export function describeInviteError(message: string): string {
  if (looksLikeAddressRejection(message)) {
    return (
      "Supabase a refusé cette adresse. Deux causes possibles : le domaine " +
      "est un domaine de test non délivrable (example.com, .invalid, .test), " +
      "ou aucun serveur SMTP n'est configuré pour le projet. " +
      "Vérifiez Authentication → SMTP Settings dans Supabase."
    );
  }

  if (looksLikeDeliveryFailure(message)) {
    return (
      "L'e-mail n'a pas pu être envoyé. Le SMTP intégré de Supabase est " +
      "fortement limité en débit et n'est pas prévu pour la production : " +
      "raccordez un fournisseur (Resend, Postmark, SendGrid) dans " +
      "Authentication → SMTP Settings."
    );
  }

  return message;
}

/**
 * Le SMTP intégré de Supabase suffit-il ?
 *
 * Non, et l'application n'a aucun moyen de vérifier ce qui est configuré
 * côté projet. Cette variable est purement déclarative : elle sert à ne
 * plus afficher l'avertissement une fois le raccordement fait. Elle
 * n'active rien et ne conditionne aucun envoi — l'envoi passe toujours par
 * Supabase.
 */
export function isMailProviderDeclared() {
  return process.env.SMTP_PROVIDER_CONFIGURED === "true";
}
