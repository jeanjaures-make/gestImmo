export type FormState = { error?: string; ok?: boolean };

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
