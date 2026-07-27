import { test, expect } from "@playwright/test";

import { deleteUsersMatching, testEmail, TEST_PASSWORD } from "./support/admin";

/**
 * La chaîne d'inscription, e-mail compris.
 *
 * Isolée du parcours principal et désactivée par défaut : elle dépend d'un
 * envoi réel. Le SMTP intégré de Supabase répond `429 — email rate limit
 * exceeded` après quelques messages, et refuse les domaines non
 * délivrables. L'inclure dans la suite courante ferait échouer la CI pour
 * un quota, pas pour une régression.
 *
 * À activer une fois un fournisseur SMTP raccordé :
 *
 *     E2E_EMAIL_ENABLED=1 E2E_EMAIL_DOMAIN=votredomaine.fr npm run test:e2e
 *
 * Tant qu'elle reste désactivée, la création de compte par un client final
 * n'est pas couverte automatiquement — réserve consignée dans LIVRAISON.md.
 */
const enabled = process.env.E2E_EMAIL_ENABLED === "1";
const domain = process.env.E2E_EMAIL_DOMAIN;

test.describe("inscription avec envoi d'e-mail", () => {
  test.skip(
    !enabled,
    "E2E_EMAIL_ENABLED=1 requis : ce test envoie un e-mail réel.",
  );

  test.afterAll(async () => {
    await deleteUsersMatching("e2e-");
  });

  test("créer un compte depuis le formulaire public", async ({ page }) => {
    const email = domain
      ? `e2e-signup-${Date.now()}@${domain}`
      : testEmail("signup");

    await page.goto("/signup");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    // Deux issues légitimes selon le réglage « Confirm email » du projet.
    // Ce qui n'est pas légitime, c'est une erreur technique brute.
    const confirmation = page.getByText(/Vérifiez votre boîte mail/i);
    const landed = page.waitForURL("**/onboarding", { timeout: 15_000 });

    await expect
      .poll(
        async () =>
          (await confirmation.isVisible().catch(() => false)) ||
          (await landed.then(() => true).catch(() => false)),
        {
          message:
            "l'inscription n'a produit ni session ni message de confirmation",
        },
      )
      .toBe(true);

    // Un quota épuisé ne doit jamais être présenté tel quel à l'utilisateur.
    await expect(page.getByText(/rate limit|429/i)).toHaveCount(0);
  });
});
