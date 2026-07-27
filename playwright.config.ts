import { defineConfig, devices } from "@playwright/test";

/**
 * Les parcours sont éprouvés dans un vrai navigateur, contre une vraie base.
 *
 * Rien n'est simulé : ni Supabase, ni le RLS, ni les triggers. Un test qui
 * passe sur des doublures prouve que le code appelle ce qu'on croit ; il ne
 * prouve pas que la base l'autorise. Or ici, l'essentiel des règles vit en
 * base — c'est donc elle qu'il faut interroger.
 *
 * Conséquence assumée : ces tests écrivent. Ils s'exécutent sur un projet
 * de développement, et nettoient derrière eux.
 */
export default defineConfig({
  testDir: "./e2e",
  // Les parcours partagent une base : les paralléliser produirait des
  // interférences difficiles à lire pour un gain de quelques secondes.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  // Le parcours enchaîne treize écrans, chacun rendu côté serveur avec ses
  // propres requêtes Supabase. Un budget de 60 s le faisait échouer sur la
  // dernière étape — un faux négatif qui accusait l'application.
  timeout: 240_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
  },

  projects: [
    // Le produit est utilisé d'abord depuis un téléphone : c'est donc la
    // taille d'écran de référence, pas une variante testée en dernier.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
