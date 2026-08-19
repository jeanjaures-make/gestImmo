/**
 * Ce que `/login?error=…` raconte à qui vient d'être éconduit.
 *
 * Sept endroits du produit redirigent vers la connexion avec un code —
 * lien d'activation périmé, réclamation déjà consommée, trop de
 * tentatives. Aucun ne l'affichait : la personne atterrissait sur un
 * formulaire vierge, sans savoir si son lien était mort, si elle s'était
 * trompée d'adresse, ou si le produit était en panne. Un écran muet sur
 * un parcours de récupération fait perdre le client, pas seulement son
 * mot de passe.
 *
 * Les codes vivent ici plutôt que dans la page : les routes qui les
 * posent (`/auth/callback`, `/api/signup/claim`) et l'écran qui les lit
 * ne doivent pas diverger en silence.
 */
export const AUTH_ERRORS = {
  "lien-expire":
    "Ce lien n'est plus valable : il a expiré, ou il a déjà servi. Un lien d'activation ne s'utilise qu'une fois. Demandez-en un nouveau ci-dessous.",
  "lien-invalide":
    "Ce lien est incomplet ou incorrect. Vérifiez que vous l'avez copié en entier, ou demandez-en un nouveau.",
  "trop-de-tentatives":
    "Trop de tentatives depuis cet appareil. Patientez quelques minutes avant de réessayer.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

/** Le message correspondant, ou rien si le code est inconnu. */
export function authErrorMessage(code: string | undefined) {
  if (!code) return null;
  return AUTH_ERRORS[code as AuthErrorCode] ?? null;
}
