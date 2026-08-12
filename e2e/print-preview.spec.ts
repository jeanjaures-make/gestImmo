import { test, expect } from "@playwright/test";

/**
 * Captures des trois pièces imprimées, pour comparaison aux modèles papier.
 *
 *   npm run dev
 *   npx playwright test e2e/print-preview.spec.ts --project=desktop
 *
 * Les images sortent dans `test-results/print-preview/`. On les superpose
 * aux scans du carnet : c'est le seul contrôle qui attrape un interligne
 * ou une largeur de colonne, là où la relecture du code ne voit que
 * l'ordre des éléments.
 *
 * Ce n'est pas un test de non-régression : il n'affirme rien sur les
 * pixels, il les donne à voir. Figer une capture de référence supposerait
 * la même version de Chromium et les mêmes polices sur tous les postes,
 * ce que ce projet ne garantit pas.
 *
 * Ignoré en CI : `/print-preview` n'existe pas en production, et la CI
 * s'exécute contre un build de production.
 */
test.describe("Banc de rendu des pièces imprimées", () => {
  test.skip(
    !!process.env.CI,
    "La route de prévisualisation n'existe qu'en développement.",
  );

  const SHEETS = [
    { id: "receipt", label: "Reçu" },
    { id: "cash-voucher", label: "Bon de caisse" },
    { id: "delivery-note", label: "Bon de sortie" },
  ];

  for (const { id, label } of SHEETS) {
    test(`capture — ${label}`, async ({ page }) => {
      await page.goto("/print-preview");

      const sheet = page.locator(`[data-sheet="${id}"]`);
      await expect(sheet).toBeVisible();

      // Les polices Google sont chargées par next/font : sans cette
      // attente, la capture fige un rendu en police de repli, dont les
      // métriques n'ont rien à voir avec celles du document final.
      await page.evaluate(() => document.fonts.ready);

      await sheet.screenshot({
        path: `test-results/print-preview/${id}.png`,
        scale: "css",
      });
    });
  }
});
