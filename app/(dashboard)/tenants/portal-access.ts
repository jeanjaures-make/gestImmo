"use server";

import { revalidatePath } from "next/cache";

import { buildActivationLink } from "@/lib/activation-link";
import { authorize } from "@/lib/auth";
import { reportError } from "@/lib/observability";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Ouverture et fermeture de l'espace locataire.
 *
 * ─── Pourquoi aucun e-mail n'est envoyé ─────────────────────────────────
 * L'invitation partait auparavant par courriel, ce qui rendait le portail
 * — la moitié du produit — inatteignable tant qu'aucun serveur d'envoi
 * n'était raccordé. Supabase sait produire un lien d'activation SANS
 * l'expédier : c'est ce lien qu'on remet au gestionnaire, à charge pour
 * lui de le transmettre.
 *
 * Ce n'est pas un pis-aller. Sur le marché visé, WhatsApp et le SMS
 * atteignent un locataire bien plus sûrement qu'une adresse e-mail
 * qu'il consulte rarement — quand il en a une. Le gestionnaire connaît
 * son locataire et sait par où le joindre ; l'application n'a pas à en
 * décider à sa place.
 *
 * ─── Le lien est un identifiant ─────────────────────────────────────────
 * Il ouvre la session de son porteur. Il n'est donc jamais écrit en base
 * ni journalisé : il est affiché une fois au gestionnaire, puis oublié.
 * S'il se perd, on en régénère un — c'est plus sûr que de le conserver.
 */
export type PortalAccessState = {
  error?: string;
  /** Lien d'activation, à ne montrer qu'une fois. */
  link?: string;
  /** Nom du locataire, pour composer le message de transmission. */
  tenantName?: string;
  tenantPhone?: string | null;
};

export async function grantPortalAccess(
  _prev: PortalAccessState,
  formData: FormData,
): Promise<PortalAccessState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { error: "Locataire introuvable." };

  const limit = await rateLimit({
    key: await callerKey("portal-access"),
    limit: 60,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop d'ouvertures d'accès. Réessayez plus tard." };
  }

  const supabase = await createClient();

  // Le RLS garantit que ce locataire appartient à l'organisation de
  // l'appelant : inutile de le vérifier une seconde fois.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, firstname, lastname, email, phone")
    .eq("id", tenantId)
    .maybeSingle<{
      id: string;
      firstname: string;
      lastname: string;
      email: string | null;
      phone: string | null;
    }>();

  if (!tenant) return { error: "Locataire introuvable." };
  if (!tenant.email) {
    return {
      error:
        "Renseignez d'abord une adresse e-mail : elle sert d'identifiant de connexion, même si le lien passe par un autre canal.",
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

  // `generateLink` crée le compte ET renvoie le lien, sans expédier de
  // message : c'est la différence avec `inviteUserByEmail`.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: tenant.email,
  });

  if (error || !data?.user) {
    if (error && /already been registered|already exists/i.test(error.message)) {
      return {
        error:
          "Cette adresse a déjà un compte. Utilisez-en une autre, ou fermez d'abord l'accès existant.",
      };
    }
    reportError(error, {
      scope: "grant-portal-access",
      organizationId: auth.session.organization.id,
      userId: auth.session.userId,
      extra: { tenantId },
    });
    return { error: "L'ouverture de l'accès a échoué. Réessayez." };
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
    // Un compte sans profil serait orphelin : il n'atteindrait aucun écran
    // et bloquerait toute nouvelle ouverture sur cette adresse.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: `Ouverture annulée : ${profileError.message}` };
  }

  revalidatePath("/tenants");
  return {
    link: await buildActivationLink(data.properties.hashed_token, "invite"),
    tenantName: `${tenant.firstname} ${tenant.lastname}`,
    tenantPhone: tenant.phone,
  };
}

/**
 * Produit un nouveau lien pour un accès déjà ouvert.
 *
 * Le premier lien expire au bout de vingt-quatre heures — durée fixée par
 * Supabase, non par l'application — et le
 * gestionnaire l'égare parfois avant de l'avoir transmis. Régénérer est
 * la bonne réponse : cela invalide l'ancien plutôt que de faire circuler
 * un lien dont personne ne sait plus où il est passé.
 */
export async function regeneratePortalLink(
  _prev: PortalAccessState,
  formData: FormData,
): Promise<PortalAccessState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { error: "Locataire introuvable." };

  const limit = await rateLimit({
    key: await callerKey("portal-link"),
    limit: 60,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop de liens générés. Réessayez plus tard." };
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, firstname, lastname, email, phone")
    .eq("id", tenantId)
    .maybeSingle<{
      id: string;
      firstname: string;
      lastname: string;
      email: string | null;
      phone: string | null;
    }>();

  if (!tenant?.email) return { error: "Locataire introuvable." };

  const admin = createAdminClient();
  if (!admin) return { error: "Clé SUPABASE_SERVICE_ROLE_KEY absente." };

  // `recovery` et non `invite` : le compte existe déjà. Le lien permet au
  // locataire de (re)choisir son mot de passe.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: tenant.email,
  });

  if (error || !data) {
    reportError(error, {
      scope: "regenerate-portal-link",
      organizationId: auth.session.organization.id,
      extra: { tenantId },
    });
    return { error: "La génération du lien a échoué. Réessayez." };
  }

  return {
    link: await buildActivationLink(data.properties.hashed_token, "recovery"),
    tenantName: `${tenant.firstname} ${tenant.lastname}`,
    tenantPhone: tenant.phone,
  };
}

export async function revokePortalAccess(
  _prev: PortalAccessState,
  formData: FormData,
): Promise<PortalAccessState> {
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
  // n'atteint plus aucun écran. Supprimer le compte lui-même exige la clé
  // admin, et libère l'adresse pour une réouverture future.
  const admin = createAdminClient();
  if (admin) await admin.auth.admin.deleteUser(profile.id);

  revalidatePath("/tenants");
  return {};
}
