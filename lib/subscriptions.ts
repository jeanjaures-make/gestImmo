import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ActiveSubscription, Plan } from "@/lib/types";

/**
 * Récupère l'abonnement actif d'une organisation.
 *
 * Retourne `null` si aucune organisation n'a d'abonnement actif — c'est
 * le cas d'une nouvelle inscription, qui n'a pas encore choisi de plan.
 * Le produit reste utilisable (période d'essai implicite), mais les
 * quotas ne sont pas levés pour autant : sans abonnement, on retombe sur
 * les limites du plan gratuit (aucune pièce).
 *
 * La fonction est mise en cache par React via `cache()` côté appelant
 * si nécessaire — ici on reste simple.
 */
export async function getActiveSubscription(
  organizationId: string,
): Promise<ActiveSubscription | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("get_active_subscription", { p_org_id: organizationId })
    .maybeSingle<ActiveSubscription>();
  return data ?? null;
}

/**
 * Récupère tous les plans actifs, triés par prix croissant.
 *
 * La page /subscribe consomme cette fonction : les prix et limites
 * viennent de la base, jamais du code.
 */
export async function getActivePlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true })
    .returns<Plan[]>();
  return data ?? [];
}

/** Récupère un plan par son ID — utilisé par la route de création. */
export async function getPlanById(planId: string): Promise<Plan | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle<Plan>();
  return data ?? null;
}

/**
 * Vérifie si l'organisation peut émettre une nouvelle pièce.
 *
 * Retourne `{ allowed: true }` ou `{ allowed: false, used, limit, plan }`.
 * Le quota est calculé sur la période de l'abonnement actif (du
 * `started_at` au `expires_at`), via la fonction SQL
 * `count_documents_this_period()`.
 */
export async function checkDocumentQuota(
  organizationId: string,
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      used: number;
      limit: number;
      planName: string;
    }
> {
  const sub = await getActiveSubscription(organizationId);

  // Sans abonnement actif : on bloque. Le produit n'est pas gratuit.
  if (!sub) {
    return { allowed: false, used: 0, limit: 0, planName: "Aucun" };
  }

  // Illimité : pas de quota.
  if (sub.is_unlimited_documents) return { allowed: true };

  const limit = sub.document_limit ?? 0;

  const supabase = await createClient();
  const { data: used } = await supabase
    .rpc("count_documents_this_period", { p_org_id: organizationId })
    .maybeSingle<number>();

  const count = Number(used ?? 0);

  if (count >= limit) {
    return { allowed: false, used: count, limit, planName: sub.plan_name };
  }
  return { allowed: true };
}

/**
 * Vérifie si l'organisation peut inviter un nouvel utilisateur.
 *
 * Le propriétaire ne compte pas dans la limite : un plan Starter à 1
 * utilisateur signifie « 1 utilisateur en plus du propriétaire », pas
 * « 1 utilisateur total » — sinon l'organisation serait vide dès
 * l'inscription.
 */
export async function checkUserLimit(
  organizationId: string,
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      current: number;
      limit: number;
      planName: string;
    }
> {
  const sub = await getActiveSubscription(organizationId);
  if (!sub) {
    return { allowed: false, current: 0, limit: 0, planName: "Aucun" };
  }
  if (sub.is_unlimited_users) return { allowed: true };

  const limit = sub.user_limit ?? 0;

  const supabase = await createClient();
  const { data: current } = await supabase
    .rpc("count_users", { p_org_id: organizationId })
    .maybeSingle<number>();

  const count = Number(current ?? 0);

  // Le propriétaire est toujours autorisé à exister : la limite
  // s'applique aux invitations, pas au compte initial.
  if (count >= limit) {
    return { allowed: false, current: count, limit, planName: sub.plan_name };
  }
  return { allowed: true };
}
