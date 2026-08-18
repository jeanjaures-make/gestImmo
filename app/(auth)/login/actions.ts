"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { callerKey, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import {
  credentialsSchema,
  emailSchema,
  firstIssue,
  formDataToObject,
  passwordUpdateSchema,
} from "@/lib/validation";

export type AuthState = { error?: string; message?: string };

/** Journalise la tentative sans jamais faire échouer la connexion elle-même. */
async function logAttempt(email: string, success: boolean) {
  try {
    const h = await headers();
    const supabase = await createClient();
    await supabase.rpc("record_login_event", {
      p_email: email,
      p_success: success,
      p_ip:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null,
      p_user_agent: h.get("user-agent") ?? null,
    });
  } catch {
    // L'audit ne doit jamais bloquer l'authentification.
  }
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // 10 tentatives par IP et par 5 minutes, avant même de toucher à Supabase.
  const limit = await rateLimit({
    key: await callerKey("signin"),
    limit: 10,
    windowMs: 5 * 60_000,
  });
  if (!limit.ok) {
    return {
      error: `Trop de tentatives. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
    };
  }

  const parsed = credentialsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  await logAttempt(parsed.data.email, !error);

  if (error) {
    // Message identique pour une adresse inconnue et un mot de passe faux :
    // les distinguer révélerait quels comptes existent.
    //
    // Seule exception : l'adresse en attente de confirmation. Sans ce
    // message, l'utilisateur chercherait indéfiniment une faute de frappe
    // dans un mot de passe pourtant correct.
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "Votre adresse n'est pas encore confirmée. Ouvrez le lien reçu par e-mail.",
      };
    }
    return { error: "Adresse e-mail ou mot de passe incorrect." };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limit = await rateLimit({
    key: await callerKey("reset"),
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!limit.ok) {
    return {
      error: `Trop de demandes. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
    };
  }

  const parsed = emailSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Réponse identique que l'adresse existe ou non : pas d'énumération.
  return {
    message:
      "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
  };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = passwordUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Ce lien a expiré. Demandez un nouvel e-mail de réinitialisation.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  // `requireSession()` renverra vers `/onboarding` si le compte n'appartient
  // encore à aucune organisation : inutile de le vérifier ici.
  redirect("/dashboard");
}
