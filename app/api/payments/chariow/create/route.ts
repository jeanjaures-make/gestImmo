import { NextResponse, type NextRequest } from "next/server";

import { canAdminister, getSession } from "@/lib/auth";
import { reportError } from "@/lib/observability";
import {
  generatePaymentReference,
  paymentProvider,
  PaymentProviderError,
} from "@/lib/payments";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { getPlanById } from "@/lib/subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Ouvre un paiement d'abonnement via Chariow.
 *
 * Le navigateur n'envoie que `{ plan_id }`. Le montant, la devise et la
 * durée sont relus depuis `plans` côté serveur — accepter un montant du client
 * reviendrait à laisser fixer son propre prix.
 *
 * L'organisation et l'utilisateur viennent de la session, jamais du corps
 * de la requête.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session === "no-profile") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!canAdminister(session.profile.role)) {
    return NextResponse.json(
      { error: "Seul le propriétaire peut souscrire un abonnement." },
      { status: 403 },
    );
  }

  const limit = await rateLimit({
    key: await callerKey("payment-create"),
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives de paiement. Patientez quelques minutes." },
      { status: 429 },
    );
  }

  const provider = paymentProvider();
  if (!provider.isConfigured()) {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas encore configuré." },
      { status: 503 },
    );
  }

  let body: { plan_id?: unknown; phone?: unknown; country_code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const planId = body.plan_id;
  if (typeof planId !== "string" || !planId) {
    return NextResponse.json({ error: "plan_id est requis." }, { status: 400 });
  }

  const plan = await getPlanById(planId);
  if (!plan) {
    return NextResponse.json(
      { error: "Plan introuvable ou retiré de la vente." },
      { status: 404 },
    );
  }

  const supabase = await createClient();
  const organizationId = session.organization.id;
  const reference = generatePaymentReference();

  // ─── L'abonnement en attente ───────────────────────────────────────
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .insert({
      organization_id: organizationId,
      plan_id: plan.id,
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (subError || !subscription) {
    return NextResponse.json(
      { error: "Impossible de préparer l'abonnement." },
      { status: 500 },
    );
  }

  // ─── Le paiement en attente ────────────────────────────────────────
  const { error: paymentError } = await supabase.from("payments").insert({
    organization_id: organizationId,
    user_id: session.userId,
    subscription_id: subscription.id,
    plan_id: plan.id,
    transaction_id: reference,
    amount: plan.price,
    currency: plan.currency,
    provider: provider.name,
    status: "pending",
    metadata: {
      payment_ref: reference,
      plan_slug: plan.slug,
      plan_name: plan.name,
    },
  });

  if (paymentError) {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Impossible d'enregistrer le paiement." },
      { status: 500 },
    );
  }

  // ─── L'appel à Chariow ───────────────────────────────────────────────
  const origin = new URL(request.url).origin;
  const phone = typeof body.phone === "string" ? body.phone : session.organization.phone || "";
  const countryCode = typeof body.country_code === "string" ? body.country_code : "CI";

  try {
    const { transactionId, checkoutUrl } = await provider.createPayment({
      amount: Number(plan.price),
      currency: plan.currency,
      description: `Abonnement ${plan.name} — CaisseOps`,
      customer: {
        email: session.email,
        firstName: session.profile.firstname || "Client",
        lastName: session.profile.lastname || "CaisseOps",
      },
      returnUrl: `${origin}/payment/success?ref=${reference}`,
      metadata: {
        payment_ref: reference,
        organization_id: organizationId,
        plan_id: plan.id,
        plan_slug: plan.slug,
        phone,
        country_code: countryCode,
      },
    });

    const admin = createAdminClient();
    const { error: linkError, count } = admin
      ? await admin
          .from("payments")
          .update({ transaction_id: transactionId }, { count: "exact" })
          .eq("transaction_id", reference)
      : { error: new Error("SUPABASE_SERVICE_ROLE_KEY absente"), count: 0 };

    if (linkError || !count) {
      reportError(linkError ?? new Error("Aucune ligne de paiement mise à jour"), {
        scope: "chariow-create-link",
        organizationId,
        userId: session.userId,
        extra: { reference, transactionId },
      });
    }

    return NextResponse.json({
      checkout_url: checkoutUrl,
      transaction_id: transactionId,
      reference,
    });
  } catch (error) {
    const admin = createAdminClient();
    if (admin) {
      await admin.rpc("fail_payment", {
        p_transaction_id: reference,
        p_status: "failed",
      });
    }

    reportError(error, {
      scope: "chariow-create",
      organizationId,
      userId: session.userId,
      extra: { reference, planSlug: plan.slug },
    });

    const message =
      error instanceof PaymentProviderError
        ? error.message
        : "Le service de paiement est momentanément indisponible.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
