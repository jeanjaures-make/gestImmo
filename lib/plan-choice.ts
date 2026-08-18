/**
 * L'offre choisie avant l'inscription.
 *
 * ─── Ce que ce module transporte, et ce qu'il ne transporte pas ─────────
 * Il ne voyage qu'un SLUG. Jamais un prix, jamais un identifiant de plan,
 * jamais un montant. La règle du projet tient précisément à cela : le
 * tarif se lit dans `plans`, côté serveur, au moment de créer le paiement.
 * Un visiteur qui trafique `?plan=` dans son navigateur ne peut donc que
 * désigner une autre offre publique — pas s'en inventer une.
 *
 * Un slug inconnu n'est pas une erreur : la page de destination affiche
 * alors toutes les offres, ce qui est le bon repli quand on ne sait pas
 * ce que la personne voulait.
 */

/** Réduit une valeur d'URL à un slug sûr, ou rien. */
export function safePlanSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  // Bornes volontairement étroites : un slug d'offre est court et sobre.
  // Tout le reste — chemins, protocoles, espaces — est écarté ici plutôt
  // que d'être recollé plus loin dans une URL.
  return /^[a-z0-9-]{1,40}$/.test(slug) ? slug : null;
}

/** Reporte le choix sur la destination suivante, s'il y en a un. */
export function withPlan(path: string, slug: string | null): string {
  if (!slug) return path;
  return `${path}${path.includes("?") ? "&" : "?"}plan=${encodeURIComponent(slug)}`;
}
