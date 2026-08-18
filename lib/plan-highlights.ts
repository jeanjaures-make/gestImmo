/**
 * Arguments de vente, par offre.
 *
 * ─── Pourquoi ici et non en base ────────────────────────────────────────
 * `plans` porte ce qui engage : prix, devise, durée, limites. Ces valeurs
 * commandent la facturation et doivent avoir une seule source.
 *
 * Une liste d'arguments, elle, ne commande rien : c'est du texte, révisé
 * au rythme du marketing, relu en revue de code, versionné avec le reste.
 * La mettre en base obligerait à un écran d'administration pour changer
 * une virgule.
 *
 * Les LIMITES ne sont volontairement pas répétées ici — « 100 pièces »,
 * « 5 utilisateurs » se lisent dans `plans`. Les recopier créerait deux
 * vérités, et c'est toujours la fausse qu'on montre au client.
 */
export type PlanHighlight = {
  pitch: string;
  features: string[];
};

export const PLAN_HIGHLIGHTS: Record<string, PlanHighlight | undefined> = {
  starter: {
    pitch: "Pour un comptoir qui veut des pièces propres.",
    features: [
      "Reçus, bons de caisse et bons de sortie",
      "Numérotation continue, sans trou",
      "Montant en toutes lettres",
      "Impression à votre en-tête",
    ],
  },
  business: {
    pitch: "Pour les magasins et les chantiers qui grandissent.",
    features: [
      "Tout ce que contient Starter",
      "Rôles et permissions",
      "Journal d'audit complet",
      "Export comptable CSV",
    ],
  },
  unlimited: {
    pitch:
      "Volume et équipe sans limite, pour les groupes et les réseaux de magasins.",
    features: [
      "Tout ce que contient Business",
      "Pièces illimitées",
      "Utilisateurs illimités",
      "Accompagnement à la reprise de données",
    ],
  },
};
