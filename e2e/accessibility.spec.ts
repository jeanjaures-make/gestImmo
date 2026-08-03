import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  admin,
  deleteOrganizationsNamed,
  deleteUsersMatching,
  testEmail,
  TEST_PASSWORD,
} from "./support/admin";

/**
 * Audit d'accessibilité outillé.
 *
 * Jusqu'ici l'application se réclamait de WCAG AA sans qu'aucun outil ne
 * l'ait vérifié — une intention, pas une propriété. axe-core inspecte le
 * DOM réellement rendu : contrastes calculés, rôles, noms accessibles,
 * ordre des titres, libellés de champs.
 *
 * ─── Ce qu'un tel audit ne prouve pas ───────────────────────────────────
 * axe détecte environ un tiers des critères WCAG. Il ne dit rien de la
 * pertinence d'un texte alternatif, de la logique de l'ordre de tabulation,
 * ni de l'utilisabilité au lecteur d'écran. Zéro violation signifie « aucun
 * défaut mécaniquement détectable », pas « accessible ».
 *
 * Les écrans sont audités connecté et avec des données : une page vide
 * n'expose ni tableau, ni badge, ni bouton d'action — c'est-à-dire
 * précisément ce qui casse.
 *
 * ─── En cas d'échec, lire le PREMIER ────────────────────────────────────
 * Playwright redémarre son worker après un test en échec, ce qui rejoue
 * `beforeAll` : le jeu de données est reconstitué et une seconde session
 * ouverte. Les tests suivants peuvent alors échouer sur des erreurs de
 * mise en place — boucle de redirection, compte déjà pris — sans rapport
 * avec l'accessibilité. Seule la première violation signalée décrit un
 * vrai défaut.
 */
const PREFIX = "E2E Accessibilite";
const orgName = `${PREFIX} ${Date.now()}`;
const ownerEmail = testEmail("a11y");
const SESSION = "e2e/.auth/a11y.json";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Les critères qu'on s'engage à tenir. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Mouvement réduit, pour deux raisons.
 *
 * D'abord la justesse : les éléments de la page d'accueil arrivent en
 * fondu, et axe les mesurait à mi-course — un titre relevé à 1,1:1 alors
 * qu'il est parfaitement lisible une demi-seconde plus tard. On auditerait
 * une image transitoire, pas la page que l'on lit.
 *
 * Ensuite l'intérêt propre : c'est le rendu servi aux personnes ayant
 * demandé moins d'animation. Le vérifier, c'est vérifier que cette
 * préférence n'abîme rien.
 */
