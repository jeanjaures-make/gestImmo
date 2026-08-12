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
const created = { users: [], orgs: [], transactions: [] };
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

  for (const [tag, u] of [["A", a], ["B", b]]) {
    const { data, error } = await u.client.rpc("create_organization", {
      org_name: `Vérification ${tag} ${stamp}`, first_name: "Test", last_name: tag,
    });
    if (error) throw new Error(`create_organization ${tag} : ${error.message}`);
    u.orgId = data;
    created.orgs.push(data);
  }
  check(true, "create_organization crée l'organisation et son profil propriétaire");

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
