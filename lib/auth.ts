import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Organization, Profile, UserRole } from "@/lib/types";

export type Session = {
  userId: string;
  email: string;
  profile: Profile;
  organization: Organization;
};

/**
 * Contexte de la requête : utilisateur, profil et organisation.
 *
 * `cache()` déduplique l'appel sur toute la durée du rendu — le layout et
 * chaque page peuvent l'appeler sans multiplier les allers-retours.
 * Renvoie `null` si non connecté, `"no-profile"` si le compte existe mais
 * n'appartient encore à aucune organisation (parcours d'onboarding).
 */
export const getSession = cache(async (): Promise<
  Session | null | "no-profile"
> => {
  const supabase = await createClient();

  // getUser() revalide le jeton auprès du serveur Auth ; getSession() se
  // contenterait de faire confiance au cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) return "no-profile";

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .maybeSingle<Organization>();

  if (!organization) return "no-profile";

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    organization,
  };
});

/** Exige une session rattachée à une organisation. */
export async function requireSession(): Promise<Session> {
  // La garde vit ici plutôt que dans le seul layout : une page et son layout
  // se rendent en parallèle, la page atteindrait donc Supabase avant que le
  // layout ait eu l'occasion de rediriger. Toutes les pages protégées
  // passent par cette fonction, aucune ne peut l'oublier.
  if (!isSupabaseConfigured()) redirect("/setup");

  const session = await getSession();
  if (session === null) redirect("/login");
  if (session === "no-profile") redirect("/onboarding");
  return session;
}

export const ROLE_RANK: Record<UserRole, number> = {
  owner: 4,
  manager: 3,
  accountant: 2,
  viewer: 1,
};

export function hasRole(role: UserRole, ...allowed: UserRole[]) {
  return allowed.includes(role);
}

/**
 * Peut émettre et corriger des pièces.
 *
 * Le caissier en fait partie : c'est son métier, et lui refuser la saisie
 * viderait le rôle de sa substance.
 */
export function canIssue(role: UserRole) {
  return hasRole(role, "owner", "manager", "accountant");
}

/**
 * Peut supprimer une pièce.
 *
 * Plus restreint que l'émission : une suppression laisse un trou dans la
 * numérotation, ce qu'un contrôle comptable relève. Le geste doit rester
 * rare, et décidé par quelqu'un qui en répond.
 */
export function canDelete(role: UserRole) {
  return hasRole(role, "owner", "manager");
}

/** Peut administrer l'organisation et ses membres. */
export function canAdminister(role: UserRole) {
  return hasRole(role, "owner");
}

export class ForbiddenError extends Error {
  constructor(message = "Vous n'avez pas les droits pour cette action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Garde à appeler en tête de Server Action.
 *
 * Le RLS reste la source de vérité — cette vérification applicative sert à
 * renvoyer un message clair plutôt qu'une erreur PostgreSQL opaque.
 */
export async function requireRole(...allowed: UserRole[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.profile.role)) {
    throw new ForbiddenError();
  }
  return session;
}

/**
 * Variante non levante pour les Server Actions.
 *
 * On évite volontairement `try/catch` autour de `requireRole` dans les
 * actions : `redirect()` fonctionne en levant une exception de contrôle, et
 * un catch trop large l'avalerait silencieusement.
 */
export type AuthorizeResult =
  | { ok: true; session: Session }
  | { ok: false; error: string };

export async function authorize(
  ...allowed: UserRole[]
): Promise<AuthorizeResult> {
  const session = await requireSession();
  if (!allowed.includes(session.profile.role)) {
    return { ok: false, error: new ForbiddenError().message };
  }
  return { ok: true, session };
}
