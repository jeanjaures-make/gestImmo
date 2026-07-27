import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Accès administrateur, réservé aux tests.
 *
 * Sert à deux choses que le navigateur ne peut pas faire : préparer un
 * état (confirmer une adresse, poser un mot de passe à la place du lien
 * reçu par e-mail) et vérifier en base ce que l'interface prétend avoir
 * fait. Jamais à contourner un parcours qu'on est censé éprouver.
 */
function env() {
  const raw = readFileSync(".env.local", "utf8");
  const parsed = Object.fromEntries(
    raw.split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? parsed.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? parsed.SUPABASE_SERVICE_ROLE_KEY,
  };
}

let cached: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (cached) return cached;
  const { url, serviceKey } = env();
  if (!url || !serviceKey) {
    throw new Error(
      "Tests E2E : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.",
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Adresse unique et non routable : aucun e-mail réel ne peut partir. */
export function testEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.invalid`;
}

export const TEST_PASSWORD = "Motdepasse-E2E-1!";

async function findUser(email: string) {
  // `listUsers` est paginé ; sur un projet de développement une page suffit
  // largement, et l'alternative (filtre serveur) n'est pas exposée.
  const { data } = await admin().auth.admin.listUsers({ perPage: 200 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

/**
 * Confirme l'adresse d'un compte fraîchement inscrit.
 *
 * Le projet Supabase peut exiger une confirmation par e-mail ; le test ne
 * peut pas ouvrir la boîte de réception. Confirmer ici revient à cliquer
 * le lien — le reste du parcours, lui, passe bien par l'interface.
 */
export async function confirmEmail(email: string) {
  const user = await findUser(email);
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  const { error } = await admin().auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  return !error;
}

/** Pose un mot de passe : équivaut au lien d'invitation suivi par le locataire. */
export async function setPassword(email: string, password = TEST_PASSWORD) {
  const user = await findUser(email);
  if (!user) throw new Error(`Compte introuvable : ${email}`);
  const { error } = await admin().auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Mot de passe refusé : ${error.message}`);
  return user.id;
}

/**
 * Supprime une organisation et tout ce qui en dépend.
 *
 * Les enfants sont retirés avant le parent bien que la cascade suffise
 * désormais : le nettoyage doit fonctionner même sur une base dont le
 * schéma n'a pas encore la garde du trigger d'audit, sinon un test qui
 * échoue laisse ses déchets derrière lui.
 */
const CHILDREN = [
  "payment_declarations", "notifications", "rent_payments", "leases",
  "apartments", "tenants", "expenses", "maintenance", "documents",
  "buildings", "audit_logs", "profiles",
];

export async function deleteOrganizationsNamed(prefix: string) {
  const { data: orgs } = await admin()
    .from("organizations")
    .select("id")
    .like("name", `${prefix}%`);

  for (const org of orgs ?? []) {
    for (const table of CHILDREN) {
      await admin().from(table).delete().eq("organization_id", org.id);
    }
    await admin().from("organizations").delete().eq("id", org.id);
  }
}

export async function deleteUsersMatching(prefix: string) {
  const { data } = await admin().auth.admin.listUsers({ perPage: 200 });
  for (const user of data.users) {
    if (user.email?.startsWith(prefix)) {
      await admin().auth.admin.deleteUser(user.id);
    }
  }
}
