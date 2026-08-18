/**
 * Preuve exécutable du cloisonnement multi-tenant.
 *
 *   npm run verify:rls
 *
 * Crée deux organisations jetables et quelques comptes, vérifie qu'aucun
 * périmètre ne déborde sur l'autre, puis supprime tout ce qu'il a créé. À
 * lancer sur un projet de développement, jamais en production : le script
 * écrit en base.
 *
 * Ce fichier existe parce qu'une politique RLS relue n'est pas une
 * politique RLS testée. Les erreurs de cloisonnement ne se voient pas à
 * l'usage — elles se voient le jour où un client lit les données d'un
 * autre.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  let raw;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    console.error("Fichier .env.local introuvable. Lancez le script depuis la racine du projet.");
    process.exit(1);
  }
  const env = Object.fromEntries(
    raw.split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[k]) {
      console.error(`Variable ${k} absente de .env.local.`);
      process.exit(1);
    }
  }
  return env;
}

const env = readEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PWD = "Verif-" + Math.random().toString(36).slice(2) + "-Aa1!";
const stamp = Date.now();
const created = { users: [], orgs: [], transactions: [], intents: [] };
let failures = 0;

/** Une assertion : le message décrit ce qui DOIT être vrai. */
function check(pass, expectation, failureDetail) {
  if (pass) {
    console.log(`  ✓ ${expectation}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${expectation}${failureDetail ? ` — ${failureDetail}` : ""}`);
}

/** Échec sans assertion associée : erreur d'exécution du script lui-même. */
function fail(message) {
  failures += 1;
  console.log(`  ✗ ${message}`);
}

async function signedInUser(tag) {
  const email = `verif-${tag}-${stamp}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PWD, email_confirm: true,
  });
  if (error) throw new Error(`création du compte ${tag} : ${error.message}`);
  created.users.push(data.user.id);

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PWD });
  if (signInError) throw new Error(`connexion ${tag} : ${signInError.message}`);
  return { client, email, id: data.user.id };
}

/**
 * Crée un membre de l'organisation, avec un rôle donné, et le connecte.
 *
 * Le profil est inséré avec la clé service_role : c'est le chemin que suit
 * l'invitation d'un collaborateur, et la seule façon d'obtenir un rôle
 * autre que « owner » — aucune policy n'autorise l'INSERT dans `profiles`.
 */
async function member(tag, orgId, role) {
  const email = `verif-${tag}-${stamp}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PWD, email_confirm: true,
  });
  if (error) throw new Error(`création du compte ${tag} : ${error.message}`);
  created.users.push(data.user.id);

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id, organization_id: orgId,
    firstname: "Test", lastname: tag, email, role,
  });
  if (profileError) throw new Error(`profil ${tag} : ${profileError.message}`);

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email, password: PWD });
  return { client, email, id: data.user.id };
}

/** Une pièce minimale de chaque nature. Le numéro n'est jamais fourni. */
const receiptDraft = (orgId) => ({
  organization_id: orgId, issued_on: "2026-01-15",
  payer: "Awa Diallo", amount: 250000,
});

const voucherDraft = (orgId) => ({
  organization_id: orgId, issued_on: "2026-01-15",
  counterparty: "Awa Diallo", amount: 120000, direction: "sortie",
});

/**
 * Suppression manuelle, enfants avant parents.
 *
 * `DELETE FROM organizations` seul suffirait si le trigger d'audit ne
 * s'invitait pas dans la cascade : voir la garde « organisation déjà
 * supprimée » dans `audit_trigger()`. On ne dépend pas d'elle ici — un
 * script de nettoyage doit fonctionner même sur un schéma pas encore à
 * jour, sinon il abandonne ses propres déchets.
 */
const CLEANUP_ORDER = [
  "delivery_note_lines", "delivery_notes", "cash_vouchers", "receipts",
  "document_counters", "audit_logs", "payments", "subscriptions", "profiles",
];

