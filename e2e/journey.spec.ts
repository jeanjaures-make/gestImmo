import { test, expect, type Page } from "@playwright/test";

import {
  admin,
  deleteOrganizationsNamed,
  deleteUsersMatching,
  testEmail,
  TEST_PASSWORD,
} from "./support/admin";

/**
 * Le parcours complet, dans un vrai navigateur, contre la vraie base.
 *
 * Un seul `test` plutôt qu'une douzaine : chaque étape dépend de l'état
 * laissé par la précédente. Les découper obligerait à recréer un parc
 * entier avant chacune, ce qui testerait surtout la fixture.
 *
 * ─── Ce qui n'est PAS couvert ici, et pourquoi ──────────────────────────
 * Tout ce qui passe par un e-mail sortant : confirmation d'inscription et
 * invitation d'un locataire. Le SMTP intégré de Supabase répond `429 —
 * email rate limit exceeded` après une poignée d'envois, et refuse par
 * ailleurs les domaines non délivrables. Une suite qui en dépendrait
 * échouerait pour une raison sans rapport avec le code.
 *
 * Les comptes sont donc créés par l'API d'administration, qui n'envoie
 * rien — exactement l'état où se trouve un utilisateur ayant déjà suivi
 * son lien. Tout le reste passe par l'interface.
 *
 * La chaîne e-mail est éprouvée séparément par `signup.spec.ts`, qui ne
 * s'exécute que si `E2E_EMAIL_ENABLED=1`. Voir LIVRAISON.md.
 */

const PREFIX = "E2E Parcours";
const orgName = `${PREFIX} ${Date.now()}`;
const ownerEmail = testEmail("owner");
const tenantEmail = testEmail("tenant");

test.afterAll(async () => {
  await deleteOrganizationsNamed(PREFIX);
  await deleteUsersMatching("e2e-");
});

/**
 * Le premier élément RÉELLEMENT affiché.
 *
 * `RecordList` place la carte mobile et la ligne de tableau dans le même
 * DOM, l'une masquée par CSS selon la largeur. `.first()` désigne donc la
 * carte sur desktop et le tableau sur mobile — c'est-à-dire l'élément
 * invisible une fois sur deux. On filtre sur la visibilité effective.
 */
function shown(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true }).first();
}

/** Même raison, pour les boutons d'action dupliqués. */
function shownButton(page: Page, name: string | RegExp, exact = false) {
  return page
    .getByRole("button", { name, exact })
    .filter({ visible: true })
    .first();
}

/** Ouvre le panneau de création replié et remplit le formulaire. */
async function openCreationPanel(page: Page, trigger: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
}

