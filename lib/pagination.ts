/**
 * Pagination des listes.
 *
 * Avant, chaque écran posait un `.limit(200)` : au-delà, les lignes les
 * plus anciennes disparaissaient sans que rien ne le signale. Sur des
 * loyers, une donnée absente et silencieuse est pire qu'une erreur — elle
 * se lit comme une absence de dette.
 *
 * Le numéro de page vit dans l'URL et non dans un état client : la page
 * reste partageable, le bouton Retour du navigateur fonctionne, et le
 * rendu demeure entièrement serveur.
 */
export const PAGE_SIZE = 25;

export type Page = {
  /** Numéro de page, à partir de 1. */
  number: number;
  size: number;
  /** Bornes pour `.range()` de PostgREST, inclusives. */
  from: number;
  to: number;
};

/**
 * Lit le numéro de page dans l'URL.
 *
 * Toute valeur absurde (0, -3, « abc », 10^9) retombe sur la première
 * page : une URL trafiquée ne doit produire ni erreur ni écran vide
 * inexplicable.
 */
export function readPage(value: string | undefined, size = PAGE_SIZE): Page {
  const parsed = Number(value);
  const number =
    Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;

  return {
    number,
    size,
    from: (number - 1) * size,
    to: number * size - 1,
  };
}

/** Nombre total de pages, au minimum 1 pour qu'une liste vide reste lisible. */
export function pageCount(total: number, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Vrai si la page demandée dépasse les données disponibles.
 *
 * Le cas se produit après une suppression, ou via une URL saisie à la
 * main. L'appelant peut alors renvoyer l'utilisateur sur la dernière page
 * réelle plutôt que de lui montrer un écran vide.
 */
export function isOutOfRange(page: Page, total: number) {
  return total > 0 && page.from >= total;
}
