"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { callerKey, rateLimit } from "@/lib/rate-limit";
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

  // Message volontairement identique pour un e-mail inconnu et un mot de
  // passe faux : ne pas révéler quels comptes existent.
  if (error) return { error: "Identifiants incorrects." };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limit = await rateLimit({
    key: await callerKey("signup"),
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop de créations de compte. Réessayez plus tard." };
  }

  const parsed = credentialsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) return { error: error.message };

  // Si la confirmation par e-mail est activée dans Supabase, aucune session
  // n'est ouverte tant que le lien n'est pas cliqué.
  if (!data.session) {
    return {
      message:
        "Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
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
    return { error: "Lien expiré. Redemandez un e-mail de réinitialisation." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
