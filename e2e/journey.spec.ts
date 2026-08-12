import { test, expect, type Page } from "@playwright/test";

import {
  admin,
  deleteOrganizationsNamed,
  deleteUsersMatching,
  seedSubscription,
  testEmail,
  TEST_PASSWORD,
} from "./support/admin";

/**
 * Le parcours complet, dans un vrai navigateur, contre la vraie base.
 *
 * Un seul `test` plutôt qu'une douzaine : chaque étape dépend de l'état
 * laissé par la précédente. Les découper obligerait à recréer les pièces
 * avant chacune, ce qui testerait surtout la fixture.
 *
 * ─── Ce qui n'est PAS couvert ici, et pourquoi ──────────────────────────
 * Tout ce qui passe par un e-mail sortant : confirmation d'inscription et
 * invitation d'un collaborateur. Le SMTP intégré de Supabase répond
 * `429 — email rate limit exceeded` après une poignée d'envois, et refuse
 * par ailleurs les domaines non délivrables. Une suite qui en dépendrait
 * échouerait pour une raison sans rapport avec le code.
 *
 * La chaîne e-mail est éprouvée séparément par `signup.spec.ts`, qui ne
 * s'exécute que si `E2E_EMAIL_ENABLED=1`. Voir LIVRAISON.md.
 */

const PREFIX = "E2E Parcours";
const orgName = `${PREFIX} ${Date.now()}`;
const ownerEmail = testEmail("owner");

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

/** Ouvre le panneau de création replié. */
async function openCreationPanel(page: Page, trigger: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
}

