"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { reportError } from "@/lib/observability";
import {
  generatePaymentReference,
  paymentProvider,
  PaymentProviderError,
} from "@/lib/payments";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { firstIssue, formDataToObject, signupIntentSchema } from "@/lib/validation";

export type SignupState = { error?: string };

/**
 * Amorce une inscription — SANS créer le moindre compte.
 *
 * ─── Ce que cette action NE fait PAS ────────────────────────────────────
 * Elle n'appelle jamais `supabase.auth.signUp()` ni
 * `admin.auth.admin.createUser()`. Aucune ligne n'apparaît dans
 * `organizations` ni `profiles`. Le visiteur qui remplit ce formulaire et
 * ferme l'onglet sans payer ne laisse derrière lui qu'une intention —
 * une déclaration d'intérêt sans le moindre pouvoir d'accès — que le
 * balayage quotidien efface au bout de 24 h.
 *
 * Le compte n'existe qu'après confirmation du paiement, par le webhook
 * Moneroo (`app/api/webhooks/moneroo/route.ts`) — seule autorité
 * d'activation. Voir `provision_signup_intent` dans
 * `supabase/subscriptions.sql`.
 */
export async function startSignup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  // Route publique, non authentifiée, qui ouvre une transaction chez
  // Moneroo : plus resserrée que la limite de paiement d'un propriétaire
  // déjà connu (10/10 min), puisque n'importe qui sur Internet l'atteint.
  const limit = await rateLimit({
    key: await callerKey("signup-start"),
    limit: 8,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return {
      error: "Trop de tentatives d'inscription depuis cet appareil. Réessayez plus tard.",
    };
  }

  const parsed = signupIntentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, org_name: orgName, plan: planSlug } = parsed.data;

  const provider = paymentProvider();
  if (!provider.isConfigured()) {
    return { error: "Le paiement en ligne n'est pas encore configuré." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: "L'inscription est momentanément indisponible. Écrivez-nous à contact@caisseops.com.",
    };
  }

  // Le prix vient de la base, jamais du formulaire. Client anonyme : la
  // policy `plans_select` autorise sa lecture sans session.
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, slug, name, price, currency")
    .eq("slug", planSlug)
    .eq("is_active", true)
    .maybeSingle<{ id: string; slug: string; name: string; price: number; currency: string }>();

  if (!plan) {
    return { error: "Cette offre n'est plus disponible. Choisissez-en une autre." };
  }

  // Vérification anticipée, pas une garantie : une course reste possible
  // entre deux inscriptions simultanées pour la même adresse. La
  // contrainte d'unicité sur `signup_intents` et la gestion de l'erreur
  // « already exists » de `generateLink`, côté webhook, ferment le reste
  // de la fenêtre. Mais mieux vaut le dire ICI, avant tout paiement,
  // qu'après avoir pris l'argent d'un compte qui ne pourra pas naître.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return { error: "Un compte existe déjà pour cette adresse. Connectez-vous." };
  }

  const { data: intent, error: intentError } = await admin
    .from("signup_intents")
    .insert({ email, org_name: orgName, plan_id: plan.id })
    .select("id")
    .single<{ id: string }>();

  if (intentError) {
    // Contrainte partielle sur (lower(email)) WHERE status IN (pending, paid).
    if (intentError.code === "23505") {
      return {
        error:
          "Une inscription est déjà en cours pour cette adresse. Vérifiez vos paiements en attente, ou patientez 24 h qu'elle expire.",
      };
    }
    return { error: "Impossible de préparer l'inscription." };
  }

  const reference = generatePaymentReference();

  const { error: paymentError } = await admin.from("payments").insert({
    intent_id: intent.id,
    organization_id: null,
    plan_id: plan.id,
    transaction_id: reference,
    amount: plan.price,
    currency: plan.currency,
    provider: provider.name,
    status: "pending",
    metadata: { payment_ref: reference, plan_slug: plan.slug, plan_name: plan.name },
  });

  if (paymentError) {
    await admin.from("signup_intents").delete().eq("id", intent.id);
    return { error: "Impossible d'enregistrer le paiement." };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  let checkoutUrl: string;

  try {
    const result = await provider.createPayment({
      amount: Number(plan.price),
      currency: plan.currency,
      description: `Abonnement ${plan.name} — CaisseOps`,
      customer: { email, firstName: "Client", lastName: "CaisseOps" },
      // L'identifiant de l'INTENTION, pas notre référence de paiement :
      // c'est ce que /payment/success interroge, et c'est ce que la
      // réclamation (claim) verrouille à usage unique.
      returnUrl: `${origin}/payment/success?ref=${intent.id}`,
      metadata: { payment_ref: reference, intent_id: intent.id, plan_id: plan.id },
    });

    const { error: linkError, count } = await admin
      .from("payments")
      .update({ transaction_id: result.transactionId }, { count: "exact" })
      .eq("transaction_id", reference);

    if (linkError || !count) {
      reportError(linkError ?? new Error("Aucune ligne de paiement mise à jour"), {
        scope: "signup-start-link",
        extra: { reference, transactionId: result.transactionId, intentId: intent.id },
      });
    }

    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    await admin.rpc("fail_signup_intent", {
      p_transaction_id: reference,
      p_status: "failed",
    });

    reportError(error, {
      scope: "signup-start",
      extra: { reference, planSlug: plan.slug, intentId: intent.id },
    });

    const message =
      error instanceof PaymentProviderError
        ? error.message
        : "Le service de paiement est momentanément indisponible.";
    return { error: message };
  }

  redirect(checkoutUrl);
}
