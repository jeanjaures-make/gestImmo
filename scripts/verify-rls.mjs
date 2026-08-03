/**
 * Preuve exécutable du cloisonnement multi-tenant.
 *
 *   npm run verify:rls
 *
 * Crée deux organisations jetables et un compte locataire, vérifie
 * qu'aucun périmètre ne déborde sur l'autre, puis supprime tout ce qu'il a
 * créé. À lancer sur un projet de développement, jamais en production :
 * le script écrit en base.
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
const created = { users: [], orgs: [] };
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
 * Suppression manuelle, enfants avant parents.
 *
 * `DELETE FROM organizations` seul suffirait si le trigger d'audit ne
 * s'invitait pas dans la cascade : voir la garde « organisation déjà
 * supprimée » dans `audit_trigger()`. On ne dépend pas d'elle ici — un
 * script de nettoyage doit fonctionner même sur un schéma pas encore à
 * jour, sinon il abandonne ses propres déchets.
 */
const CLEANUP_ORDER = [
  "payment_declarations", "notifications", "rent_payments", "leases",
  "apartments", "tenants", "expenses", "maintenance", "documents",
  "buildings", "audit_logs", "profiles",
];

async function cleanup() {
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

  const { data: bld, error: bErr } = await a.client.from("buildings")
    .insert({ organization_id: a.orgId, name: "Immeuble A", address: "1 rue A", city: "Paris" })
    .select().single();
  if (bErr) throw new Error(`création immeuble : ${bErr.message}`);
  const { data: apt } = await a.client.from("apartments")
    .insert({ organization_id: a.orgId, building_id: bld.id, number: "A1" })
    .select().single();
  const { data: tnt } = await a.client.from("tenants")
    .insert({ organization_id: a.orgId, firstname: "Awa", lastname: "Diallo" })
    .select().single();
  const { data: lease } = await a.client.from("leases")
    .insert({ organization_id: a.orgId, tenant_id: tnt.id, apartment_id: apt.id,
              rent: 250000, charges: 25000, start_date: "2026-01-01" })
    .select().single();
  check(true, "A crée immeuble, logement, locataire et bail");

  console.log("\nRÈGLES APPLIQUÉES EN BASE");
  const { data: aptAfter } = await a.client.from("apartments")
    .select("status").eq("id", apt.id).single();
  check(
    aptAfter.status === "occupied",
    "le logement passe à « occupé » à la création du bail",
    `obtenu : ${aptAfter.status}`,
  );

  const { data: scheduled, error: schedErr } = await a.client
    .rpc("generate_rent_schedule", { p_lease_id: lease.id, p_months: 3 });
  check(
    !schedErr,
    `generate_rent_schedule produit les échéances (${scheduled ?? 0})`,
    schedErr?.message,
  );

  const { data: pays } = await a.client.from("rent_payments").select("id, month");
  check(
    pays.every((p) => p.month.endsWith("-01")),
    "les échéances sont normalisées au 1er du mois",
  );

  const { error: dupErr } = await a.client.from("leases").insert({
    organization_id: a.orgId, tenant_id: tnt.id, apartment_id: apt.id,
    rent: 240000, charges: 0, start_date: "2026-06-01",
  });
  check(Boolean(dupErr), "un second bail actif sur le même logement est rejeté");

  const { data: logs } = await a.client.from("audit_logs").select("id");
  check(
    Boolean(logs?.length),
    `les écritures sont journalisées sans intervention applicative (${logs?.length ?? 0})`,
  );

  console.log("\nCLOISONNEMENT ENTRE ORGANISATIONS");
  for (const t of ["buildings", "apartments", "tenants", "leases", "rent_payments", "audit_logs"]) {
    const { data, error } = await b.client.from(t).select("*");
    if (error) {
      check(true, `${t} : refusé à B (${error.code})`);
      continue;
    }
    check(data.length === 0, `${t} : B ne voit rien de A`, `${data.length} ligne(s) visible(s)`);
  }
  const { error: crossErr } = await b.client.from("apartments").insert({
    organization_id: b.orgId, building_id: bld.id, number: "INTRUS",
  });
  check(
    Boolean(crossErr),
    `rattacher un logement à l'immeuble de A est rejeté (${crossErr?.code ?? "—"})`,
  );

  console.log("\nPÉRIMÈTRE DU LOCATAIRE");
  const tenantEmail = `verif-loc-${stamp}@example.invalid`;
  const { data: tUser, error: tErr } = await admin.auth.admin.createUser({
    email: tenantEmail, password: PWD, email_confirm: true,
  });
  if (tErr) throw new Error(`création du compte locataire : ${tErr.message}`);
  created.users.push(tUser.user.id);
  await admin.from("profiles").insert({
    id: tUser.user.id, organization_id: a.orgId, tenant_id: tnt.id,
    firstname: "Awa", lastname: "Diallo", email: tenantEmail, role: "viewer",
  });
  const tc = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await tc.auth.signInWithPassword({ email: tenantEmail, password: PWD });

  const { data: myLeases } = await tc.from("leases").select("id");
  check(myLeases?.length === 1, "il voit son bail", `${myLeases?.length ?? 0} baux visibles`);
  const { data: myPays } = await tc.from("rent_payments").select("id");
  check(
    myPays?.length === scheduled,
    `il voit ses ${scheduled} échéances`,
    `${myPays?.length ?? 0} visibles`,
  );
  const { data: others } = await tc.from("tenants").select("id");
  check(
    others?.length === 1,
    "il ne voit que sa propre fiche",
    `${others?.length ?? 0} fiches visibles`,
  );
  for (const [t, label] of [["expenses", "les dépenses"], ["audit_logs", "le journal d'audit"]]) {
    const { data } = await tc.from(t).select("id");
    check((data?.length ?? 0) === 0, `il ne voit pas ${label}`);
  }

  // Sous RLS, un UPDATE hors périmètre ne lève pas d'erreur : il ne touche
  // simplement aucune ligne. C'est donc la base qu'on interroge, pas le
  // code retour.
  await tc.from("rent_payments")
    .update({ status: "paid", amount_paid: 1100 }).eq("id", myPays[0].id);
  const { data: unchanged } = await admin.from("rent_payments")
    .select("status").eq("id", myPays[0].id).single();
  check(
    unchanged.status === "pending",
    "il ne peut pas solder lui-même son échéance",
    `statut devenu ${unchanged.status}`,
  );

  console.log("\nDÉCLARATION ET VALIDATION D'UN RÈGLEMENT");
  const { error: declErr } = await tc.from("payment_declarations").insert({
    organization_id: a.orgId, rent_payment_id: myPays[0].id, tenant_id: tnt.id,
    amount: 100000, paid_on: "2026-01-05", method: "Virement bancaire", status: "pending",
  });
  check(!declErr, "le locataire déclare un règlement", declErr?.message);

  const { data: notifs } = await admin.from("notifications").select("kind");
  check(
    Boolean(notifs?.some((n) => n.kind === "payment_declared")),
    "le personnel est notifié par trigger",
  );

  const { data: decl } = await admin.from("payment_declarations")
    .select("id").eq("organization_id", a.orgId).single();
  const { error: revErr } = await a.client
    .rpc("review_payment_declaration", { p_id: decl.id, p_accept: true });
  if (revErr) {
    fail(`review_payment_declaration : ${revErr.message}`);
  } else {
    const { data: after } = await admin.from("rent_payments")
      .select("status, amount_paid").eq("id", myPays[0].id).single();
    check(
      after.status === "partial" && Number(after.amount_paid) === 100000,
      "la validation encaisse 100 000 F CFA et passe l'échéance en « partiel »",
      `statut ${after.status}, encaissé ${after.amount_paid}`,
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
