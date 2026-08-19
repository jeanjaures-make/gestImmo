import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 a remplacé la convention `middleware.ts` par `proxy.ts`.
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf les assets statiques, pour lesquels rafraîchir
     * la session n'apporte rien.
     *
     * `txt`, `xml` et `ico` s'ajoutent aux images : sans eux, `/robots.txt`
     * et `/sitemap.xml` passaient par la garde de session et repartaient en
     * redirection vers `/login`. Un moteur n'y lisait donc pas des règles
     * d'indexation mais une page de connexion — et n'en tenait aucun compte.
     *
     * Les fichiers de métadonnées SANS extension (`/opengraph-image`,
     * `/apple-icon`) ne peuvent pas être exclus ici sans une expression
     * fragile : ils sont déclarés publics dans `lib/supabase/middleware.ts`,
     * où la règle se lit en clair.
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