test.beforeEach(async ({ page }) => {
  // Posé avant toute navigation : l'application lit la préférence au rendu.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

/**
 * Insère une ligne et rend son id, ou échoue en nommant la cause.
 *
 * Sans cela, une colonne renommée produit un `data` nul, et l'erreur
 * remonte vingt lignes plus loin sous la forme « Cannot read properties of
 * null » — qui n'apprend rien.
 */
async function seed(table: string, row: Record<string, unknown>) {
  const { data, error } = await admin()
    .from(table)
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`${table} : ${error.message}`);
  return data.id as string;
}

test.beforeAll(async ({ browser }) => {
  // Le parc est monté par l'API : ce test-ci porte sur le rendu, pas sur
  // les parcours de création, déjà couverts par `journey.spec.ts`.
  const { data: user, error } = await admin().auth.admin.createUser({
    email: ownerEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`compte : ${error.message}`);

  const org = await seed("organizations", {
    name: orgName,
    slug: `a11y-${Date.now()}`,
  });

  await seed("profiles", {
    id: user.user.id,
    organization_id: org,
    firstname: "Awa",
    lastname: "Diallo",
    email: ownerEmail,
    role: "owner",
  });

  const building = await seed("buildings", {
    organization_id: org,
    name: "Résidence Vallier",
    address: "12 rue des Manguiers",
    city: "Dakar",
  });

  const apartment = await seed("apartments", {
    organization_id: org,
    building_id: building,
    number: "A101",
    floor: "1",
    surface: 68,
    type: "T3",
  });

  const tenant = await seed("tenants", {
    organization_id: org,
    firstname: "Karim",
    lastname: "Benali",
    email: testEmail("a11y-loc"),
    phone: "+221770000000",
  });

  const lease = await seed("leases", {
    organization_id: org,
    tenant_id: tenant,
    apartment_id: apartment,
    rent: 275000,
    charges: 15000,
    deposit: 550000,
    start_date: "2026-01-01",
  });

  // Une échéance due et une réglée : les deux badges de statut, donc les
  // deux jeux de couleurs à contrôler.
  // Les deux lignes portent les mêmes clés : dans un lot, PostgREST aligne
  // les colonnes sur la première et pose NULL pour les absentes, au lieu de
  // laisser jouer les valeurs par défaut.
  const { error: paymentsError } = await admin().from("rent_payments").insert([
    {
      organization_id: org,
      lease_id: lease,
      month: "2026-01-01",
      amount: 290000,
      status: "pending",
      amount_paid: 0,
      payment_date: null,
    },
    {
      organization_id: org,
      lease_id: lease,
      month: "2026-02-01",
      amount: 290000,
      status: "paid",
      amount_paid: 290000,
      payment_date: "2026-02-03",
    },
  ]);
  if (paymentsError) throw new Error(`rent_payments : ${paymentsError.message}`);

  await seed("expenses", {
    organization_id: org,
    building_id: building,
    label: "Réfection de la toiture",
    category: "works",
    amount: 1250000,
    expense_date: "2026-01-15",
  });

  await seed("maintenance", {
    organization_id: org,
    building_id: building,
    apartment_id: apartment,
    title: "Fuite sous l'évier",
    description: "Signalée par le locataire.",
  });

  await saveSession(browser);
});

test.afterAll(async () => {
  await deleteOrganizationsNamed(PREFIX);
  await deleteUsersMatching("e2e-a11y");
});

/**
 * Ouvre une session une seule fois et conserve les cookies.
 *
 * Se reconnecter à chaque test coûtait treize authentifications d'affilée,
 * ce qui déclenchait la limitation de débit de Supabase : la suite échouait
 * alors sur un délai d'attente, en accusant l'écran audité plutôt que sa
 * propre impatience.
 */
async function saveSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  await mkdir(dirname(SESSION), { recursive: true });
  await context.storageState({ path: SESSION });
  await context.close();
}

/**
 * Analyse une page et rend un rapport lisible.
 *
 * Le message d'échec porte l'aide et l'élément fautif : un identifiant de
 * règle seul (« color-contrast ») oblige à rouvrir le navigateur pour
 * savoir quoi corriger.
 */
async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .analyze();

  const report = violations
    .map((v) => {
      const where = v.nodes
        .slice(0, 3)
        .map(
          (n) =>
            `      ${n.target.join(" ")}\n` +
            // Le fragment de HTML fautif : sans lui, un sélecteur comme
            // « a » oblige à rouvrir le navigateur pour savoir lequel.
            `      ${n.html.slice(0, 200)}\n` +
            `      ${n.failureSummary?.split("\n").join("\n      ")}`,
        )
        .join("\n");
      return `  [${v.impact}] ${v.id} — ${v.help}\n${where}`;
    })
    .join("\n\n");

  expect(violations, `${label} :\n\n${report}\n`).toEqual([]);
}

// Les écrans publics : ce sont les seuls qu'un visiteur non connecté voit,
// et donc les premiers jugés.
for (const [label, path] of [
  ["Page d'accueil", "/"],
  ["Connexion", "/login"],
  ["Inscription", "/signup"],
  ["Mot de passe oublié", "/forgot-password"],
] as const) {
  test(`${label} respecte WCAG AA`, async ({ page }) => {
    await page.goto(path);
    await audit(page, label);
  });
}

// Le back-office, connecté et peuplé. Les cookies viennent de la session
// ouverte une seule fois par `beforeAll`.
test.describe("back-office", () => {
  test.use({ storageState: SESSION });

  for (const [label, path] of [
  ["Vue d'ensemble", "/dashboard"],
  ["Immeubles", "/buildings"],
  ["Logements", "/apartments"],
  ["Locataires", "/tenants"],
  ["Baux", "/leases"],
  ["Paiements", "/payments"],
  ["Dépenses", "/expenses"],
  ["Interventions", "/maintenance"],
  ["Documents", "/documents"],
  ["Notifications", "/notifications"],
  ["Journal d'audit", "/audit"],
    ["Équipe", "/team"],
    ["Réglages", "/settings"],
  ] as const) {
    test(`${label} respecte WCAG AA`, async ({ page }) => {
      await page.goto(path);
      await audit(page, label);
    });
  }
});