test("de l'inscription à l'export comptable du premier carnet", async ({
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
  // L'en-tête imprimé est demandé dès l'inscription : c'est lui qui fait
  // que la première pièce ressemble à l'entreprise, pas à un formulaire.
  await page.goto("/onboarding");
  await page.getByLabel("Nom de l'organisation").fill(orgName);
  await page.getByLabel("Prénom", { exact: true }).fill("Awa");
  await page.getByLabel("Nom", { exact: true }).fill("Diallo");
  await page.getByLabel("Forme juridique").fill("S.A.R.L.");
  await page.getByLabel("Téléphone").fill("+225 27 21 00 00 00");
  await page.getByLabel("Adresse", { exact: true }).fill("Zone industrielle, lot 12");
  await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Vue d'ensemble" }),
  ).toBeVisible();

  // L'en-tête saisi doit être là : sans lui, les pièces impriment un nom
  // nu alors que l'utilisateur a fourni plus.
  const { data: org } = await admin()
    .from("organizations")
    .select("id, legal_form, phone, address")
    .eq("name", orgName)
    .single();
  expect(org?.legal_form).toBe("S.A.R.L.");
  expect(org?.phone).toBe("+225 27 21 00 00 00");

  // Abonnement Business : sans abonnement actif, `checkDocumentQuota`
  // bloque l'émission de pièces. On l'active ici via l'API admin — c'est
  // le chemin que suit le webhook Moneroo après vérification, pas un
  // parcours client. Le test éprouve l'émission, pas le paiement.
  await seedSubscription(org!.id, "business");

  // ------------------------------------------------------------ 3. Reçu
  await page.goto("/receipts");
  await openCreationPanel(page, "Nouveau reçu");
  await page.getByLabel("Reçu de M./Mme").fill("Karim Benali");
  await page.getByLabel(/^Montant \(/).fill("275000");
  // La phrase en lettres est proposée à la frappe : elle se lit dans le
  // champ, c'est elle qui s'imprimera.
  await expect(
    page.getByLabel("Montant en toutes lettres"),
  ).toHaveValue(/deux cent soixante-quinze mille/i);
  await page.getByLabel("Article(s)").fill("Fourniture et pose de garde-corps");
  await page.getByLabel("Reçu établi par").fill("Awa Diallo");
  await page.getByRole("button", { name: "Émettre le reçu" }).click();
  await expect(shown(page, "Karim Benali")).toBeVisible();

  // Le numéro vient de la base, pas du formulaire : premier reçu de
  // l'année pour une organisation toute neuve, c'est forcément le 0001.
  const { data: receipt } = await admin()
    .from("receipts")
    .select("id, number, amount_in_words")
    .eq("organization_id", org!.id)
    .single();
  expect(receipt?.number).toBe(`REC-${new Date().getFullYear()}-0001`);
  expect(receipt?.amount_in_words).toMatch(/soixante-quinze mille/i);

  // -------------------------------------------- 4. Impression du reçu
  // La feuille est le produit : on ouvre la page d'impression et on
  // vérifie qu'elle porte la pièce telle qu'elle sortira du carnet.
  await page.goto("/receipts");
  await page
    .getByRole("link", { name: receipt!.number })
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForURL("**/receipts/*");
  await expect(shown(page, "REÇU")).toBeVisible();
  await expect(shown(page, "Karim Benali")).toBeVisible();
  await expect(shown(page, orgName)).toBeVisible();

  // ------------------------------------------------ 5. Bon de caisse
  await page.goto("/cash-vouchers");
  await openCreationPanel(page, "Nouveau bon de caisse");
  await page.getByLabel("Sens du mouvement").selectOption({ label: "Entrée" });
  await page.getByLabel("Reçu de M. ou Mme").fill("Karim Benali");
  await page.getByLabel(/^Montant \(/).fill("120000");
  await page.getByLabel("Motif").fill("Achat de consommables de soudure");
  await page.getByLabel("Ordre donné par").fill("Direction générale");
  // La référence de dépôt n'existe qu'en mode « Dépôt » : l'afficher en
  // permanence invitait à la remplir avec « Cash » coché.
  await expect(
    page.getByLabel("Référence du dépôt"),
  ).not.toBeVisible();
  await page.getByLabel("Règlement").selectOption({ label: "Dépôt" });
  await page.getByLabel("Référence du dépôt").fill("Bordereau nº 4471");
  await page.getByRole("button", { name: "Émettre le bon" }).click();
  await expect(shown(page, "Direction générale")).toBeHidden(); // pas affiché en liste
  await expect(shown(page, "Karim Benali")).toBeVisible();

  const { data: voucher } = await admin()
    .from("cash_vouchers")
    .select("number, settlement, deposit_ref")
    .eq("organization_id", org!.id)
    .single();
  expect(voucher?.number).toBe(`BC-${new Date().getFullYear()}-0001`);
  expect(voucher?.deposit_ref).toBe("Bordereau nº 4471");

  // ------------------------------------------------ 6. Bon de sortie
  // `DeliveryLines` rend deux jeux d'inputs (mobile empilé + desktop table)
  // avec le même `aria-label` : seul un est visible selon la largeur. On
  // filtre sur la visibilité pour satisfaire le mode strict de Playwright.
  await page.goto("/delivery-notes");
  await openCreationPanel(page, "Nouveau bon de sortie");
  await page.getByLabel("Nom de l'émetteur").fill("Awa Diallo");
  await page.getByLabel("Service").fill("Magasin");
  await page.getByLabel("Désignation, ligne 1").filter({ visible: true }).first().fill("Tôles galvanisées");
  await page.getByLabel("Quantité, ligne 1").filter({ visible: true }).first().fill("12");
  await page.getByLabel("Destination, ligne 1").filter({ visible: true }).first().fill("Chantier Koumassi");
  await page.getByLabel("Désignation, ligne 2").filter({ visible: true }).first().fill("Ciment");
  await page.getByLabel("Quantité, ligne 2").filter({ visible: true }).first().fill("40 sacs");
  // La troisième ligne reste vide : elle ne doit pas s'immiscer en base.
  await page.getByRole("button", { name: "Émettre le bon" }).click();
  await expect(shown(page, "Awa Diallo")).toBeVisible();

  const { data: note } = await admin()
    .from("delivery_notes")
    .select("id, number")
    .eq("organization_id", org!.id)
    .single();
  expect(note?.number).toBe(`BS-${new Date().getFullYear()}-0001`);

  const { data: lines } = await admin()
    .from("delivery_note_lines")
    .select("designation, position")
    .eq("delivery_note_id", note!.id);
  expect(lines).toHaveLength(2);
  expect(lines?.map((l) => l.designation).sort()).toEqual([
    "Ciment",
    "Tôles galvanisées",
  ]);

  // L'aperçu reprend le papier : tableau encadré, mentions de visa.
  await page.goto("/delivery-notes");
  await page
    .getByRole("link", { name: note!.number })
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForURL("**/delivery-notes/*");
  await expect(shown(page, "BON DE SORTIE")).toBeVisible();
  await expect(shown(page, "Tôles galvanisées")).toBeVisible();
  await expect(shown(page, "Exemplaire chauffeur")).toBeVisible();

  // ------------------------------------------------- 7. Recherche globale
  // Par numéro comme par nom : c'est le geste du comptoir, « le reçu de
  // Benali, vous l'avez ? ».
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByLabel("Terme de recherche").fill("Benali");
  await expect(
    page.getByRole("button", { name: new RegExp(receipt!.number) }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(voucher!.number) }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(receipt!.number) }).click();
  await page.waitForURL("**/receipts/*");

  // ------------------------------------------------------ 8. Exports CSV
  // On lit la réponse brute : c'est le fichier remis au comptable qui
  // compte, pas l'apparence du bouton.
  const csv = await page.request.get("/export/recus");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toContain(".csv");

  const body = await csv.text();
  // Le BOM d'abord : sans lui, Excel casse tous les accents du fichier.
  expect(body.startsWith("﻿")).toBe(true);

  const csvLines = body.slice(1).split("\r\n");
  expect(csvLines[0]).toBe(
    "Numéro;Date;Reçu de;Montant;Avance;Reste;Article(s);Établi par;Émis le",
  );
  // Autant de lignes que de reçus, plus l'en-tête : l'en-tête de réponse
  // permet de le vérifier sans compter à la main.
  expect(Number(csv.headers()["x-row-count"])).toBe(csvLines.length - 1);
  expect(csvLines.length - 1).toBe(1);
  expect(body).toContain("Karim Benali");

  const notesCsv = await page.request.get("/export/bons-de-sortie");
  const notesBody = await notesCsv.text();
  // Les articles tiennent en une cellule : le fichier suit la pièce, pas
  // la ligne.
  expect(notesBody).toContain("Tôles galvanisées × 12");
  expect(notesBody).toContain("Ciment × 40 sacs");

  // --------------------------------------------- 9. Journal d'audit
  // Émis par trigger : le propriétaire doit voir la trace des trois pièces
  // sans que l'application y ait pensé.
  await page.goto("/audit");
  await expect(shown(page, "Journal d'audit")).toBeVisible();
  const { count: audited } = await admin()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org!.id);
  expect(audited).toBeGreaterThanOrEqual(3);

  // ------------------------------------------------------ 10. Réglages
  await page.goto("/settings");
  await expect(shown(page, "Connexions récentes")).toBeVisible();
  // La connexion du propriétaire vient d'être journalisée par
  // `record_login_event`.
  await expect(shown(page, "Réussie").first()).toBeVisible();

  // Renommer son organisation : plusieurs formulaires portent
  // « Enregistrer » — profil, puis en-tête ; c'est le dernier.
  const renamed = `${orgName} SARL`;
  await page.getByLabel("Nom de l'organisation").fill(renamed);
  await page.getByRole("button", { name: "Enregistrer" }).last().click();

  // Le nom se vérifie en base : le bandeau latéral qui l'affiche est
  // masqué sur mobile, l'assertion ne tiendrait que sur un seul des deux
  // projets.
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
