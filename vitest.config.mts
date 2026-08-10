import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests de la logique dont dépendent les Server Actions.
 *
 * Une Server Action ne s'exécute pas hors de Next : elle lit `cookies()`,
 * appelle `revalidatePath()`, s'appuie sur le RLS. La tester « en
 * isolation » supposerait de simuler tout cela — et l'on vérifierait alors
 * les doublures, pas le produit.
 *
 * La couverture est donc répartie selon ce que chaque outil prouve
 * réellement :
 *
 *   vitest        — les décisions prises AVANT la base : validation,
 *                   bornes de pagination, statuts dérivés, messages.
 *   verify:rls    — ce que la base autorise : policies, triggers, RPC.
 *   Playwright    — les actions elles-mêmes, appelées par le navigateur.
 *
 * Aucun des trois ne remplace les autres.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    server: {
      deps: {
        // `server-only` est un marqueur Next.js qui empêche l'import depuis
        // un Client Component. En test, on l'ignore : on teste la logique
        // pure, pas la frontière client/serveur.
        inline: ["server-only"],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/__mocks__/server-only.ts", import.meta.url)),
    },
  },
});
