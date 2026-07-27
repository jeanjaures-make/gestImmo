"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import { describeInviteError } from "@/lib/mailer";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
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

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Invitations indisponibles : la clé SUPABASE_SERVICE_ROLE_KEY n'est pas configurée.",
    };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  );

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return {
        error:
          "Cette adresse a déjà un compte. Elle ne peut pas rejoindre une seconde organisation.",
      };
    }
    return { error: describeInviteError(error.message) };
  }

  // Le profil est écrit avec le client admin : il n'existe volontairement
  // aucune policy INSERT sur `profiles`, pour qu'un membre ne puisse pas
  // s'inventer un rôle.
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
  return { ok: true };
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
