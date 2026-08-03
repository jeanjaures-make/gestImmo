/**
 * Devise du produit.
 *
 * Déclarée ici et nulle part ailleurs. Une devise éparpillée dans vingt
 * fichiers finit par diverger : un écran affiche encore l'ancienne, un
 * export en produit une troisième, et personne ne s'en aperçoit avant
 * qu'un locataire conteste un montant.
 *
 * ⚠️ Deux francs CFA coexistent, de même valeur mais distincts :
 *   XOF — zone UEMOA (Sénégal, Côte d'Ivoire, Mali, Burkina, Bénin, Togo,
 *         Niger, Guinée-Bissau). Affiché « F CFA ».
 *   XAF — zone CEMAC (Cameroun, Gabon, Congo, Tchad, RCA, Guinée
 *         équatoriale). Affiché « FCFA ».
 *
 * XOF est retenu par défaut. Basculer vers la zone CEMAC tient en une
 * ligne : remplacer la constante ci-dessous.
 */
export const CURRENCY = "XOF" as const;

/** Libellé court, pour les étiquettes de champ : « Loyer (F CFA) ». */
export const CURRENCY_LABEL = CURRENCY === "XOF" ? "F CFA" : "FCFA";

/**
 * Le franc CFA n'a pas de sous-unité en usage courant.
 *
 * Afficher « 250 000,00 F CFA » ajouterait deux chiffres qui ne veulent
 * rien dire et rendrait les colonnes de montants plus difficiles à
 * balayer. La base conserve deux décimales — on n'y touche pas — mais
 * l'affichage les omet.
 */
const formatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string | null | undefined) {
  return formatter.format(Number(value ?? 0));
}

/** Montant nu, sans symbole — pour les phrases qui portent déjà la devise. */
export function formatAmount(value: number | string | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

/**
 * Montant abrégé, pour les tuiles d'indicateurs.
 *
 * « 12 400 000 F CFA » fait seize caractères : dans une tuile de moitié
 * d'écran sur téléphone, le texte débordait de son cadre. Les montants en
 * francs CFA comptent trois à quatre chiffres de plus que les mêmes
 * sommes en euros — les gabarits calibrés pour l'euro ne tiennent plus.
 *
 * L'abrégé arrondit : « 11,4 M » pour 11 350 000. C'est acceptable pour un
 * indicateur qu'on lit d'un coup d'œil, à condition que la valeur exacte
 * reste accessible — les appelants la passent en `title`.
 *
 * À n'utiliser QUE là où la place manque. Les listes, les quittances et
 * tout ce qui fait foi gardent `formatCurrency`.
 */
const compactFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompactCurrency(
  value: number | string | null | undefined,
) {
  const amount = Number(value ?? 0);

  // En deçà de dix mille, l'abrégé n'économise rien et dégrade la lecture :
  // « 9,5 k F CFA » est plus long que « 9 500 F CFA ».
  if (Math.abs(amount) < 10_000) return formatter.format(amount);

  return compactFormatter.format(amount);
}

/**
 * Nombre abrégé, sans devise : « 12,4 M ».
 *
 * Pour les tuiles vraiment étroites — celles des maquettes de la vitrine,
 * larges d'une centaine de pixels — où même « 12,4 M F CFA » est coupé.
 * La devise doit alors être portée par la légende de la tuile, une fois,
 * plutôt que répétée sur chaque valeur.
 */
const compactAmountFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompactAmount(value: number | string | null | undefined) {
  return compactAmountFormatter.format(Number(value ?? 0));
}
