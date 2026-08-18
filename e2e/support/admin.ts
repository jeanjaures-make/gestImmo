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

/** Pose un mot de passe : équivaut au lien d'invitation suivi par le membre. */
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
  "delivery_note_lines", "delivery_notes", "cash_vouchers", "receipts",
  "document_counters", "audit_logs", "payments", "subscriptions",
  "signup_intents", "profiles",
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

/**
 * Supprime les intentions d'inscription — et leur paiement — jamais
 * provisionnées (pending, failed, cancelled, expired).
 *
 * Une intention activée est déjà couverte par `deleteOrganizationsNamed` :
 * elle porte un `organization_id`. Celle-ci ne l'est pas : sans
 * organisation à chercher, seule l'adresse permet de la retrouver.
 */
export async function deleteSignupIntentsMatching(prefix: string) {
  const { data: intents } = await admin()
    .from("signup_intents")
    .select("id")
    .like("email", `${prefix}%`);

  for (const intent of intents ?? []) {
    await admin().from("payments").delete().eq("intent_id", intent.id);
    await admin().from("signup_intents").delete().eq("id", intent.id);
  }
}

/**
 * Simule une inscription payée — organisation, profil propriétaire et
 * abonnement actif — sans jamais appeler Moneroo.
 *
 * Exécute EXACTEMENT la même suite d'opérations que le webhook une fois
 * le paiement confirmé : `confirm_signup_payment`, `generateLink` (crée le
 * compte Supabase Auth, SANS mot de passe — jamais stocké), puis
 * `provision_signup_intent`. Rien n'est court-circuité ni recopié à la
 * main : c'est le chemin réel, seule l'étape « payer chez Moneroo » est
 * remplacée par une confirmation directe en base.
 */
export async function seedActivatedSignup(
  email: string,
  orgName: string,
  planSlug = "starter",
) {
  const { data: plan, error: planErr } = await admin()
    .from("plans")
    .select("id, price")
    .eq("slug", planSlug)
    .single();
  if (planErr || !plan) {
    throw new Error(`Plan "${planSlug}" introuvable — exécutez supabase/subscriptions.sql.`);
  }

  const { data: intent, error: intentErr } = await admin()
    .from("signup_intents")
    .insert({ email, org_name: orgName, plan_id: plan.id })
    .select("id")
    .single();
  if (intentErr) throw new Error(`seedActivatedSignup (intention) : ${intentErr.message}`);

  const transactionId = `E2E-SIGNUP-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const { error: paymentErr } = await admin().from("payments").insert({
    intent_id: intent.id,
    plan_id: plan.id,
    transaction_id: transactionId,
    amount: plan.price,
    currency: "XOF",
    status: "pending",
  });
  if (paymentErr) throw new Error(`seedActivatedSignup (paiement) : ${paymentErr.message}`);

  const { error: confirmErr } = await admin().rpc("confirm_signup_payment", {
    p_transaction_id: transactionId,
    p_method: "test",
  });
  if (confirmErr) throw new Error(`seedActivatedSignup (confirmation) : ${confirmErr.message}`);

  const { data: invited, error: inviteErr } = await admin().auth.admin.generateLink({
    type: "invite",
    email,
  });
  if (inviteErr || !invited?.user) {
    throw new Error(`seedActivatedSignup (generateLink) : ${inviteErr?.message ?? "utilisateur absent"}`);
  }

  const { data: provisioned, error: provisionErr } = await admin()
    .rpc("provision_signup_intent", { p_intent_id: intent.id, p_user_id: invited.user.id })
    .maybeSingle<{ outcome: string; organization_id: string | null }>();
  if (provisionErr || provisioned?.outcome !== "provisioned" || !provisioned.organization_id) {
    throw new Error(
      `seedActivatedSignup (provisionnement) : ${provisionErr?.message ?? provisioned?.outcome}`,
    );
  }

  return {
    intentId: intent.id as string,
    userId: invited.user.id as string,
    organizationId: provisioned.organization_id,
  };
}

export async function deleteUsersMatching(prefix: string) {
  const { data } = await admin().auth.admin.listUsers({ perPage: 200 });
  for (const user of data.users) {
    if (user.email?.startsWith(prefix)) {
      await admin().auth.admin.deleteUser(user.id);
    }
  }
}

/**
 * Active un abonnement Business pour une organisation de test.
 *
 * Sans abonnement actif, `checkDocumentQuota` bloque l'émission de pièces
 * et la page /audit redirige vers /subscribe. Les tests E2E qui créent des
 * pièces ou auditent /audit doivent donc disposer d'un abonnement actif
 * avec `has_audit_log: true`.
 *
 * L'abonnement est inséré avec la clé service_role : c'est le chemin que
 * suit le webhook du fournisseur après vérification, jamais un parcours client.
 */
export async function seedSubscription(orgId: string, planSlug = "business") {
  const { data: plan, error: planErr } = await admin()
    .from("plans")
    .select("id")
    .eq("slug", planSlug)
    .single();
  if (planErr || !plan) {
    throw new Error(
      `Plan "${planSlug}" introuvable — exécutez supabase/subscriptions.sql.`,
    );
  }

  const { error } = await admin().from("subscriptions").insert({
    organization_id: orgId,
    plan_id: plan.id,
    status: "active",
    started_at: new Date().toISOString(),
    expires_at: "2099-12-31T23:59:59Z",
  });
  if (error) throw new Error(`seedSubscription : ${error.message}`);
}

/**
 * Remet à zéro les compteurs de débit des routes d'inscription.
 *
 * La limitation est posée par adresse IP, et toute la suite sort de la
 * même : deux exécutions rapprochées se partagent donc le compteur, et la
 * seconde échoue sur une protection qu'aucun test ne cherche à éprouver.
 * Le symptôme est trompeur — la réclamation retombe sur `/login`, comme
 * si le lien était invalide.
 *
 * Ce n'est pas un contournement : le comportement sous limite atteinte se
 * vérifie ailleurs, sur des valeurs choisies pour ce cas. Ici on écarte
 * seulement un état laissé par l'exécution précédente.
 */
export async function resetSignupRateLimits() {
  for (const prefix of ["signup-status", "signup-claim", "signup-start"]) {
    await admin().from("rate_limits").delete().like("key", `${prefix}:%`);
  }
}
