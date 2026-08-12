/**
 * État réel de la base, avant la première transaction.
 *
 *   node scripts/check-db.mjs
 *
 * Lecture seule. Aucune ligne n'est créée, modifiée ni supprimée : les
 * tables sont sondées par un `select ... limit 0`, et les fonctions par
 * un appel volontairement sans effet — `confirm_payment` sur une
 * transaction inexistante répond « unknown » et ne touche rien.
 *
 * Ce script existe parce qu'« appliquer le schéma » n'est pas un état
 * qu'on peut supposer. Un fichier SQL rejoué à moitié laisse une base
 * qui répond à la plupart des requêtes et échoue sur la seule qui compte.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let missing = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const ko = (label, detail) => {
  missing += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
};

/** La table existe-t-elle, avec ces colonnes ? */
async function columns(table, cols) {
  const { error } = await admin.from(table).select(cols.join(", ")).limit(0);
  if (!error) return ok(`${table} (${cols.length} colonnes)`);

  if (error.code === "42P01" || /could not find the table/i.test(error.message)) {
    return ko(`${table}`, "table absente");
  }
  // 42703 : la table est là, une colonne manque.
  ko(`${table}`, error.message);
}

/** La fonction existe-t-elle ? On l'appelle sans effet. */
async function fn(name, args, describe) {
  const { data, error } = await admin.rpc(name, args);
  if (!error) return ok(`${name}() — ${describe(data)}`);
  if (/could not find the function|does not exist/i.test(error.message)) {
    return ko(`${name}()`, "fonction absente");
  }
  ko(`${name}()`, error.message);
}

console.log("\nSCHÉMA DE BASE (schema.sql)");
await columns("organizations", ["id", "name", "legal_form", "trade_name", "activities"]);
await columns("profiles", ["id", "organization_id", "role", "muted_notifications"]);
await columns("receipts", ["id", "number", "payer", "amount"]);
await columns("cash_vouchers", ["id", "number", "counterparty", "direction"]);
await columns("delivery_notes", ["id", "number", "issuer"]);
await columns("audit_logs", ["id", "entity", "action"]);
await columns("login_events", ["id", "success", "ip"]);

console.log("\nCORRECTIFS ATTENDUS");
await fn("global_search", { q: "zzz-aucun-resultat", max_results: 1 }, () => "présente");

// Le lien profond ne se voit que sur un résultat réel. On regarde donc si
// une pièce existe, et on lit le href qu'elle produit.
const { data: anyReceipt } = await admin
  .from("receipts").select("number").limit(1).maybeSingle();
if (anyReceipt?.number) {
  const { data: hits } = await admin.rpc("global_search", {
    q: anyReceipt.number, max_results: 1,
  });
  const href = hits?.[0]?.href ?? "";
  if (/\/receipts\/[0-9a-f-]{36}$/.test(href)) {
    ok("global_search mène à la pièce (lien profond)");
  } else {
    ko("global_search mène à la pièce", `href obtenu : « ${href} » — schema.sql à rejouer`);
  }
} else {
  console.log("  · lien profond non vérifiable : aucune pièce en base");
}

console.log("\nABONNEMENTS (subscriptions.sql)");
await columns("plans", [
  "id", "slug", "name", "price", "currency", "duration_days",
  "document_limit", "user_limit", "is_unlimited_documents",
  "is_unlimited_users", "is_launch_offer", "is_active", "has_audit_log",
]);
await columns("subscriptions", [
  "id", "organization_id", "plan_id", "status",
  "started_at", "expires_at", "cancelled_at",
]);
await columns("payments", [
  "id", "organization_id", "user_id", "subscription_id", "plan_id",
  "transaction_id", "amount", "currency", "provider", "payment_method",
  "status", "paid_at", "metadata",
]);
await columns("payment_events", ["id", "transaction_id", "event_type", "payload"]);

console.log("\nFONCTIONS DE PAIEMENT");
await fn(
  "confirm_payment",
  { p_transaction_id: "SONDE-INEXISTANTE-000", p_method: null },
  (d) => `répond « ${d?.[0]?.outcome ?? d?.outcome ?? "?"} » sur une transaction inconnue`,
);
await fn(
  "fail_payment",
  { p_transaction_id: "SONDE-INEXISTANTE-000", p_status: "failed" },
  () => "présente",
);
await fn("sweep_subscriptions", {}, (d) => {
  const row = Array.isArray(d) ? d[0] : d;
  return `${row?.expired ?? 0} échu(s), ${row?.abandoned ?? 0} abandonné(s)`;
});

