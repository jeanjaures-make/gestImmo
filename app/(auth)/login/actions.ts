"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { signupMode } from "@/lib/auth-config";
import { reportError } from "@/lib/observability";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  credentialsSchema,
  emailSchema,
  firstIssue,
  formDataToObject,
  passwordUpdateSchema,
  signupSchema,
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

/**
 * Création de compte.
 *
 * Deux chemins, choisis par `signupMode()` — voir `lib/auth-config.ts`.
 * L'écran d'inscription n'a pas à savoir lequel est actif, et passer de
 * l'un à l'autre ne touche ni à l'interface ni au reste du parcours.
 */
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // Vingt par heure et par adresse IP, non cinq.
  //
  // La limite porte sur l'IP publique, or une large part des utilisateurs
  // visés se connecte derrière le NAT d'un opérateur mobile : des centaines
  // de personnes y partagent une seule adresse. À cinq, une agence
  // inscrivant ses collaborateurs se bloquait elle-même, et le cabinet
  // voisin avec elle. Vingt laisse passer l'usage légitime tout en restant
  // sans intérêt pour une inscription automatisée, qui en veut des milliers.
  const limit = await rateLimit({
    key: await callerKey("signup"),
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return {
      error:
        "Trop de créations de compte depuis cet appareil. Réessayez plus tard.",
    };
  }

  const parsed = signupSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { email, password } = parsed.data;

  return signupMode() === "email-confirmation"
    ? signUpWithConfirmation(email, password)
    : signUpInstant(email, password);
}

/**
 * Compte créé et confirmé côté serveur, session ouverte dans la foulée.
 *
 * `createUser` n'envoie aucun message : l'inscription ne dépend donc
 * d'aucun serveur d'envoi. La session est ensuite établie par une
 * connexion normale, ce qui pose exactement les mêmes cookies que si
 * l'utilisateur s'était connecté lui-même — aucun chemin
 * d'authentification parallèle n'est introduit.
 */
async function signUpInstant(
  email: string,
  password: string,
): Promise<AuthState> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "L'inscription est momentanément indisponible. Écrivez-nous à contact@immoops.fr.",
    };
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      // Compromis assumé : on révèle que l'adresse est prise. À
      // l'inscription l'information fuit de toute façon — deux comptes ne
      // peuvent pas partager une adresse — autant l'annoncer clairement
      // plutôt que de laisser l'utilisateur buter sans comprendre. La
      // connexion, elle, reste indistincte.
      return {
        error: "Un compte existe déjà pour cette adresse. Connectez-vous.",
      };
    }
    reportError(error, { scope: "signup-instant" });
    return {
      error: "La création du compte a échoué. Réessayez dans un instant.",
    };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    // Le compte existe, seule la session a échoué. On ne le supprime pas :
    // l'utilisateur peut se connecter, et on le lui dit.
    reportError(signInError, { scope: "signup-instant-signin" });
    return {
      message:
        "Votre compte est créé. Connectez-vous pour accéder à votre espace.",
    };
  }

  await logAttempt(email, true);
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

/** Chemin classique : un lien de confirmation, une session après le clic. */
async function signUpWithConfirmation(
  email: string,
  password: string,
): Promise<AuthState> {
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return {
        error: "Un compte existe déjà pour cette adresse. Connectez-vous.",
      };
    }
    reportError(error, { scope: "signup-confirmation" });
    return {
      error:
        "L'envoi du message de confirmation a échoué. Réessayez dans un instant.",
    };
  }

  if (!data.session) {
    return {
      message: `Compte créé. Un lien de confirmation vient d'être envoyé à ${email}.`,
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
    return {
      error: "Ce lien a expiré. Demandez un nouvel e-mail de réinitialisation.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
