import { test, expect } from "@playwright/test";

import {
  admin,
  deleteOrganizationsNamed,
  deleteSignupIntentsMatching,
  deleteUsersMatching,
  resetSignupRateLimits,
  seedActivatedSignup,
  testEmail,
  TEST_PASSWORD,
} from "./support/admin";

/**
 * L'inscription est subordonnée au paiement — preuves en navigateur.
 *
 * `journey.spec.ts` s'arrête au bord du formulaire `/signup` : le
 * soumettre pour de vrai ouvrirait une transaction chez Moneroo, ce
 * qu'aucun test automatisé ne doit jamais faire. Ce fichier prend le
 * relais sur tout ce qui reste testable SANS y toucher :
 *
 *   — un paiement jamais confirmé n'ouvre jamais de session, quel que
 *     soit le nombre de fois où l'on revient sur la page de retour ;
 *   — un paiement confirmé (simulé via `seedActivatedSignup`, qui rejoue
 *     la suite RÉELLE des opérations serveur — jamais l'appel à Moneroo
 *     lui-même) ouvre une session, mène au choix d'un mot de passe, et
 *     seulement ensuite au tableau de bord ;
 *   — cette ouverture ne se produit qu'une fois par inscription.
 *
 * La preuve que `confirm_signup_payment` et `provision_signup_intent`
 * sont eux-mêmes corrects — idempotents, à l'épreuve d'un double
 * webhook — vit dans `npm run verify:rls`, section « INSCRIPTION
 * SUBORDONNÉE AU PAIEMENT » : elle porte sur la base, pas sur le
 * navigateur, et n'a donc pas sa place ici.
 */
const PREFIX = "E2E Inscription";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.beforeAll(async () => {
  await resetSignupRateLimits();
});

test.afterAll(async () => {
  await deleteOrganizationsNamed(PREFIX);
  await deleteSignupIntentsMatching("e2e-");
  await deleteUsersMatching("e2e-");
});

test.describe("avant paiement — aucun accès", () => {
  test("un paiement en attente ne se prétend jamais confirmé", async ({ page }) => {
    const planId = await starterPlanId();
    const email = testEmail("gate-pending");

    const { data: intent, error } = await admin()
      .from("signup_intents")
      .insert({ email, org_name: `${PREFIX} Pending ${Date.now()}`, plan_id: planId })
      .select("id")
      .single();
    if (error) throw new Error(`intention : ${error.message}`);

    // Le sondage utilisé par la page de retour : jamais autre chose que
    // « en attente » tant que rien n'a confirmé le paiement.
    const status = await page.request.get(`/api/signup/status?ref=${intent.id}`);
    expect(status.status()).toBe(200);
    expect((await status.json()).status).toBe("pending");

    // La réclamation refuse — sans jamais poser de cookie de session.
    const claim = await page.request.get(`/api/signup/claim?ref=${intent.id}`, {
      maxRedirects: 0,
    });
    expect(claim.status()).toBeGreaterThanOrEqual(300);
    expect(claim.status()).toBeLessThan(400);
    expect(claim.headers()["location"]).toContain("/login");
    expect(claim.headers()["set-cookie"]).toBeUndefined();

    // Revenir « à la main » sur la page de retour ne mène nulle part :
    // c'est le geste explicitement interdit de compter comme preuve de
    // paiement. La page l'affiche, un point c'est tout — elle n'ouvre rien.
    await page.goto(`/payment/success?ref=${intent.id}`);
    await expect(page.getByText("Paiement reçu")).toBeVisible();
    await page.waitForTimeout(1_500);
    expect(new URL(page.url()).pathname).toBe("/payment/success");
  });

  test("une intention inconnue ou expirée ne se réclame pas davantage", async ({ page }) => {
    const claim = await page.request.get(
      "/api/signup/claim?ref=00000000-0000-0000-0000-000000000000",
      { maxRedirects: 0 },
    );
    expect(claim.status()).toBeGreaterThanOrEqual(300);
    expect(claim.headers()["location"]).toContain("/login");

    const status = await page.request.get(
      "/api/signup/status?ref=00000000-0000-0000-0000-000000000000",
    );
    expect((await status.json()).status).toBe("unknown");
  });
});

test.describe("après paiement — activation et mot de passe", () => {
  test("le lien de retour ouvre une session, une seule fois", async ({ page, browser }) => {
    const email = testEmail("gate-active");
    const orgName = `${PREFIX} Active ${Date.now()}`;

    // Ce que le webhook Moneroo aurait produit, sans jamais l'appeler :
    // organisation, profil propriétaire, abonnement actif. Aucun mot de
    // passe n'est posé ici — c'est précisément ce que ce test vérifie.
    const seeded = await seedActivatedSignup(email, orgName, "starter");

    // Le compte Supabase Auth existe — mais il n'est pas encore utilisable :
    // `generateLink(invite)` le crée sans mot de passe ET sans adresse
    // confirmée. C'est le passage par `/auth/callback`, déclenché par le
    // lien de retour ci-dessous, qui achève l'activation. Autrement dit :
    // même une fois le paiement encaissé, rien ne s'ouvre tant que le
    // titulaire n'a pas suivi son propre lien.
    const { data: freshUser } = await admin().auth.admin.getUserById(seeded.userId);
    expect(freshUser.user?.email_confirmed_at ?? null).toBeNull();

    // ── Le lien de retour ──────────────────────────────────────────────
    await page.goto(`/api/signup/claim?ref=${seeded.intentId}`);
    await page.waitForURL(/\/reset-password\?bienvenue=1/);
    await expect(page.getByText("Bienvenue")).toBeVisible();

    // ── Le mot de passe se choisit ICI, pas avant ───────────────────────
    await page.getByLabel("Votre mot de passe").fill(TEST_PASSWORD);
    await page.getByLabel("Confirmation").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Accéder à mon espace" }).click();

    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Vue d'ensemble" }),
    ).toBeVisible();

    // L'adresse, laissée en attente à l'invitation, est confirmée par le
    // passage même qui vient d'ouvrir la session.
    const { data: activated } = await admin().auth.admin.getUserById(seeded.userId);
    expect(activated.user?.email_confirmed_at ?? null).not.toBeNull();

    // Le mot de passe posé fonctionne pour une connexion ordinaire, dans
    // un navigateur qui n'a jamais suivi le lien de réclamation.
    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const freshPage = await fresh.newPage();
    await freshPage.goto("/login");
    await freshPage.getByLabel("Adresse e-mail").fill(email);
    await freshPage.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await freshPage.getByRole("button", { name: "Se connecter" }).click();
    await freshPage.waitForURL("**/dashboard");
    await fresh.close();

    // ── Réutiliser le lien une seconde fois n'ouvre plus rien ───────────
    await page.context().clearCookies();
    const secondClaim = await page.request.get(
      `/api/signup/claim?ref=${seeded.intentId}`,
      { maxRedirects: 0 },
    );
    expect(secondClaim.status()).toBeGreaterThanOrEqual(300);
    expect(secondClaim.headers()["location"]).toContain("/login");
  });
});

async function starterPlanId() {
  const { data, error } = await admin().from("plans").select("id").eq("slug", "starter").single();
  if (error || !data) throw new Error("plan starter introuvable — exécutez supabase/subscriptions.sql.");
  return data.id as string;
}