async function cleanup() {
  // `payment_events` n'est pas rattachée à une organisation : la
  // notification arrive avant qu'on sache à qui elle appartient. On la
  // nettoie donc par les identifiants de transaction que l'on a émis.
  if (created.transactions.length) {
    await admin.from("payment_events")
      .delete().in("transaction_id", created.transactions);
  }
  // Une intention non provisionnée (pending/failed/cancelled) ne se
  // rattache à aucune organisation : son paiement non plus. Les deux se
  // nettoient donc par l'identifiant de l'intention, avant la boucle par
  // organisation ci-dessous — laquelle couvre les intentions qui, elles,
  // ont bien abouti à une organisation créée.
  if (created.intents.length) {
    await admin.from("payments").delete().in("intent_id", created.intents);
    await admin.from("signup_intents").delete().in("id", created.intents);
  }
  for (const orgId of created.orgs) {
    for (const table of CLEANUP_ORDER) {
      await admin.from(table).delete().eq("organization_id", orgId);
    }
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

try {
  console.log("\nFONDATIONS");
  const a = await signedInUser("a");
  const b = await signedInUser("b");

  // Une organisation ne naît plus que d'un paiement confirmé. `create_organization`
  // est révoquée pour `authenticated` : le semis passe donc par la clé de
  // service, comme le fait `provision_signup_intent` en production.
  for (const [tag, u] of [["A", a], ["B", b]]) {
    const { data: org, error: orgErr } = await admin.from("organizations")
      .insert({ name: `Vérification ${tag} ${stamp}`, slug: `verif-${tag.toLowerCase()}-${stamp}` })
      .select("id").single();
    if (orgErr) throw new Error(`organisation ${tag} : ${orgErr.message}`);

    const { error: profErr } = await admin.from("profiles").insert({
      id: u.id, organization_id: org.id, firstname: "Test", lastname: tag,
      email: u.email, role: "owner",
    });
    if (profErr) throw new Error(`profil ${tag} : ${profErr.message}`);

    u.orgId = org.id;
    created.orgs.push(org.id);
  }

  // Et la porte que ce semis contourne doit rester close. Un compte
  // authentifié SANS profil — collaborateur retiré dont le compte a
  // survécu, inscription de l'ancien parcours restée en plan — pouvait
  // s'ouvrir une organisation en une requête à PostgREST, sans rien payer.
  {
    const orphan = await signedInUser("orphelin");
    const { data: forged, error: rpcErr } = await orphan.client.rpc("create_organization", {
      org_name: `Contournement ${stamp}`, first_name: "", last_name: "",
    });
    // Sur un schéma pas encore corrigé, l'appel ABOUTIT : l'assertion
    // échouera, mais l'organisation ainsi créée doit être nettoyée comme
    // les autres, sans quoi la vérification laisse derrière elle
    // exactement ce qu'elle dénonce.
    if (forged) created.orgs.push(forged);
    check(
      Boolean(rpcErr),
      "un compte sans profil ne se fabrique pas une organisation sans payer",
      "create_organization a été acceptée",
    );
  }

  const { data: receipt, error: rErr } = await a.client
    .from("receipts").insert(receiptDraft(a.orgId)).select().single();
  if (rErr) throw new Error(`émission d'un reçu : ${rErr.message}`);

  const { data: voucher, error: vErr } = await a.client
    .from("cash_vouchers").insert(voucherDraft(a.orgId)).select().single();
  if (vErr) throw new Error(`émission d'un bon de caisse : ${vErr.message}`);

  const { data: note, error: nErr } = await a.client.from("delivery_notes")
    .insert({ organization_id: a.orgId, issued_on: "2026-01-15", issuer: "Awa Diallo" })
    .select().single();
  if (nErr) throw new Error(`émission d'un bon de sortie : ${nErr.message}`);

  const { error: lineErr } = await a.client.from("delivery_note_lines").insert({
    organization_id: a.orgId, delivery_note_id: note.id,
    position: 0, designation: "Tôles galvanisées", quantity: "12",
  });
  if (lineErr) throw new Error(`ligne de bon de sortie : ${lineErr.message}`);
  check(true, "A émet un reçu, un bon de caisse et un bon de sortie");

  console.log("\nNUMÉROTATION");
  check(
    receipt.number === "REC-2026-0001",
    "le premier reçu de l'année porte REC-2026-0001",
    `obtenu : ${receipt.number}`,
  );
  check(
    voucher.number === "BC-2026-0001" && note.number === "BS-2026-0001",
    "chaque nature de pièce a son propre compteur",
    `obtenus : ${voucher.number}, ${note.number}`,
  );

  const { data: second } = await a.client
    .from("receipts").insert(receiptDraft(a.orgId)).select().single();
  check(
    second?.number === "REC-2026-0002",
    "la numérotation est continue",
    `obtenu : ${second?.number}`,
  );

  // Le déclencheur écrase toute valeur fournie : l'API PostgREST est
  // publique, un client pourrait sinon choisir son numéro et en produire
  // deux identiques.
  const { data: forged } = await a.client.from("receipts")
    .insert({ ...receiptDraft(a.orgId), number: "REC-2026-9999" })
    .select().single();
  check(
    forged?.number === "REC-2026-0003",
    "un numéro imposé par le client est ignoré",
    `obtenu : ${forged?.number}`,
  );

  // La numérotation est propre à chaque organisation : B ne doit pas
  // « hériter » du rang de A, ni deviner combien de pièces A a émises.
  const { data: bFirst } = await b.client
    .from("receipts").insert(receiptDraft(b.orgId)).select().single();
  check(
    bFirst?.number === "REC-2026-0001",
    "B repart à REC-2026-0001, sans rien apprendre du volume de A",
    `obtenu : ${bFirst?.number}`,
  );

  const { error: renumberErr } = await a.client.from("receipts")
    .update({ number: "REC-2026-0500" }).eq("id", receipt.id);
  const { data: numberAfter } = await admin.from("receipts")
    .select("number").eq("id", receipt.id).single();
  check(
    Boolean(renumberErr) && numberAfter.number === receipt.number,
    "le numéro d'une pièce émise ne se modifie plus",
    `numéro devenu ${numberAfter?.number}`,
  );

  console.log("\nRÈGLES APPLIQUÉES EN BASE");
  const { error: depositErr } = await a.client.from("cash_vouchers").insert({
    ...voucherDraft(a.orgId), settlement: "cash", deposit_ref: "VIR-8891",
  });
  check(
    Boolean(depositErr),
    "une référence de dépôt sur un règlement en espèces est rejetée",
    "la pièce a été acceptée",
  );

  const { error: emptyPayerErr } = await a.client.from("receipts")
    .insert({ ...receiptDraft(a.orgId), payer: "   " });
  check(Boolean(emptyPayerErr), "un reçu sans payeur est rejeté");

  const { error: negativeErr } = await a.client.from("receipts")
    .insert({ ...receiptDraft(a.orgId), amount: -1 });
  check(Boolean(negativeErr), "un montant négatif est rejeté");

  const { data: logs } = await a.client.from("audit_logs").select("id");
  check(
    Boolean(logs?.length),
    `les écritures sont journalisées sans intervention applicative (${logs?.length ?? 0})`,
  );

  console.log("\nCLOISONNEMENT ENTRE ORGANISATIONS");
  for (const t of [
    "receipts", "cash_vouchers", "delivery_notes", "delivery_note_lines",
    "document_counters", "audit_logs",
  ]) {
    const { data, error } = await b.client.from(t).select("*");
    if (error) {
      check(true, `${t} : refusé à B (${error.code})`);
      continue;
    }
    // B a émis un reçu, donc possède son propre compteur et son propre
    // journal : on vérifie qu'il ne voit rien DE A, pas qu'il ne voit rien.
    const foreign = (data ?? []).filter((row) => row.organization_id === a.orgId);
    check(
      foreign.length === 0,
      `${t} : B ne voit rien de A`,
      `${foreign.length} ligne(s) de A visible(s)`,
    );
  }

  // La clé étrangère composite (delivery_note_id, organization_id) rend la
  // chose structurellement impossible : ce n'est pas une règle applicative.
  const { error: crossErr } = await b.client.from("delivery_note_lines").insert({
    organization_id: b.orgId, delivery_note_id: note.id,
    position: 0, designation: "INTRUS",
  });
  check(
    Boolean(crossErr),
    `rattacher un article au bon de sortie de A est rejeté (${crossErr?.code ?? "—"})`,
  );

  // Sous RLS, un UPDATE hors périmètre ne lève pas d'erreur : il ne touche
  // simplement aucune ligne. C'est donc la base qu'on interroge.
  await b.client.from("receipts").update({ payer: "Détourné" }).eq("id", receipt.id);
  const { data: payerAfter } = await admin.from("receipts")
    .select("payer").eq("id", receipt.id).single();
  check(
    payerAfter.payer === "Awa Diallo",
    "B ne peut pas corriger un reçu de A",
    `payeur devenu ${payerAfter.payer}`,
  );

  await b.client.from("receipts").delete().eq("id", receipt.id);
  const { count: stillThere } = await admin.from("receipts")
    .select("id", { count: "exact", head: true }).eq("id", receipt.id);
  check(stillThere === 1, "B ne peut pas supprimer un reçu de A");

  console.log("\nDROITS PAR RÔLE");
  const cashier = await member("caissier", a.orgId, "accountant");
  const reader = await member("lecteur", a.orgId, "viewer");

  const { data: byCashier, error: cashierErr } = await cashier.client
    .from("receipts").insert(receiptDraft(a.orgId)).select().single();
  check(!cashierErr, "le caissier émet des pièces : c'est son métier", cashierErr?.message);

  const { error: readerErr } = await reader.client
    .from("receipts").insert(receiptDraft(a.orgId));
  check(Boolean(readerErr), "le lecteur n'émet rien");

  // Une suppression laisse un trou dans la numérotation, qu'un contrôle
  // relève : le geste est réservé au propriétaire et au gestionnaire.
  if (byCashier) {
    await cashier.client.from("receipts").delete().eq("id", byCashier.id);
    const { count: survived } = await admin.from("receipts")
      .select("id", { count: "exact", head: true }).eq("id", byCashier.id);
    check(survived === 1, "le caissier ne supprime pas ses propres pièces");

    const { data: readable } = await reader.client
      .from("receipts").select("id").eq("id", byCashier.id);
    check(readable?.length === 1, "le lecteur consulte et imprime");

    await a.client.from("receipts").delete().eq("id", byCashier.id);
    const { count: deleted } = await admin.from("receipts")
      .select("id", { count: "exact", head: true }).eq("id", byCashier.id);
    check(deleted === 0, "le propriétaire supprime, et lui seul en répond");
  }

  const { data: cashierLogs } = await cashier.client.from("audit_logs").select("id");
  check(
    (cashierLogs?.length ?? 0) === 0,
    "le journal d'audit reste réservé au propriétaire et au gestionnaire",
    `${cashierLogs?.length ?? 0} entrée(s) visible(s)`,
  );

  /**
   * ESCALADE DE PRIVILÈGES
   *
   * Le RLS raisonne par lignes, jamais par colonnes. `profiles_update`
   * autorise chacun à modifier SA ligne — pour corriger son nom — et cette
   * permission englobait `role`. Un lecteur exécutait donc
   *
   *   UPDATE profiles SET role='owner' WHERE id=auth.uid()
   *
   * et devenait propriétaire de l'organisation qui l'héberge. Aucun écran ne
   * proposait ce geste, mais l'API PostgREST est publique : le formulaire
   * n'est pas la frontière. Un déclencheur fige désormais ces colonnes.
   *
   * Ces assertions échouent tant que `supabase/schema.sql` n'a pas été
   * rejoué — c'est voulu : un schéma vulnérable doit faire rougir la CI.
   */
  console.log("\nESCALADE DE PRIVILÈGES");

  await reader.client.from("profiles").update({ role: "owner" }).eq("id", reader.id);
  const { data: roleAfter } = await admin.from("profiles")
    .select("role").eq("id", reader.id).single();
  check(
    roleAfter.role === "viewer",
    "un lecteur ne peut pas se promouvoir propriétaire",
    `rôle devenu ${roleAfter.role}`,
  );

  // Le caissier non plus, alors qu'il a le droit d'écrire des pièces : le
  // droit d'écriture métier n'est pas un droit d'administration.
  await cashier.client.from("profiles").update({ role: "owner" }).eq("id", cashier.id);
  const { data: cashierRole } = await admin.from("profiles")
    .select("role").eq("id", cashier.id).single();
  check(
    cashierRole.role === "accountant",
    "le caissier ne se promeut pas non plus",
    `rôle devenu ${cashierRole.role}`,
  );

  await reader.client.from("profiles")
    .update({ organization_id: b.orgId }).eq("id", reader.id);
  const { data: orgAfter } = await admin.from("profiles")
    .select("organization_id").eq("id", reader.id).single();
  check(
    orgAfter.organization_id === a.orgId,
    "il ne peut pas se rattacher à une autre organisation",
    "profil transféré chez B",
  );

  await reader.client.from("organizations")
    .update({ name: "Détournée" }).eq("id", a.orgId);
  const { data: orgName } = await admin.from("organizations")
    .select("name").eq("id", a.orgId).single();
  check(
    orgName.name.startsWith("Vérification A"),
    "l'en-tête imprimé n'appartient qu'au propriétaire",
    `nom devenu ${orgName.name}`,
  );

  // Le verrou ne doit pas emporter le geste légitime avec lui : sans cette
  // assertion, on « corrigerait » la faille en cassant la gestion d'équipe.
  const { error: promoteErr } = await a.client
    .from("profiles").update({ role: "manager" }).eq("id", reader.id);
  const { data: promoted } = await admin.from("profiles")
    .select("role").eq("id", reader.id).single();
  check(
    promoted.role === "manager",
    "un propriétaire promeut toujours un collaborateur",
    `rôle resté ${promoted.role}${promoteErr ? ` (${promoteErr.message})` : ""}`,
  );

  /**
   * Les fonctions réservées au serveur ne s'appellent pas depuis une session.
   *
   * L'attaquant réaliste n'est pas anonyme : c'est un client légitime, au
   * rôle le plus faible, qui connaît l'API que son propre navigateur
   * emploie. `confirm_payment` lui suffirait à s'activer un abonnement
   * sans payer ; `sweep_subscriptions` à faire expirer ceux de tout le
   * monde ; `provision_signup_intent` à se fabriquer une organisation.
   *
   * Ces fonctions portaient bien un `REVOKE ... FROM anon, authenticated`
   * — mais il ne retirait rien : PostgreSQL accorde EXECUTE à PUBLIC, dont
   * ces deux rôles héritent, et l'on ne révoque pas un droit qu'ils ne
   * détiennent pas en propre. La garde se lisait dans le fichier sans
   * exister en base. Elle porte désormais sur PUBLIC.
   */
  {
    const NIL = "00000000-0000-0000-0000-000000000000";
    const reserved = [
      ["confirm_payment", { p_transaction_id: "SONDE", p_method: null }],
      ["fail_payment", { p_transaction_id: "SONDE" }],
      ["sweep_subscriptions", {}],
      ["confirm_signup_payment", { p_transaction_id: "SONDE", p_method: null }],
      ["provision_signup_intent", { p_intent_id: NIL, p_user_id: NIL }],
      ["fail_signup_intent", { p_transaction_id: "SONDE" }],
      ["claim_signup_intent", { p_intent_id: NIL }],
      ["signup_intent_status", { p_intent_id: NIL }],
      ["next_document_number", { p_organization: NIL, p_kind: "receipt", p_year: 2026 }],
    ];

    const reachable = [];
    for (const [name, args] of reserved) {
      const { error } = await reader.client.rpc(name, args);
      if (!error || (error.code !== "42501" && error.code !== "PGRST202")) {
        reachable.push(name);
      }
    }
    check(
      reachable.length === 0,
      "un lecteur n'atteint aucune fonction réservée au serveur",
      `atteignables : ${reachable.join(", ")}`,
    );
  }

  /**
   * ABONNEMENTS ET PAIEMENTS
   *
   * L'argent est la surface la plus tentante du produit. Trois choses
   * doivent tenir en base, indépendamment de ce que fait le code :
   *
   *   — le tarif est public en lecture (il faut bien l'afficher) mais
   *     jamais modifiable par un client, sinon on s'abonne à 1 franc ;
   *   — nul ne fait passer son propre paiement à « payé » : cette
   *     transition n'appartient qu'au webhook, après vérification chez
   *     le fournisseur de paiement, via la clé service_role ;
   *   — une organisation ne voit ni les abonnements ni les paiements
   *     d'une autre.
   */
  console.log("\nABONNEMENTS ET PAIEMENTS");

  const { data: plans, error: plansErr } = await a.client
    .from("plans").select("*").order("price");

  if (plansErr || !plans?.length) {
    fail(
      "aucun plan lisible — exécutez supabase/subscriptions.sql" +
        (plansErr ? ` (${plansErr.message})` : ""),
    );
  } else {
    check(plans.length >= 3, `les offres sont lisibles (${plans.length})`);

    const starter = plans.find((p) => p.slug === "starter");
    const unlimited = plans.find((p) => p.slug === "unlimited");

    check(
      Number(starter?.price) === 3000 && starter?.currency === "XOF",
      "le tarif Starter fait foi en base, pas dans le code",
      `obtenu : ${starter?.price} ${starter?.currency}`,
    );

    // Le plan illimité ne s'exprime pas par un nombre très grand : la
    // colonne est nulle et deux drapeaux le disent.
    check(
      unlimited?.is_unlimited_documents === true &&
        unlimited?.document_limit === null,
      "l'offre illimitée est décrite par un drapeau, non par 999999999",
      `limite : ${unlimited?.document_limit}`,
    );

    await a.client.from("plans").update({ price: 1 }).eq("id", starter.id);
    const { data: priceAfter } = await admin.from("plans")
      .select("price").eq("id", starter.id).single();
    check(
      Number(priceAfter.price) === 3000,
      "un client ne peut pas se fabriquer un tarif à 1 franc",
      `tarif devenu ${priceAfter.price}`,
    );

    // Souscription : le propriétaire seul ouvre un abonnement.
    const { data: sub, error: subErr } = await a.client
      .from("subscriptions")
      .insert({ organization_id: a.orgId, plan_id: starter.id, status: "pending" })
      .select().single();
    check(!subErr, "le propriétaire ouvre un abonnement", subErr?.message);

    const { error: cashierSubErr } = await cashier.client
      .from("subscriptions")
      .insert({ organization_id: a.orgId, plan_id: starter.id, status: "pending" });
    check(
      Boolean(cashierSubErr),
      "le caissier ne souscrit pas au nom de l'entreprise",
      "l'abonnement a été accepté",
    );

    if (sub) {
      // Le montant est celui du plan : c'est le serveur qui l'inscrit.
      const tx = `VERIF-${stamp}`;
      created.transactions.push(tx);

      const { data: payment, error: payErr } = await a.client
        .from("payments").insert({
          organization_id: a.orgId, user_id: a.id,
          subscription_id: sub.id, plan_id: starter.id,
          transaction_id: tx, amount: starter.price,
          currency: starter.currency, status: "pending",
        }).select().single();
      check(!payErr, "le paiement est enregistré en attente", payErr?.message);

      // Le doublon est écarté par la base : c'est ce qui rend le webhook
      // rejouable sans risque de compter deux fois.
      const { error: dupErr } = await a.client.from("payments").insert({
        organization_id: a.orgId, plan_id: starter.id,
        transaction_id: tx, amount: starter.price,
        currency: starter.currency, status: "pending",
      });
      check(
        Boolean(dupErr),
        `un identifiant de transaction déjà utilisé est refusé (${dupErr?.code ?? "—"})`,
      );

      if (payment) {
        await a.client.from("payments")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", payment.id);
        const { data: payAfter } = await admin.from("payments")
          .select("status").eq("id", payment.id).single();
        check(
          payAfter.status === "pending",
          "nul ne déclare son propre paiement acquitté",
          `statut devenu ${payAfter.status}`,
        );
      }

      await a.client.from("subscriptions")
        .update({ status: "active", expires_at: "2099-01-01T00:00:00Z" })
        .eq("id", sub.id);
      const { data: subAfter } = await admin.from("subscriptions")
        .select("status").eq("id", sub.id).single();
      check(
        subAfter.status === "pending",
        "nul ne s'active un abonnement sans passer par le paiement",
        `statut devenu ${subAfter.status}`,
      );

      for (const t of ["subscriptions", "payments"]) {
        const { data } = await b.client.from(t).select("*");
        const foreign = (data ?? []).filter((r) => r.organization_id === a.orgId);
        check(
          foreign.length === 0,
          `${t} : B ne voit rien de A`,
          `${foreign.length} ligne(s) de A visible(s)`,
        );
      }

      // Le journal des notifications contient les réponses brutes de
      // du fournisseur : il reste hors de portée de tout client.
      await admin.from("payment_events").insert({
        transaction_id: tx, event_type: "verification", payload: { probe: true },
      });
      const { data: events } = await a.client.from("payment_events").select("*");
      check(
        (events ?? []).length === 0,
        "le journal des notifications de paiement est inaccessible aux clients",
        `${(events ?? []).length} entrée(s) visible(s)`,
      );
    }
  }

  console.log("\nINSCRIPTION SUBORDONNÉE AU PAIEMENT");
  /**
   * Jusqu'ici, l'organisation et le compte Supabase Auth naissaient à
   * l'inscription — avant tout paiement. Cette section prouve l'inverse :
   * AUCUNE ligne dans `organizations` ou `profiles`, et AUCUNE session,
   * n'existe tant que le webhook Moneroo n'a pas confirmé l'encaissement.
   *
   * `generateLink({type:'invite'|'recovery'})` est appelé pour de vrai :
   * c'est une opération Supabase Auth pure, qui ne contacte jamais
   * Moneroo. Rien ici n'ouvre de transaction réelle chez le fournisseur.
   */
  async function rpc(name, args) {
    const { data, error } = await admin.rpc(name, args);
    if (error) return { error };
    return { data: Array.isArray(data) ? data[0] : data };
  }

  async function findUserByEmail(email) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  }

  const { data: starterPlan, error: starterErr } = await admin
    .from("plans").select("id, price, duration_days").eq("slug", "starter").single();
  if (starterErr || !starterPlan) {
    fail(`plan starter introuvable : ${starterErr?.message ?? "?"}`);
  } else {
    /** Ouvre une intention + son paiement 'pending', comme le fait /signup. */
    async function openIntent(tag) {
      const email = `verif-signup-${tag}-${stamp}@example.invalid`;
      const { data: intent, error: intentErr } = await admin
        .from("signup_intents")
        .insert({ email, org_name: `Inscription ${tag} ${stamp}`, plan_id: starterPlan.id })
        .select("id").single();
      if (intentErr) throw new Error(`ouverture d'intention ${tag} : ${intentErr.message}`);
      created.intents.push(intent.id);

      const tx = `VERIF-SIGNUP-${tag}-${stamp}`;
      created.transactions.push(tx);
      const { error: payErr } = await admin.from("payments").insert({
        intent_id: intent.id, organization_id: null, plan_id: starterPlan.id,
        transaction_id: tx, amount: starterPlan.price, currency: "XOF", status: "pending",
      });
      if (payErr) throw new Error(`paiement d'intention ${tag} : ${payErr.message}`);

      return { email, intentId: intent.id, tx };
    }

    // ── pending → aucun compte ────────────────────────────────────────
    const pend = await openIntent("pending");
    check(
      !(await findUserByEmail(pend.email)),
      "une intention 'pending' ne crée aucun compte Supabase Auth",
    );
    const { data: pendProfile } = await admin.from("profiles").select("id").eq("email", pend.email).maybeSingle();
    check(!pendProfile, "une intention 'pending' ne crée aucun profil");

    // ── retour manuel sur /payment/success → aucun accès ───────────────
    // Réclamer une intention qui n'est pas encore 'active' n'ouvre rien.
    const earlyClaim = await rpc("claim_signup_intent", { p_intent_id: pend.intentId });
    check(
      earlyClaim.data?.claimed === false,
      "réclamer une intention non payée n'ouvre aucune session",
      JSON.stringify(earlyClaim.data ?? earlyClaim.error),
    );

    // ── failed → aucun compte ───────────────────────────────────────────
    await admin.rpc("fail_signup_intent", { p_transaction_id: pend.tx, p_status: "failed" });
    const { data: afterFail } = await admin.from("signup_intents").select("status").eq("id", pend.intentId).single();
    check(afterFail?.status === "failed", "un paiement refusé fait passer l'intention à 'failed'", afterFail?.status);
    check(!(await findUserByEmail(pend.email)), "une intention 'failed' n'a créé aucun compte");

    // ── cancelled → aucun compte ────────────────────────────────────────
    const canc = await openIntent("cancelled");
    await admin.rpc("fail_signup_intent", { p_transaction_id: canc.tx, p_status: "cancelled" });
    const { data: afterCancel } = await admin.from("signup_intents").select("status").eq("id", canc.intentId).single();
    check(afterCancel?.status === "cancelled", "une annulation fait passer l'intention à 'cancelled'", afterCancel?.status);
    check(!(await findUserByEmail(canc.email)), "une intention 'cancelled' n'a créé aucun compte");

    // ── montant falsifié → refusé avant même d'être écrit ──────────────
    // Aucune policy n'autorise quiconque hors service_role à écrire dans
    // `payments` : un montant forgé ne peut donc jamais s'y inscrire, pas
    // même le temps d'être détecté puis corrigé.
    {
      const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: forgedErr } = await anon.from("payments").insert({
        intent_id: pend.intentId, plan_id: starterPlan.id,
        transaction_id: `FORGE-${stamp}`, amount: 1, currency: "XOF", status: "pending",
      });
      check(
        Boolean(forgedErr),
        "un montant forgé ne peut pas être écrit par un client anonyme",
        "l'insertion a été acceptée",
      );
    }

    // ── paid → compte créé, abonnement actif, quotas appliqués ─────────
    const paid = await openIntent("paid");
    const confirmed = await rpc("confirm_signup_payment", { p_transaction_id: paid.tx, p_method: "success" });
    check(confirmed.data?.outcome === "confirmed", "un paiement confirmé fait passer l'intention à 'paid'", JSON.stringify(confirmed.data ?? confirmed.error));

    const { data: invited, error: inviteErr } = await admin.auth.admin.generateLink({
      type: "invite", email: paid.email,
    });
    if (inviteErr || !invited?.user) {
      fail(`generateLink invite : ${inviteErr?.message ?? "utilisateur absent"}`);
    } else {
      created.users.push(invited.user.id);

      const provisioned = await rpc("provision_signup_intent", {
        p_intent_id: paid.intentId, p_user_id: invited.user.id,
      });
      check(provisioned.data?.outcome === "provisioned", "le paiement confirmé provisionne le compte", JSON.stringify(provisioned.data ?? provisioned.error));

      const orgId = provisioned.data?.organization_id;
      if (orgId) created.orgs.push(orgId);

      const { data: newProfile } = await admin.from("profiles")
        .select("id, organization_id, role, email").eq("id", invited.user.id).maybeSingle();
      check(
        newProfile?.organization_id === orgId && newProfile?.role === "owner" && newProfile?.email === paid.email,
        "le profil créé est propriétaire de la nouvelle organisation",
        JSON.stringify(newProfile),
      );

      const { data: newSub } = await admin.from("subscriptions")
        .select("status, plan_id, expires_at").eq("organization_id", orgId).maybeSingle();
      check(
        newSub?.status === "active" && newSub?.plan_id === starterPlan.id,
        "l'abonnement créé est actif, sur le plan payé",
        JSON.stringify(newSub),
      );

      const { data: linkedPayment } = await admin.from("payments")
        .select("organization_id").eq("transaction_id", paid.tx).single();
      check(
        linkedPayment?.organization_id === orgId,
        "le tout premier paiement est rattaché a posteriori à l'organisation",
        linkedPayment?.organization_id,
      );

      // Abonnement actif → accès autorisé. Le mot de passe se pose par le
      // chemin RÉEL, et non par un raccourci d'administration : le compte
      // né de `generateLink(invite)` a son adresse NON confirmée, et seul
      // le passage par `/auth/callback` la confirme. Le poser directement
      // laissait un compte incapable de se connecter — le raccourci
      // prouvait donc autre chose que ce qu'il prétendait prouver.
      const { data: recovery, error: recErr } = await admin.auth.admin.generateLink({
        type: "recovery", email: paid.email,
      });
      if (recErr || !recovery?.properties?.hashed_token) {
        fail(`lien de réclamation : ${recErr?.message ?? "jeton absent"}`);
      } else {
        const owner = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

        // Ce que fait `/auth/callback` : vérifier le jeton haché côté
        // serveur. La session s'ouvre, et l'adresse est confirmée du
        // même geste.
        const { data: opened, error: otpErr } = await owner.auth.verifyOtp({
          type: "recovery", token_hash: recovery.properties.hashed_token,
        });
        check(Boolean(opened?.session), "le lien de réclamation ouvre une session", otpErr?.message);
        check(
          Boolean(opened?.user?.email_confirmed_at),
          "l'ouverture de session confirme l'adresse, en attente depuis l'invitation",
          opened?.user?.email_confirmed_at ?? "NULL",
        );

        // Ce que fait `/reset-password?bienvenue=1`, sur cette session.
        const { error: pwdErr } = await owner.auth.updateUser({ password: PWD });
        check(!pwdErr, "le mot de passe se choisit sur la session ainsi ouverte", pwdErr?.message);

        const { error: emitErr } = await owner.from("receipts").insert({
          organization_id: orgId, issued_on: "2026-01-20",
          payer: "Client Test", amount: 15000,
        });
        check(!emitErr, "abonnement actif : le propriétaire fraîchement activé peut émettre une pièce", emitErr?.message);

        // Et ce mot de passe vaut ensuite pour une connexion ordinaire,
        // depuis un client qui n'a jamais vu le lien de réclamation.
        const later = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error: signInErr } = await later.auth.signInWithPassword({ email: paid.email, password: PWD });
        check(!signInErr, "le mot de passe posé après activation permet de se connecter", signInErr?.message);
      }

      // ── réclamation : une seule session par intention ─────────────────
      const firstClaim = await rpc("claim_signup_intent", { p_intent_id: paid.intentId });
      check(firstClaim.data?.claimed === true, "la première réclamation d'une intention active réussit", JSON.stringify(firstClaim.data));
      const secondClaim = await rpc("claim_signup_intent", { p_intent_id: paid.intentId });
      check(secondClaim.data?.claimed === false, "une seconde réclamation de la même intention échoue", JSON.stringify(secondClaim.data));

      // ── webhook rejoué → aucun doublon ─────────────────────────────────
      const replay = await rpc("confirm_signup_payment", { p_transaction_id: paid.tx, p_method: "success" });
      check(replay.data?.outcome === "already_active", "rejouer la confirmation ne recrée rien", JSON.stringify(replay.data));
      const replayProvision = await rpc("provision_signup_intent", {
        p_intent_id: paid.intentId, p_user_id: invited.user.id,
      });
      check(
        replayProvision.data?.outcome === "already_active" && replayProvision.data?.organization_id === orgId,
        "rejouer le provisionnement rend la même organisation, n'en crée pas de seconde",
        JSON.stringify(replayProvision.data),
      );
      const { count: orgCount } = await admin.from("organizations")
        .select("id", { count: "exact", head: true }).eq("id", orgId);
      check(orgCount === 1, "une seule organisation existe pour cette inscription", orgCount);
    }

    // ── double webhook simultané → un seul compte ──────────────────────
    const race = await openIntent("race");
    const [r1, r2] = await Promise.all([
      rpc("confirm_signup_payment", { p_transaction_id: race.tx, p_method: "success" }),
      rpc("confirm_signup_payment", { p_transaction_id: race.tx, p_method: "success" }),
    ]);
    const outcomes = [r1.data?.outcome, r2.data?.outcome].sort();
    check(
      outcomes[0] === "already_paid" && outcomes[1] === "confirmed",
      "deux confirmations simultanées : une seule obtient 'confirmed'",
      JSON.stringify(outcomes),
    );

    const { data: raceInvited, error: raceInviteErr } = await admin.auth.admin.generateLink({
      type: "invite", email: race.email,
    });
    if (raceInviteErr || !raceInvited?.user) {
      fail(`generateLink invite (course) : ${raceInviteErr?.message ?? "utilisateur absent"}`);
    } else {
      created.users.push(raceInvited.user.id);

      const [p1, p2] = await Promise.all([
        rpc("provision_signup_intent", { p_intent_id: race.intentId, p_user_id: raceInvited.user.id }),
        rpc("provision_signup_intent", { p_intent_id: race.intentId, p_user_id: raceInvited.user.id }),
      ]);
      const provisionOutcomes = [p1.data?.outcome, p2.data?.outcome].sort();
      check(
        provisionOutcomes[0] === "already_active" && provisionOutcomes[1] === "provisioned",
        "deux provisionnements simultanés : un seul crée l'organisation",
        JSON.stringify(provisionOutcomes),
      );
      const raceOrgId = (p1.data?.organization_id) ?? (p2.data?.organization_id);
      if (raceOrgId) created.orgs.push(raceOrgId);
      check(
        p1.data?.organization_id === p2.data?.organization_id,
        "les deux appels concurrents rendent la même organisation",
        `${p1.data?.organization_id} / ${p2.data?.organization_id}`,
      );

      const { count: raceOrgCount } = await admin.from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("name", `Inscription race ${stamp}`);
      check(raceOrgCount === 1, "la course entre deux webhooks n'a produit qu'une seule organisation", raceOrgCount);
    }
  }

console.log("\nRECHERCHE GLOBALE");
  // La fonction n'est pas SECURITY DEFINER : le RLS s'y applique. Une
  // recherche qui remonterait la pièce d'un autre serait une fuite.
  const { data: hits, error: searchErr } = await b.client
    .rpc("global_search", { q: "Awa Diallo", max_results: 20 });
  if (searchErr) {
    fail(`global_search : ${searchErr.message}`);
  } else {
    const leaked = (hits ?? []).filter((h) => h.title?.startsWith("REC-2026-000") === false);
    check(
      (hits ?? []).length === 1,
      "B ne trouve que sa propre pièce en cherchant un nom partagé",
      `${(hits ?? []).length} résultat(s), dont ${leaked.length} inattendu(s)`,
    );
  }
} catch (e) {
  fail(`interruption : ${e.message}`);
} finally {
  await cleanup();
  const left = await admin.from("organizations").select("id", { count: "exact", head: true });
  console.log(`\nNettoyage effectué. Organisations restantes : ${left.count ?? 0}.`);
  console.log(failures === 0
    ? "\nTout est vert.\n"
    : `\n${failures} vérification(s) en échec.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
