import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * Directives d'exploration.
 *
 * Les écrans applicatifs sont exclus explicitement. Le proxy les protège
 * déjà — un robot n'y verrait qu'une redirection — mais l'indiquer ici
 * évite de dépenser le budget d'exploration à découvrir des impasses, et
 * empêche des URLs internes d'apparaître dans les résultats.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/portal",
          "/apartments",
          "/buildings",
          "/tenants",
          "/leases",
          "/payments",
          "/expenses",
          "/maintenance",
          "/documents",
          "/notifications",
          "/audit",
          "/team",
          "/onboarding",
          "/setup",
          "/auth/",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
