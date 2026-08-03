export type FormState = {
  error?: string;
  ok?: boolean;
  /**
   * Lien d'activation à transmettre soi-même.
   *
   * Renseigné par les actions qui créent un compte sans envoyer d'e-mail.
   * C'est un identifiant : il s'affiche une fois et n'est jamais conservé.
   */
  link?: string;
};

/** Lit un champ texte obligatoire d'un FormData. */
export function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

/** Lit un champ texte facultatif ; renvoie null plutôt qu'une chaîne vide. */
export function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

/** Lit un champ numérique ; renvoie null si vide ou non numérique. */
export function optionalNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
