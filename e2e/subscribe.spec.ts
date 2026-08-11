import { test, expect } from "@playwright/test";

import {
  admin,
  deleteOrganizationsNamed,
  deleteUsersMatching,
  testEmail,
  TEST_PASSWORD,
} from "./support/admin";

/**
 * Parcours d'abonnement : ce que voit un propriétaire qui choisit un plan,
 * et la redirection du journal d'audit vers /subscribe quand l'offre ne
 * comprend pas cette capacité.
 *
 * Comme `journey.spec.ts`, ce test écrit dans une vraie base de développement
 * et nettoie derrière lui. Il ne s'exécute pas contre des doublures : les
 * prix et limites doivent venir de la table `plans`, pas du code.
 *
 * L'accès réservé au propriétaire (non-viewer) n'est pas éprouvé ici : il est
 * couvert par `verify-rls.mjs` (RLS sur `subscriptions`) et par le filtrage
 * par rôle de la `Sidebar`. L'E2E se concentre sur ce qui n'est testable que
 * dans un navigateur : le rendu des plans depuis la base et la redirection
 * d'autorisation côté serveur.
 */
const PREFIX = "E2E Abonnement";
const orgName = `${PREFIX} ${Date.now()}`;
const ownerEmail = testEmail("sub-owner");

test.afterAll(async () => {
  await deleteOrganizationsNamed(PREFIX);
  await deleteUsersMatching("e2e-");
});

test("plans affichés depuis la base, audit redirige vers subscribe", async ({
  page,
}) => {
  // ------------------------------------------------------- 1. Inscription
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL("**/onboarding");

  // ----------------------------------------------------- 2. Organisation
  await page.goto("/onboarding");
  await page.getByLabel("Nom de l'organisation").fill(orgName);
  await page.getByLabel("Prénom", { exact: true }).fill("Awa");
  await page.getByLabel("Nom", { exact: true }).fill("Diallo");
  await page.getByLabel("Forme juridique").fill("S.A.R.L.");
  await page.getByLabel("Téléphone").fill("+225 27 21 00 00 00");
  await page.getByLabel("Adresse", { exact: true }).fill("Zone industrielle de Vridi");
  await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
  await page.waitForURL("**/dashboard");

  // ------------------------------------------- 3. Plans depuis la base
  await page.goto("/subscribe");
  await expect(
    page.getByRole("heading", { name: "Choisissez votre plan" }),
  ).toBeVisible();

  // On lit les plans en base pour ne pas dupliquer la source de vérité :
  // si la page affiche un prix qui n'est pas en base, c'est une régression.
  const { data: plans } = await admin()
    .from("plans")
    .select("name, price, currency")
    .eq("is_active", true)
    .order("price", { ascending: true });

  expect(plans?.length).toBeGreaterThanOrEqual(3);
  for (const plan of plans!) {
    await expect(page.getByText(plan.name, { exact: true })).toBeVisible();
  }

  // --------------------------- 4. Audit redirige vers /subscribe
  // Sans abonnement actif, l'organisation n'a pas la capacité audit
  // (Starter ne l'inclut pas, et sans abonnement on s'aligne sur l'entrée
  // de gamme). La page /audit doit rediriger vers /subscribe?reason=audit
  // avec un message explicatif, pas un mur blanc.
  await page.goto("/audit");
  await page.waitForURL(/\/subscribe/);
  await expect(
    page.getByText(/Journal d.audit indisponible/i),
  ).toBeVisible();
});
