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
 * Le compte et l'organisation sont créés via l'API admin (comme
 * `accessibility.spec.ts`), pas via le formulaire public : l'inscription et
 * l'onboarding sont déjà éprouvés par `journey.spec.ts`. Ce test se concentre
 * sur ce qui n'est testable qu'en navigateur : le rendu des plans depuis la
 * base et la redirection d'autorisation côté serveur.
 *
 * Pas de `beforeAll` ni de `storageState` : un seul test, qui ouvre sa propre
 * session. `test.use({ storageState })` s'applique au worker, y compris au
 * `beforeAll` — le fichier n'existe pas encore au premier passage, et le hook
 * échoue. En faire l'économie évite ce piège.
 */
const PREFIX = "E2E Abonnement";

test.afterAll(async () => {
  await deleteOrganizationsNamed(PREFIX);
  await deleteUsersMatching("e2e-");
});

test("plans affichés depuis la base, audit redirige vers subscribe", async ({
  page,
}) => {
  const ownerEmail = testEmail("sub-owner");
  const orgName = `${PREFIX} ${Date.now()}`;

  // ------------------------------------------- 0. Préparation via API admin
  const { data: user, error } = await admin().auth.admin.createUser({
    email: ownerEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`compte : ${error.message}`);

  const { data: org, error: orgErr } = await admin()
    .from("organizations")
    .insert({
      name: orgName,
      slug: `sub-${Date.now()}`,
      legal_form: "S.A.R.L.",
      address: "Zone industrielle de Vridi, Abidjan",
      phone: "+225 27 21 00 00 00",
    })
    .select("id")
    .single();
  if (orgErr) throw new Error(`organisation : ${orgErr.message}`);

  const { error: profileErr } = await admin().from("profiles").insert({
    id: user.user.id,
    organization_id: org.id,
    firstname: "Awa",
    lastname: "Diallo",
    email: ownerEmail,
    role: "owner",
  });
  if (profileErr) throw new Error(`profil : ${profileErr.message}`);

  // Pas d'abonnement : on veut éprouver la redirection /audit → /subscribe
  // qui se produit précisément quand l'organisation n'a pas la capacité audit.

  // ------------------------------------------- 1. Connexion via UI
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  // ------------------------------------------- 2. Plans depuis la base
  await page.goto("/subscribe");
  await expect(
    page.getByRole("heading", { name: "Choisissez votre plan" }),
  ).toBeVisible();

  // Au moins un bouton « Commencer » ou « Profiter de l'offre » doit être
  // présent : c'est lui qui déclenche la création de paiement.
  await expect(
    page.getByRole("button", { name: /Commencer|Profiter de l.offre/ }),
  ).toHaveCount(3);

  // --------------------------- 3. Audit redirige vers /subscribe
  // Sans abonnement actif, l'organisation n'a pas la capacité audit.
  // La page /audit doit rediriger vers /subscribe?reason=audit avec un
  // message explicatif, pas un mur blanc.
  await page.goto("/audit");
  await page.waitForURL(/\/subscribe/);
  await expect(
    page.getByText(/Journal d.audit indisponible/i),
  ).toBeVisible();
});