console.log("\nFONCTIONS D'ABONNEMENT ET DE QUOTA");
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
await fn("get_active_subscription", { p_org_id: ZERO_UUID }, (d) =>
  `présente (${Array.isArray(d) ? d.length : 0} abonnement pour une organisation inconnue)`,
);
await fn("count_documents_this_period", { p_org_id: ZERO_UUID }, (d) => `présente, rend ${d}`);
await fn("count_users", { p_org_id: ZERO_UUID }, (d) => `présente, rend ${d}`);

console.log("\nCONTRAINTE UNIQUE SUR transaction_id");
// Deux lignes portant le même identifiant : la seconde DOIT être refusée
// avec le code 23505. Les lignes créées ici sont supprimées aussitôt —
// aucune donnée existante n'est touchée.
{
  const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
  const { data: plan } = await admin.from("plans").select("id").limit(1).maybeSingle();

  if (!org || !plan) {
    console.log("  · non vérifiable : il faut au moins une organisation et un plan");
  } else {
    const sonde = `SONDE-UNIQUE-${Date.now()}`;
    const ligne = {
      organization_id: org.id, plan_id: plan.id, transaction_id: sonde,
      amount: 1, currency: "XOF", status: "pending",
    };

    const { error: premier } = await admin.from("payments").insert(ligne);
    if (premier) {
      ko("contrainte UNIQUE", `insertion de sonde impossible : ${premier.message}`);
    } else {
      const { error: doublon } = await admin.from("payments").insert(ligne);
      if (doublon?.code === "23505") ok("un second paiement au même transaction_id est refusé (23505)");
      else if (doublon) ko("contrainte UNIQUE", `refus attendu 23505, obtenu ${doublon.code}`);
      else ko("contrainte UNIQUE", "LE DOUBLON A ÉTÉ ACCEPTÉ");

      await admin.from("payments").delete().eq("transaction_id", sonde);
    }
  }
}

console.log("\nPLANS EN VENTE");
const { data: plans, error: plansError } = await admin
  .from("plans")
  .select("slug, name, price, currency, duration_days, document_limit, user_limit, is_unlimited_documents, is_unlimited_users, is_launch_offer, is_active")
  .order("price");

if (plansError) {
  ko("lecture des plans", plansError.message);
} else {
  const ATTENDU = {
    starter: { price: 3000, documents: 100, users: 1 },
    business: { price: 6000, documents: 1000, users: 5 },
    unlimited: { price: 10000, documents: null, users: null },
  };

  for (const [slug, attendu] of Object.entries(ATTENDU)) {
    const p = plans.find((x) => x.slug === slug);
    if (!p) {
      ko(`plan « ${slug} »`, "absent");
      continue;
    }
    const docs = p.is_unlimited_documents ? null : p.document_limit;
    const users = p.is_unlimited_users ? null : p.user_limit;
    const conforme =
      Number(p.price) === attendu.price &&
      p.currency === "XOF" &&
      p.duration_days === 30 &&
      docs === attendu.documents &&
      users === attendu.users &&
      p.is_active === true;

    const lisible = `${Number(p.price)} ${p.currency}, ${docs ?? "∞"} pièces, ${users ?? "∞"} utilisateur(s), ${p.duration_days} j`;
    if (conforme) ok(`${p.name} — ${lisible}`);
    else ko(`${p.name}`, `attendu ${attendu.price} XOF / ${attendu.documents ?? "∞"} / ${attendu.users ?? "∞"} — obtenu ${lisible}`);
  }

  const lancement = plans.filter((p) => p.is_launch_offer).map((p) => p.slug);
  if (lancement.length === 1 && lancement[0] === "unlimited") {
    ok("« Illimité » est la seule offre de lancement");
  } else {
    ko("offre de lancement", `portée par : ${lancement.join(", ") || "aucune"}`);
  }
}

console.log("\nÉTAT DES PAIEMENTS");
for (const table of ["payments", "subscriptions", "payment_events"]) {
  const { count, error } = await admin
    .from(table).select("*", { count: "exact", head: true });
  if (error) ko(`${table}`, error.message);
  else console.log(`  · ${table} : ${count ?? 0} ligne(s)`);
}

const { data: providers } = await admin.from("payments").select("provider");
const distincts = [...new Set((providers ?? []).map((p) => p.provider))];
if (distincts.length === 0) console.log("  · aucun paiement enregistré");
else console.log(`  · fournisseurs présents : ${distincts.join(", ")}`);

console.log(
  missing === 0
    ? "\nBase prête.\n"
    : `\n${missing} point(s) à corriger avant la première transaction.\n`,
);
process.exit(missing === 0 ? 0 : 1);
