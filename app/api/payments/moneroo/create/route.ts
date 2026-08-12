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
import { createClient } from "@/lib/supabase/server";

/**
 * Ouvre un paiement d'abonnement.
 *
 * Le navigateur n'envoie que `{ plan_id }`. Le montant, la devise et la
 * durée sont relus depuis `plans` — accepter un montant du client
 * reviendrait à laisser fixer son propre prix.
 *
 * L'organisation et l'utilisateur viennent de la session, jamais du corps
 * de la requête : c'est ce qui empêche de payer l'abonnement d'autrui, ou
 * de se l'attribuer.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session === "no-profile") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // Le rôle est vérifié ici en plus du RLS : sans cela, un caissier
  // obtenait une erreur opaque APRÈS qu'une transaction ait été ouverte
  // chez le fournisseur.
  if (!canAdminister(session.profile.role)) {
    return NextResponse.json(
      { error: "Seul le propriétaire peut souscrire un abonnement." },
      { status: 403 },
    );
  }

  // Chaque appel ouvre une transaction chez Moneroo et écrit deux lignes.
  // Sans limite, un clic répété en fabrique autant.
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

  let body: { plan_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const planId = body.plan_id;
  if (typeof planId !== "string" || !planId) {
    return NextResponse.json({ error: "plan_id est requis." }, { status: 400 });
  }

  // `getPlanById` ne rend que les plans actifs : un plan retiré de la
  // vente ne peut donc plus être souscrit, même par une URL conservée.
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
  // `transaction_id` porte d'abord NOTRE référence : la colonne est NOT
  // NULL et UNIQUE, et l'identifiant Moneroo n'existe pas encore. Il la
  // remplacera dès la réponse du fournisseur — c'est lui que la
  // notification nous renverra.
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

  // ─── L'appel au fournisseur ────────────────────────────────────────
  const origin = new URL(request.url).origin;

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
      // Ces trois valeurs reviendront à la vérification. Elles ne sont pas
      // la source de vérité — l'organisation est relue en base — mais
      // elles permettent de retrouver le paiement si l'identifiant du
      // fournisseur n'a pas pu être écrit chez nous.
      metadata: {
        payment_ref: reference,
        organization_id: organizationId,
        plan_id: plan.id,
      },
    });

    // L'identifiant du fournisseur devient la clé de la transaction :
    // c'est celui que la notification portera.
    const { error: linkError } = await supabase
      .from("payments")
      .update({ transaction_id: transactionId })
      .eq("transaction_id", reference);

    if (linkError) {
      // La transaction existe chez Moneroo mais nous ne savons plus la
      // relier. La notification retombera sur `payment_ref`, conservé
      // dans les métadonnées — d'où l'intérêt de l'y avoir mis.
      reportError(linkError, {
        scope: "moneroo-create-link",
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
    // Un paiement qui n'a jamais atteint le fournisseur ne doit pas rester
    // « en attente » : il ne sera jamais confirmé et brouillerait la
    // lecture de l'historique.
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("transaction_id", reference);
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", subscription.id);

    reportError(error, {
      scope: "moneroo-create",
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
