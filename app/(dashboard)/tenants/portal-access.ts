"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";

/**
 * Ouverture et fermeture de l'espace locataire.
 *
 * Donner un accès suppose de créer un compte d'authentification au nom de
 * quelqu'un d'autre : seule la clé `service_role` le permet. Le profil créé
 * porte `tenant_id`, ce qui suffit — dans tout le schéma — à le distinguer
 * d'un membre du personnel : `is_staff()` devient faux, et le RLS le
 * cantonne à ses propres baux, échéances et documents.
 *
 * Le rôle `viewer` n'est pas ce qui le protège, c'est une valeur par
 * défaut sans effet sur son périmètre : les policies du personnel exigent
 * toutes `is_staff()`.
 */
export async function grantPortalAccess(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { error: "Locataire introuvable." };

  const limit = await rateLimit({
    key: await callerKey("portal-access"),
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop d'invitations envoyées. Réessayez plus tard." };
  }

  const supabase = await createClient();

  // Le RLS garantit que ce locataire appartient bien à l'organisation de
  // l'appelant : inutile de le vérifier une seconde fois côté application.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, firstname, lastname, email")
    .eq("id", tenantId)
    .maybeSingle<{
      id: string;
      firstname: string;
      lastname: string;
      email: string | null;
    }>();

  if (!tenant) return { error: "Locataire introuvable." };
  if (!tenant.email) {
    return {
      error:
        "Renseignez d'abord l'adresse e-mail du locataire : l'invitation lui y sera envoyée.",
    };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ id: string }>();

  if (existing) return { error: "Cet accès est déjà ouvert." };

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Accès locataire indisponible : la clé SUPABASE_SERVICE_ROLE_KEY n'est pas configurée.",
    };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    tenant.email,
    { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  );

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return {
        error:
          "Cette adresse a déjà un compte. Utilisez-en une autre, ou retirez d'abord le compte existant.",
      };
    }
    return { error: error.message };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    organization_id: auth.session.organization.id,
    tenant_id: tenant.id,
    firstname: tenant.firstname,
    lastname: tenant.lastname,
    email: tenant.email,
    role: "viewer",
  });

  if (profileError) {
    // Un compte sans profil serait orphelin : il n'atteindrait aucun
    // écran et bloquerait toute nouvelle invitation à cette adresse.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: `Invitation annulée : ${profileError.message}` };
  }

  revalidatePath("/tenants");
  return { ok: true };
}

export async function revokePortalAccess(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { error: "Locataire introuvable." };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ id: string }>();

  if (!profile) return { error: "Aucun accès à révoquer." };

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profile.id);

  if (error) return { error: error.message };

  // Supprimer le profil coupe déjà l'accès — sans organisation, la session
  // n'atteint plus aucun écran. La suppression du compte lui-même n'est
  // possible qu'avec la clé admin, et reste souhaitable pour libérer
  // l'adresse e-mail en vue d'une future invitation.
  const admin = createAdminClient();
  if (admin) await admin.auth.admin.deleteUser(profile.id);

  revalidatePath("/tenants");
  return { ok: true };
}
