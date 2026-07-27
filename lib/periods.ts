/**
 * Périodes d'analyse du tableau de bord.
 *
 * Ces constantes vivaient dans `components/period-selector.tsx`, marqué
 * `"use client"`. Le tableau de bord — composant serveur — les importait :
 * en production, l'import serveur d'un module client ne rend pas la valeur
 * mais une référence de module, et `PERIODS.includes(...)` levait
 * « includes is not a function ». La page d'accueil plantait donc à chaque
 * chargement en production, sans que le mode développement le montre.
 *
 * D'où ce fichier neutre : une donnée partagée entre serveur et client
 * n'appartient à aucun des deux.
 */
export const PERIODS = [6, 12, 24] as const;

export type Period = (typeof PERIODS)[number];

/** Période demandée dans l'URL, ou 12 mois par défaut. */
export function readPeriod(value: string | undefined): Period {
  const parsed = Number(value);
  return PERIODS.includes(parsed as Period) ? (parsed as Period) : 12;
}
