import "server-only";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { ActiveSubscription, Plan, SubscriptionStatus } from "@/lib/types";

/**
 * Récupère l'abonnement actif d'une organisation.
 *
 * Retourne `null` si l'organisation n'a aucun abonnement en cours de
 * validité — nouvelle inscription, ou abonnement échu. Sans abonnement,
 * les pièces ne peuvent plus être émises : le produit n'est pas gratuit.
 *
 * `cache()` déduplique l'appel sur la durée du rendu : le bandeau, la
 * page et la garde de quota l'appellent chacun sans multiplier les
 * allers-retours vers PostgreSQL.
 */
export const getActiveSubscription = cache(async (
  organizationId: string,
): Promise<ActiveSubscription | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("get_active_subscription", { p_org_id: organizationId })
    .maybeSingle<ActiveSubscription>();
  return data ?? null;
});

/**
 * L'état d'abonnement tel qu'on l'affiche à l'écran.
 *
 * `getActiveSubscription()` ne distingue pas « jamais souscrit » de
 * « souscrit puis échu » : les deux valent `null`. Or les deux appellent
 * des messages différents — l'un propose de découvrir les offres,
 * l'autre de renouveler un plan que l'on connaît déjà. Cette fonction
 * lit donc le dernier abonnement quel que soit son statut.
 */
export type SubscriptionState =
  | { state: "none" }
  | { state: "active"; subscription: ActiveSubscription; used: number }
  | { state: "expired"; planName: string; planId: string; expiredOn: string };

export const getSubscriptionState = cache(async (
  organizationId: string,
): Promise<SubscriptionState> => {
  const active = await getActiveSubscription(organizationId);

  if (active) {
    const used = await countDocumentsThisPeriod(organizationId);
    return { state: "active", subscription: active, used };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_id, status, expires_at, plans(name)")
    .eq("organization_id", organizationId)
    .not("expires_at", "is", null)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      plan_id: string;
      status: SubscriptionStatus;
      expires_at: string;
      plans: { name: string } | null;
    }>();

  if (!data) return { state: "none" };

  return {
    state: "expired",
    planId: data.plan_id,
    planName: data.plans?.name ?? "précédent",
    expiredOn: data.expires_at,
  };
});

/** Nombre de pièces émises sur la période d'abonnement en cours. */
export async function countDocumentsThisPeriod(
  organizationId: string,
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("count_documents_this_period", { p_org_id: organizationId })
    .maybeSingle<number>();
  return Number(data ?? 0);
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

  // Illimité : pas de quota. On évite même de compter — sur une
  // organisation qui émet beaucoup, ce décompte est la requête la plus
  // lourde de la création d'une pièce.
  if (sub.is_unlimited_documents) return { allowed: true };

  const limit = sub.document_limit ?? 0;
  const count = await countDocumentsThisPeriod(organizationId);

  if (count >= limit) {
    return { allowed: false, used: count, limit, planName: sub.plan_name };
  }
  return { allowed: true };
}

/**
 * Vérifie si l'organisation peut inviter un nouvel utilisateur.
 *
 * Le propriétaire est compté : « 1 utilisateur » sur Starter désigne le
 * poste unique de l'entreprise, pas un collaborateur en plus du patron.
 * Une organisation Starter ne peut donc inviter personne — c'est
 * précisément ce qui distingue l'offre de Business.
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

  if (count >= limit) {
    return { allowed: false, current: count, limit, planName: sub.plan_name };
  }
  return { allowed: true };
}
