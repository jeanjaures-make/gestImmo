/**
 * Contraintes du logo d'organisation.
 *
 * Dans un module neutre : un fichier `"use server"` ne peut exporter que
 * des fonctions asynchrones, et un module `"use client"` ne rend pas ses
 * valeurs au serveur — une constante partagée n'appartient à aucun des
 * deux. Le formulaire s'en sert pour filtrer avant l'envoi, l'action pour
 * décider ; les deux règles restent ainsi une seule.
 *
 * Un mégaoctet suffit largement à un logo, et la même borne est posée sur
 * le bucket : la refuser côté client évite un envoi inutile, la refuser
 * côté serveur est ce qui fait foi.
 */
export const LOGO_MAX_BYTES = 1_048_576;

export const LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;
