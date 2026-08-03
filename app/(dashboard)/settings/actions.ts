"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { authorize, requireSession } from "@/lib/auth";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/logo";
import { NOTIFICATION_PREFERENCES } from "@/lib/notifications";
import { reportError } from "@/lib/observability";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import {
  firstIssue,
  formDataToObject,
  organizationSettingsSchema,
  passwordChangeSchema,
  profileSchema,
} from "@/lib/validation";

/** Nom affiché du membre connecté. */
export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();

  const parsed = profileSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  // Seuls `firstname` et `lastname` partent : `role` et `tenant_id` sont de
  // toute façon refusés par le déclencheur `profiles_guard_columns`.
  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", session.userId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Changement de mot de passe sans quitter l'application.
 *
 * Jusqu'ici, la seule voie passait par « mot de passe oublié », donc par un
 * e-mail — ce qui, sans SMTP raccordé, revenait à dire qu'on ne pouvait pas
 * changer son mot de passe du tout.
 *
 * L'ancien mot de passe est revérifié par une véritable authentification.
 * Supabase ne l'exige pas ; nous si, pour qu'une session détournée ne
 * puisse pas verrouiller le titulaire hors de son compte.
 */
export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();

  const parsed = passwordChangeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // Sans limite, ce formulaire devient un oracle : on y devinerait le mot de
  // passe actuel par essais successifs, depuis une session déjà ouverte.
  const limit = await rateLimit({
    key: await callerKey("password-change"),
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop de tentatives. Réessayez dans un quart d'heure." };
  }

  const supabase = await createClient();

  const { error: reauth } = await supabase.auth.signInWithPassword({
    email: session.email,
    password: parsed.data.current,
  });
  if (reauth) return { error: "Mot de passe actuel incorrect." };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

/**
 * Types de notification que le compte ne veut plus voir.
 *
 * Les cases cochées désignent ce que l'on GARDE : c'est le sens naturel
 * d'une case à cocher, et l'inverse — cocher pour couper — se lit de
 * travers une fois sur deux. On enregistre donc le complément.
 */
export async function updateNotificationPreferences(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();

  const gardés = new Set(formData.getAll("kinds").map(String));
  const mutés = NOTIFICATION_PREFERENCES.map((p) => p.kind).filter(
    (kind) => !gardés.has(kind),
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ muted_notifications: mutés })
    .eq("id", session.userId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  // La pastille du bandeau vit dans le layout : sans cela, elle continuerait
  // d'annoncer des notifications qu'on vient de couper.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Ferme toutes les sessions, y compris celles d'autres appareils.
 *
 * `scope: "global"` révoque tous les jetons de rafraîchissement du compte.
 * L'appelant est déconnecté lui aussi — c'est voulu, et annoncé : le geste
 * n'a de sens que si l'on soupçonne un accès qu'on ne contrôle plus.
 */
export async function signOutEverywhere(): Promise<void> {
  await requireSession();

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });

  revalidatePath("/", "layout");
  redirect("/login?deconnexion=globale");
}

/** Nom et logo de l'organisation. Réservé au propriétaire. */
export async function updateOrganization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner");
  if (!auth.ok) return { error: auth.error };

  const parsed = organizationSettingsSchema.safeParse(
    formDataToObject(formData),
  );
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const orgId = auth.session.organization.id;

  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", orgId);

  if (error) return { error: error.message };

  // Le logo est facultatif et son échec ne doit pas annuler le renommage :
  // on le signale sans perdre ce qui a déjà été enregistré.
  const logoError = await replaceLogo(formData.get("logo"), orgId);

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return logoError ? { ok: true, error: logoError } : { ok: true };
}

async function replaceLogo(
  value: FormDataEntryValue | null,
  orgId: string,
): Promise<string | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > LOGO_MAX_BYTES) {
    return "Nom enregistré. Le logo dépasse 1 Mo et n'a pas été remplacé.";
  }
  if (!(LOGO_TYPES as readonly string[]).includes(value.type)) {
    return "Nom enregistré. Format de logo non accepté (PNG, JPEG, WebP ou SVG).";
  }

  try {
    const supabase = await createClient();
    const extension = value.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${orgId}/logo.${extension}`;

    const { error } = await supabase.storage
      .from("logos")
      .upload(path, value, { upsert: true, contentType: value.type });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("logos").getPublicUrl(path);

    // L'horodatage force le navigateur — et le cache d'images de Next — à
    // recharger : sans lui, remplacer un logo par un autre du même nom
    // n'aurait aucun effet visible, et l'utilisateur réessaierait en boucle.
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: `${publicUrl}?v=${Date.now()}` })
      .eq("id", orgId);
    if (updateError) throw updateError;

    return null;
  } catch (cause) {
    reportError(cause, { scope: "settings-logo", organizationId: orgId });
    return "Nom enregistré, mais le logo n'a pas pu être remplacé.";
  }
}
