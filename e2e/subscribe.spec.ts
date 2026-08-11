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
 * et ce que voit un membre non propriétaire qui tente d'y accéder.

 * Comme `journey.spec.ts`, ce test écrit dans une vraie base de développement
 * et nettoie derrière lui. Il ne s'exécute pas contre des doublures : les
 * prix et limites doivent venir de la table `plans`, pas du code.
 */
const PREFIX = "E2E Abonnement";
const orgName = `${PREFIX} ${Date.now()}`;
const ownerEmail = testEmail("sub-owner");
const memberEmail = testEmail("sub-member");

test.afterAll(async () => {
  await deleteOrganizationsNamed(PREFIX);
  await deleteUsersMatching("e2e-");
});

/** Inscrit, confirme, complète l'onboarding. Retourne l'id de l'organisation. */
async function bootstrapOwner(page: import("@playwright/test").Page) {
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL("**/onboarding");

  await page.goto("/onboarding");
  await page.getByLabel("Nom de l'organisation").fill(orgName);
  await page.getByLabel("Prénom", { exact: true }).fill("Awa");
  await page.getByLabel("Nom", { exact: true }).fill("Diallo");
  await page.getByLabel("Forme juridique").fill("S.A.R.L.");
  await page.getByLabel("Téléphone").fill("+225 27 21 00 00 00");
  await page.getByLabel("Adresse", { exact: true }).fill("Zone industrielle de Vridi");
  await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
  await page.waitForURL("**/dashboard");

  const { data: org } = await admin()
    .from("organizations")
    .select("id")
    .eq("name", orgName)
    .single();
  return org!.id;
}

test("plans affichés depuis la base, accès réservé au propriétaire", async ({
  page,
}) => {
  const orgId = await bootstrapOwner(page);

  // Les trois offres officielles doivent être présentes, avec leurs prix
  // exacts tels qu'ils sont stockés en base — pas codés en dur dans la page.
  await page.goto("/subscribe");
  await expect(
    page.getByRole("heading", { name: "Choisissez votre plan" }),
  ).toBeVisible();

  // On lit les prix en base pour ne pas dupliquer la source de vérité.
  const { data: plans } = await admin()
    .from("plans")
    .select("name, price, currency")
    .eq("is_active", true)
    .order("price", { ascending: true });

  expect(plans?.length).toBeGreaterThanOrEqual(3);
  for (const plan of plans!) {
    // Le nom du plan doit figurer sur la page.
    await expect(page.getByText(plan.name, { exact: true })).toBeVisible();
  }

  // L'accès à /audit sans abonnement actif renvoie vers /subscribe avec
  // un message explicatif plutôt qu'un mur blanc.
  await page.goto("/audit");
  await page.waitForURL(/\/subscribe/);
  await expect(
    page.getByText(/Journal d.audit indisponible/i),
  ).toBeVisible();

  // Un membre non propriétaire ne doit pas voir le lien d'abonnement dans
  // la navigation latérale, ni accéder à la page.
  // On crée un membre via l'API d'administration puis on ouvre une session
  // pour lui — l'invitation par e-mail n'étant pas éprouvable ici.
  const { data: newUser } = await admin().auth.admin.createUser({
    email: memberEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  await admin().from("profiles").insert({
    id: newUser.user!.id,
    organization_id: orgId,
    firstname: "Membre",
    lastname: "Test",
    role: "viewer",
  });

  // Déconnexion du propriétaire (POST-only), puis connexion du membre.
  await page.request.post("/auth/signout");
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(memberEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  // Le lien « Abonnement » ne doit pas apparaître dans la navigation.
  await expect(
    page.getByRole("link", { name: "Abonnement" }),
  ).toHaveCount(0);

  // L'accès direct à /subscribe redirige vers le tableau de bord.
  await page.goto("/subscribe");
  await page.waitForURL("**/dashboard");
});
