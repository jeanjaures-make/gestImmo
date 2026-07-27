import { test, expect, type Page } from "@playwright/test";

import {
  admin,
  deleteOrganizationsNamed,
  deleteUsersMatching,
  setPassword,
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
  // ---------------------------------- 1. Compte propriétaire, puis connexion
  // Créé sans e-mail (voir l'en-tête) ; la connexion, elle, passe bien par
  // le formulaire.
  await admin().auth.admin.createUser({
    email: ownerEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();

  // Un compte sans organisation doit atterrir sur l'accueil de création.
  await page.waitForURL("**/onboarding");

  // ----------------------------------------------------- 2. Organisation
  await page.goto("/onboarding");
  await page.getByLabel("Nom de l'organisation").fill(orgName);
  await page.getByLabel("Prénom", { exact: true }).fill("Awa");
  await page.getByLabel("Nom", { exact: true }).fill("Diallo");
  await page.getByRole("button", { name: "Créer l'organisation" }).click();
  await page.waitForURL("**/");
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
  await page.getByLabel("Loyer (€)").fill("900");
  await page.getByLabel("Charges (€)").fill("100");
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
  // L'invitation par e-mail n'est pas exerçable ici (voir l'en-tête) : on
  // crée le compte comme le ferait `grantPortalAccess`, puis on vérifie que
  // le locataire n'accède qu'à son propre périmètre.
  const { data: org } = await admin()
    .from("organizations")
    .select("id")
    .eq("name", orgName)
    .single();
  const { data: tenantRow } = await admin()
    .from("tenants")
    .select("id")
    .eq("organization_id", org!.id)
    .single();

  const { data: created, error: createErr } = await admin().auth.admin.createUser({
    email: tenantEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created?.user) throw new Error(createErr?.message ?? "compte locataire");
  await admin().from("profiles").insert({
    id: created.user.id,
    organization_id: org!.id,
    tenant_id: tenantRow!.id,
    firstname: "Karim",
    lastname: "Benali",
    email: tenantEmail,
    role: "viewer",
  });
  await setPassword(tenantEmail);

  // --------------------------------------- 8. Première connexion locataire
  await page.goto("/auth/signout").catch(() => {});
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(tenantEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();

  // Un locataire ne doit jamais atterrir dans le back-office.
  await page.waitForURL("**/portal");
  await expect(shown(page, /Résidence Vallier/)).toBeVisible();

  // ------------------------------------------ 9. Déclaration d'un paiement
  await page.goto("/portal/payments");
  await shownButton(page, /J'ai réglé cette échéance/).click();
  await page.getByLabel("Montant réglé (€)").fill("1000");
  await page.getByLabel("Date du règlement").fill("2026-01-05");
  await page.getByRole("button", { name: "Envoyer la déclaration" }).click();
  await expect(shown(page, /En attente de validation/)).toBeVisible();

  // ------------------------------------------ 10. Validation par le gérant
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/");

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
});
