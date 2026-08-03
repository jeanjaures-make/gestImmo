/**
 * Jeu de démonstration.
 *
 *   npm run seed:demo          crée les comptes et le parc
 *   npm run seed:demo -- --clean   supprime tout ce que le script a créé
 *
 * Les comptes sont créés par l'API d'administration, qui n'envoie aucun
 * e-mail : le SMTP intégré de Supabase est trop limité pour la mise en
 * service, et l'inscription par le formulaire échouerait sur son quota.
 * Les adresses sont en `.test`, domaine réservé par la RFC 6761 et jamais
 * routable — aucun message ne peut partir vers un tiers par accident.
 *
 * À lancer sur un projet de développement. Le script écrit en base.
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

export const DEMO = {
  org: "Patrimoine Vallier (démo)",
  owner: "demo@immoops.test",
  tenant: "locataire@immoops.test",
  password: "ImmoOps-Demo-2026!",
};

const CHILDREN = [
  "payment_declarations", "notifications", "rent_payments", "leases",
  "apartments", "tenants", "expenses", "maintenance", "documents",
  "buildings", "audit_logs", "profiles",
];

async function clean() {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id")
    .eq("name", DEMO.org);

  for (const org of orgs ?? []) {
    for (const table of CHILDREN) {
      await admin.from(table).delete().eq("organization_id", org.id);
    }
    await admin.from("organizations").delete().eq("id", org.id);
  }

  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of data.users) {
    if (user.email?.endsWith("@immoops.test")) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
  console.log("Jeu de démonstration supprimé.");
}

/** Crée un compte confirmé, ou renvoie celui qui existe déjà. */
async function ensureUser(email) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: DEMO.password,
      email_confirm: true,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO.password,
    email_confirm: true,
  });
  if (error) throw new Error(`${email} : ${error.message}`);
  return data.user.id;
}

async function seed() {
  await clean();

  const ownerId = await ensureUser(DEMO.owner);
  const tenantUserId = await ensureUser(DEMO.tenant);

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: DEMO.org, slug: `patrimoine-vallier-demo-${Date.now()}` })
    .select()
    .single();
  if (orgError) throw new Error(`organisation : ${orgError.message}`);

  await admin.from("profiles").insert({
    id: ownerId,
    organization_id: org.id,
    firstname: "Awa",
    lastname: "Diallo",
    email: DEMO.owner,
    role: "owner",
  });

  const { data: building } = await admin
    .from("buildings")
    .insert({
      organization_id: org.id,
      name: "Résidence Vallier",
      address: "12 rue Vallier",
      city: "Dakar",
      country: "Sénégal",
      estimated_value: 450_000_000,
    })
    .select()
    .single();

  const apartments = [];
  for (const a of [
    { number: "A12", floor: "3", surface: 78, type: "T3" },
    { number: "B04", floor: "1", surface: 52, type: "T2" },
    { number: "C21", floor: "5", surface: 95, type: "T4" },
  ]) {
    const { data } = await admin
      .from("apartments")
      .insert({ organization_id: org.id, building_id: building.id, ...a })
      .select()
      .single();
    apartments.push(data);
  }

  const tenants = [];
  for (const t of [
    { firstname: "Karim", lastname: "Benali", email: DEMO.tenant, phone: "+221 77 123 45 67" },
    { firstname: "Fatou", lastname: "Sow", email: null, phone: "+221 78 987 65 43" },
  ]) {
    const { data } = await admin
      .from("tenants")
      .insert({ organization_id: org.id, ...t })
      .select()
      .single();
    tenants.push(data);
  }

  // Le locataire Karim dispose d'un accès au portail : c'est ce profil,
  // porteur de `tenant_id`, qui le distingue du personnel.
  await admin.from("profiles").insert({
    id: tenantUserId,
    organization_id: org.id,
    tenant_id: tenants[0].id,
    firstname: "Karim",
    lastname: "Benali",
    email: DEMO.tenant,
    role: "viewer",
  });

  const leases = [];
  for (const l of [
    { tenant: 0, apartment: 0, rent: 250_000, charges: 25_000, deposit: 500_000 },
    { tenant: 1, apartment: 1, rent: 180_000, charges: 15_000, deposit: 360_000 },
  ]) {
    const { data, error } = await admin
      .from("leases")
      .insert({
        organization_id: org.id,
        tenant_id: tenants[l.tenant].id,
        apartment_id: apartments[l.apartment].id,
        rent: l.rent,
        charges: l.charges,
        deposit: l.deposit,
        status: "active",
        start_date: "2026-01-01",
      })
      .select()
      .single();
    if (error) throw new Error(`bail : ${error.message}`);
    leases.push(data);
    await admin.rpc("generate_rent_schedule", { p_lease_id: data.id, p_months: 8 });
  }

  // Un historique crédible : soldé jusqu'en mai, un partiel, deux impayés.
  // Sans cela le tableau de bord n'affiche que des zéros et ne montre rien.
  const { data: payments } = await admin
    .from("rent_payments")
    .select("id, month, amount, lease_id")
    .eq("organization_id", org.id)
    .order("month");

  for (const p of payments ?? []) {
    const month = Number(p.month.slice(5, 7));
    if (month <= 5) {
      await admin
        .from("rent_payments")
        .update({
          status: "paid",
          amount_paid: p.amount,
          payment_date: `${p.month.slice(0, 8)}05`,
          method: "Virement bancaire",
        })
        .eq("id", p.id);
    } else if (month === 6 && p.lease_id === leases[0].id) {
      await admin
        .from("rent_payments")
        .update({ status: "partial", amount_paid: 150_000, payment_date: "2026-06-08", method: "Mobile money" })
        .eq("id", p.id);
    }
  }

  await admin.from("expenses").insert([
    {
      organization_id: org.id, building_id: building.id, category: "works",
      label: "Réfection de la toiture", amount: 1_850_000, expense_date: "2026-03-14",
    },
    {
      organization_id: org.id, building_id: building.id, category: "insurance",
      label: "Assurance multirisque", amount: 320_000, expense_date: "2026-01-10",
    },
  ]);

  await admin.from("maintenance").insert([
    {
      organization_id: org.id, building_id: building.id, apartment_id: apartments[1].id,
      title: "Fuite sous l'évier", description: "Signalée par la locataire.",
      priority: "high", status: "in_progress",
    },
    {
      organization_id: org.id, building_id: building.id, apartment_id: null,
      title: "Éclairage du hall défaillant", priority: "medium", status: "open",
    },
  ]);

  console.log(`
Jeu de démonstration créé.

  Espace propriétaire   ${DEMO.owner}
  Espace locataire      ${DEMO.tenant}
  Mot de passe          ${DEMO.password}

  Organisation : ${DEMO.org}
  1 immeuble · 3 logements · 2 locataires · 2 baux · 16 échéances

Pour tout supprimer :  npm run seed:demo -- --clean
`);
}

if (process.argv.includes("--clean")) {
  await clean();
} else {
  await seed();
}
