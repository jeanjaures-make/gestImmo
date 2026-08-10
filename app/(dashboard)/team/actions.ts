"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildActivationLink } from "@/lib/activation-link";
import { authorize } from "@/lib/auth";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { checkUserLimit } from "@/lib/subscriptions";
import { firstIssue, formDataToObject } from "@/lib/validation";

const ROLES = ["owner", "manager", "accountant", "viewer"] as const;

const inviteSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
  role: z.enum(ROLES),
  firstname: z.string().trim().max(80).default(""),
  lastname: z.string().trim().max(80).default(""),
});

export async function inviteMember(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner");
  if (!auth.ok) return { error: auth.error };

  const limit = await rateLimit({
    key: await callerKey("invite"),
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop d'invitations envoyées. Réessayez plus tard." };
  }

  const parsed = inviteSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // Limite d'utilisateurs du plan : vérifiée côté serveur.
  const userLimit = await checkUserLimit(auth.session.organization.id);
  if (!userLimit.allowed) {
    return {
      error:
        userLimit.limit === 0
          ? "Aucun abonnement actif. Souscrivez un plan pour inviter des membres."
          : `Limite atteinte : ${userLimit.current}/${userLimit.limit} utilisateurs sur votre plan ${userLimit.planName}. Passez à un plan supérieur pour inviter davantage de membres.`,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Invitations indisponibles : la clé SUPABASE_SERVICE_ROLE_KEY n'est pas configurée.",
    };
  }

  // `generateLink` et non `inviteUserByEmail` : le lien est produit sans
  // qu'aucun message ne parte. Le propriétaire le transmet lui-même, ce qui
  // rend l'invitation possible sans serveur d'envoi.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
  });

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return {
        error:
          "Cette adresse a déjà un compte. Elle ne peut pas rejoindre une seconde organisation.",
      };
    }
    // Aucun envoi n'a lieu ici : si Supabase refuse, c'est l'adresse
    // elle-même qui est en cause, pas l'acheminement.
    if (/email|address/i.test(error.message)) {
      return { error: "Supabase a refusé cette adresse. Vérifiez sa saisie." };
    }
    return { error: "La génération du lien a échoué. Réessayez." };
  }

  // Le profil est écrit avec le client admin : il n'existe volontairement
  // aucune policy INSERT sur `profiles`, pour qu'un membre ne puisse pas
  // s'inventer un rôle.
  if (!data?.user) return { error: "La génération du lien a échoué." };

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    organization_id: auth.session.organization.id,
    firstname: parsed.data.firstname,
    lastname: parsed.data.lastname,
    email: parsed.data.email,
    role: parsed.data.role,
  });

  if (profileError) {
    // Sans profil, le compte créé serait orphelin et bloquerait toute
    // nouvelle invitation à cette adresse.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: `Invitation annulée : ${profileError.message}` };
  }

  revalidatePath("/team");
  // Le lien remonte à l'écran : c'est au propriétaire de le transmettre.
  // Il ouvre une session, on ne l'écrit donc ni en base ni dans le journal.
  return {
    ok: true,
    link: await buildActivationLink(data.properties.hashed_token, "invite"),
  };
}

export async function updateMemberRole(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner");
  if (!auth.ok) return { error: auth.error };

  const memberId = String(formData.get("member_id") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!memberId) return { error: "Membre introuvable." };
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return { error: "Rôle invalide." };
  }
  if (memberId === auth.session.userId) {
    return { error: "Vous ne pouvez pas modifier votre propre rôle." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath("/team");
  return { ok: true };
}

export async function removeMember(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner");
  if (!auth.ok) return { error: auth.error };

  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "Membre introuvable." };
  if (memberId === auth.session.userId) {
    return { error: "Vous ne pouvez pas vous retirer vous-même." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").delete().eq("id", memberId);
  if (error) return { error: error.message };

  // Le compte d'authentification n'est supprimé que si l'on dispose des
  // droits admin ; sinon le profil disparaît, ce qui suffit à couper l'accès
  // (aucun profil ⇒ aucune organisation ⇒ redirection vers l'onboarding).
  const admin = createAdminClient();
  if (admin) await admin.auth.admin.deleteUser(memberId);

  revalidatePath("/team");
  return { ok: true };
}