test("de l'inscription à la remise en location du logement", async ({
  page,
}) => {
  // ------------------------------------------------------- 1. Inscription
  // Par le formulaire public, exactement comme un client. Aucun e-mail
  // n'intervient : le mode « instant » crée le compte confirmé côté
  // serveur et ouvre la session dans la foulée.
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  // Un compte sans organisation atterrit sur l'écran de création.
  await page.waitForURL("**/onboarding");

  // ----------------------------------------------------- 2. Organisation
  await page.goto("/onboarding");
  await page.getByLabel("Nom de l'organisation").fill(orgName);
  await page.getByLabel("Prénom", { exact: true }).fill("Awa");
  await page.getByLabel("Nom", { exact: true }).fill("Diallo");
  await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();

  // --------------------------------------------------------- 3. Immeuble
  await page.goto("/buildings");
  await openCreationPanel(page, "Nouvel immeuble");
  await page.getByLabel("Nom", { exact: true }).fill("Résidence Vallier");
  await page.getByLabel("Adresse").fill("12 rue Vallier");
  await page.getByLabel("Ville").fill("Lyon");
  await page.getByRole("button", { name: "Créer l'immeuble" }).click();
  await expect(shown(page, "Résidence Vallier")).toBeVisible();

  // --------------------------------------------------------- 4. Logement
  await page.goto("/apartments");
  await openCreationPanel(page, "Nouveau logement");
  await page.getByLabel("Immeuble").selectOption({ label: "Résidence Vallier" });
  await page.getByLabel("Numéro").fill("A12");
  await page.getByRole("button", { name: "Créer le logement" }).click();
  await expect(shown(page, "A12")).toBeVisible();
  await expect(shown(page, "Libre")).toBeVisible();

  // -------------------------------------------------------- 5. Locataire
  await page.goto("/tenants");
  await openCreationPanel(page, "Nouveau locataire");
  await page.getByLabel("Prénom").fill("Karim");
  await page.getByLabel("Nom", { exact: true }).fill("Benali");
  await page.getByLabel("E-mail").fill(tenantEmail);
  await page.getByRole("button", { name: "Créer le locataire" }).click();
  // RecordList rend la carte mobile ET la ligne de tableau ; l'une est
  // masquée en CSS mais toutes deux sont dans le DOM.
  await expect(shown(page, "Karim Benali")).toBeVisible();

  // -------------------------------------------------------------- 6. Bail
  await page.goto("/leases");
  await openCreationPanel(page, "Nouveau bail");
  await page.getByLabel("Locataire").selectOption({ label: "Karim Benali" });
  await page.getByLabel("Logement").selectOption({ index: 0 });
  await page.getByLabel("Loyer (F CFA)").fill("250000");
  await page.getByLabel("Charges (F CFA)").fill("25000");
  await page.getByLabel("Date de début").fill("2026-01-01");
  await page.getByRole("button", { name: "Créer le bail" }).click();
  // RecordList rend la carte mobile ET la ligne de tableau ; l'une est
  // masquée en CSS mais toutes deux sont dans le DOM.
  await expect(shown(page, "Karim Benali")).toBeVisible();

  // Le trigger doit avoir basculé le logement en « Occupé ».
  await page.goto("/apartments");
  await expect(shown(page, "Occupé")).toBeVisible();

  // Et les échéances doivent exister : la case était cochée par défaut.
  await page.goto("/payments");
  await expect(page.getByText(/sur \d+ échéances|\d+ échéances/)).toBeVisible();

  // ------------------------------------- 7. Ouverture de l'espace locataire
  // Par le bouton, comme un gestionnaire. Aucun e-mail ne part : l'écran
  // rend un lien d'activation, que le test suit comme le ferait le
  // locataire l'ayant reçu par WhatsApp.
  await page.goto("/tenants");
  await shownButton(page, "Ouvrir l'accès").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Générer le lien/ })
    .click();

  await expect(shown(page, /Lien d'activation prêt/)).toBeVisible();
  const activationLink = await page
    .getByLabel("Lien d'activation")
    .first()
    .inputValue();
  // Le lien porte notre domaine, pas celui de Supabase : c'est ce qui permet
  // d'ouvrir la session côté serveur plutôt que dans un fragment d'URL.
  expect(activationLink).toContain("/auth/callback?token_hash=");

  // --------------------------------------- 8. Première connexion locataire
  await page.context().clearCookies();
  await page.goto(activationLink);

  // Le lien ouvre la session et mène à l'écran de choix du mot de passe.
  await page.waitForURL(/reset-password/);
  await expect(shown(page, "Bienvenue")).toBeVisible();
  await page.getByLabel("Votre mot de passe").fill(TEST_PASSWORD);
  await page.getByLabel("Confirmation").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();

  // Un locataire n'atterrit jamais dans le back-office.
  await page.waitForURL("**/portal");
  await expect(shown(page, /Résidence Vallier/)).toBeVisible();

  // ------------------------------------------ 9. Déclaration d'un paiement
  await page.goto("/portal/payments");
  await shownButton(page, /J'ai réglé cette échéance/).click();
  await page.getByLabel("Montant réglé (F CFA)").fill("275000");
  await page.getByLabel("Date du règlement").fill("2026-01-05");
  await page.getByRole("button", { name: "Envoyer la déclaration" }).click();
  await expect(shown(page, /En attente de validation/)).toBeVisible();

  // ------------------------------------------ 10. Validation par le gérant
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  await page.goto("/payments");
  await expect(shown(page, /Règlements déclarés/)).toBeVisible();
  await shownButton(page, "Encaisser").click();
  await expect(shown(page, /Règlements déclarés/)).toBeHidden();

  // ------------------------------------------------- 11. Notifications
  // Émises par trigger : le gestionnaire doit avoir été prévenu.
  await page.goto("/notifications");
  await expect(
    page.getByText(/Paiement déclaré par un locataire/),
  ).toBeVisible();

  // --------------------------------------------------- 12. Clôture du bail
  await page.goto("/leases");
  await shownButton(page, "Clôturer", true).click();
  // Le panneau se déplie en place : date pré-remplie, puis validation.
  await shownButton(page, "Valider", true).click();
  await expect(shown(page, /Bail clôturé/)).toBeVisible();

  // --------------------------------- 13. Le logement redevient disponible
  // Le statut se lit en base : le trigger l'écrit sans passer par l'écran,
  // et c'est justement ce qu'on veut vérifier.
  const { data: org } = await admin()
    .from("organizations")
    .select("id")
    .eq("name", orgName)
    .single();

  await expect
    .poll(async () => {
      const { data } = await admin()
        .from("apartments")
        .select("status")
        .eq("organization_id", org!.id)
        .single();
      return data?.status;
    })
    .toBe("vacant");

  await page.goto("/apartments");
  await expect(shown(page, "Libre")).toBeVisible();

  // ------------------------------------------------- 14. Export comptable
  // On lit la réponse brute : c'est le fichier remis au comptable qui
  // compte, pas l'apparence du bouton.
  const csv = await page.request.get("/export/paiements");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toContain(".csv");

  const body = await csv.text();
  // Le BOM d'abord : sans lui, Excel casse tous les accents du fichier.
  expect(body.startsWith("﻿")).toBe(true);

  const lines = body.slice(1).split("\r\n");
  expect(lines[0]).toBe(
    "Mois;Locataire;Immeuble;Logement;Dû;Encaissé;Statut;Réglé le;Moyen;Note",
  );
  // Autant de lignes que d'échéances, plus l'en-tête : l'en-tête de réponse
  // permet de le vérifier sans compter à la main.
  expect(Number(csv.headers()["x-row-count"])).toBe(lines.length - 1);
  expect(lines.length - 1).toBeGreaterThan(0);
  expect(body).toContain("Karim Benali");

  // ----------------------------------------------------- 15. Réglages
  await page.goto("/settings");
  await expect(shown(page, "Connexions récentes")).toBeVisible();
  // La connexion du gérant vient d'être journalisée par `record_login_event`.
  await expect(shown(page, "Réussie").first()).toBeVisible();

  // Renommer son agence : impossible jusqu'ici, le nom était figé à
  // l'inscription. Deux formulaires portent « Enregistrer » — profil puis
  // organisation ; c'est le second.
  const renamed = `${orgName} SARL`;
  await page.getByLabel("Nom de l'organisation").fill(renamed);
  await page.getByRole("button", { name: "Enregistrer" }).last().click();

  // Le nom se vérifie en base : le bandeau latéral qui l'affiche est masqué
  // sur mobile, l'assertion ne tiendrait que sur un seul des deux projets.
  await expect
    .poll(async () => {
      const { data } = await admin()
        .from("organizations")
        .select("name")
        .eq("id", org!.id)
        .single();
      return data?.name;
    })
    .toBe(renamed);
});
