import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * Plan du site.
 *
 * Uniquement les pages publiques. Les écrans de l'application sont
 * derrière une session : les référencer conduirait un moteur — et un
 * visiteur venu d'un résultat de recherche — sur un écran de connexion.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE.url, lastModified: now, changeFrequency: "monthly", priority: 1 },
    {
      url: `${SITE.url}/signup`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.8,
    },
    {
      url: `${SITE.url}/login`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE.url}/legal/mentions-legales`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE.url}/legal/confidentialite`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE.url}/legal/cgu`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
