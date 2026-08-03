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
