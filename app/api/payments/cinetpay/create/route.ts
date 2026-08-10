import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import {
  createCinetpayPayment,
  generateTransactionId,
  isCinetpayConfigured,
} from "@/lib/cinetpay";
import { getPlanById } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";

/**
 * Crée un paiement CinetPay Sandbox.
 *
 * Le frontend n'envoie QUE `{ plan_id }`. Le prix, la devise et la
 * durée viennent de la base — jamais du navigateur.
 *
 * Étapes :
 *   1. Authentification Supabase (session requise).
 *   2. Récupération de l'organisation.
 *   3. Récupération du plan depuis Supabase.
 *   4. Vérification que le plan est actif.
 *   5. Génération d'un transaction_id unique.
 *   6. Création d'une ligne `payments` (pending) + `subscriptions` (pending).
 *   7. Appel à CinetPay Sandbox.
 *   8. Retour de l'URL de checkout.
 */
export async function POST(request: NextRequest) {
  // 1. Authentification
  const session = await getSession();
  if (!session || session === "no-profile") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // CinetPay doit être configuré
  if (!isCinetpayConfigured()) {
    return NextResponse.json(
      { error: "CinetPay n'est pas configuré." },
      { status: 503 },
    );
  }

  // 2. Lecture du body — uniquement plan_id
  let body: { plan_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const planId = body.plan_id;
  if (!planId || typeof planId !== "string") {
    return NextResponse.json(
      { error: "plan_id est requis." },
      { status: 400 },
    );
  }

  // 3. Récupération du plan depuis la base
  const plan = await getPlanById(planId);
  if (!plan) {
    return NextResponse.json(
      { error: "Plan introuvable ou inactif." },
      { status: 404 },
    );
  }

  // 4. Génération du transaction_id
  const transactionId = generateTransactionId();

  const supabase = await createClient();
  const organizationId = session.organization.id;

  // 5. Création de l'abonnement pending
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
      { error: "Impossible de créer l'abonnement." },
      { status: 500 },
    );
  }

  // 6. Création du paiement pending
  const { error: paymentError } = await supabase.from("payments").insert({
    organization_id: organizationId,
    user_id: session.userId,
    subscription_id: subscription.id,
    plan_id: plan.id,
    transaction_id: transactionId,
    amount: plan.price,
    currency: plan.currency,
    provider: "cinetpay",
    status: "pending",
    metadata: { plan_slug: plan.slug, plan_name: plan.name },
  });

  if (paymentError) {
    // Nettoyage : on retire l'abonnement pending orphelin.
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Impossible d'enregistrer le paiement." },
      { status: 500 },
    );
  }

  // 7. Appel à CinetPay Sandbox
  const origin = new URL(request.url).origin;
  try {
    const { paymentUrl } = await createCinetpayPayment({
      transaction_id: transactionId,
      amount: plan.price,
      currency: plan.currency,
      description: `Abonnement ${plan.name} — CaisseOps`,
      customer_name:
        `${session.profile.firstname} ${session.profile.lastname}`.trim() ||
        session.email,
      customer_email: session.email,
      return_url: `${origin}/payment/success?tx=${transactionId}`,
      notify_url: `${origin}/api/webhooks/cinetpay`,
    });

    return NextResponse.json({ payment_url: paymentUrl, transaction_id: transactionId });
  } catch (error) {
    // Nettoyage : on marque le paiement comme failed plutôt que de
    // laisser un pending qui ne sera jamais confirmé.
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("transaction_id", transactionId);

    const message =
      error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json(
      { error: `CinetPay: ${message}` },
      { status: 502 },
    );
  }
}
