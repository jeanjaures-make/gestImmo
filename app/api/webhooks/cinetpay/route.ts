import { NextResponse, type NextRequest } from "next/server";

import { verifyCinetpayPayment, isCinetpayConfigured } from "@/lib/cinetpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook CinetPay — reçoit les notifications de paiement.
 *
 * Ce route handler est PUBLIC : CinetPay n'a pas de session Supabase.
 * La sécurité repose sur :
 *   1. La vérification serveur auprès de CinetPay (statut + montant).
 *   2. L'idempotence : un même événement reçu deux fois ne réactive pas.
 *   3. Le client admin (service_role) qui contourne le RLS — sans lui,
 *      le webhook ne pourrait pas écrire.
 *
 * Flux :
 *   1. Réception du payload.
 *   2. Extraction du transaction_id.
 *   3. Enregistrement du payload dans payment_events (journal brut).
 *   4. Recherche du paiement local.
 *   5. Si déjà paid → idempotence, on retourne 200 sans rien faire.
 *   6. Vérification auprès de CinetPay (statut, montant, devise).
 *   7. Si tout correspond : payment → paid, subscription → active.
 *   8. Calcul de l'expiration (renouvellement ou nouvelle période).
 */
export async function POST(request: NextRequest) {
  if (!isCinetpayConfigured()) {
    return NextResponse.json(
      { error: "CinetPay non configuré." },
      { status: 503 },
    );
  }

  // 1. Réception du payload
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    // CinetPay peut envoyer en form-encoded selon la configuration.
    const text = await request.text();
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Payload illisible." },
        { status: 400 },
      );
    }
  }

  // 2. Extraction du transaction_id
  const transactionId = String(
    payload.transaction_id ?? payload.tx_id ?? "",
  );
  if (!transactionId) {
    return NextResponse.json(
      { error: "transaction_id manquant." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service non configuré." },
      { status: 503 },
    );
  }

  // 3. Enregistrement du payload brut — toujours, pour le journal.
  await admin.from("payment_events").insert({
    transaction_id: transactionId,
    event_type: String(payload.status ?? payload.event_type ?? "notification"),
    payload,
  });

  // 4. Recherche du paiement local
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      subscription_id: string | null;
      plan_id: string;
      amount: number;
      currency: string;
      status: string;
    }>();

  if (!payment) {
    // Transaction inconnue : on log mais on répond 200 pour que CinetPay
    // ne rejoue pas indéfiniment.
    return NextResponse.json({ received: true, matched: false });
  }

  // 5. Idempotence : si déjà paid, on ne rejoue pas.
  if (payment.status === "paid") {
    return NextResponse.json({ received: true, already_paid: true });
  }

  // 6. Vérification auprès de CinetPay
  const verification = await verifyCinetpayPayment(transactionId);
  if (!verification.ok) {
    // Marquer comme failed si refusé, sinon laisser en pending.
    if (verification.status === "refused") {
      await admin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", payment.id);
    }
    return NextResponse.json({
      received: true,
      verified: false,
      status: verification.status,
    });
  }

  // 7. Vérification du montant — règle absolue.
  if (
    verification.amount == null ||
    Number(verification.amount) !== Number(payment.amount)
  ) {
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return NextResponse.json(
      { received: true, verified: false, error: "Montant incorrect." },
      { status: 200 },
    );
  }

  // 8. Vérification de la devise
  if (
    verification.currency &&
    verification.currency !== payment.currency
  ) {
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return NextResponse.json(
      { received: true, verified: false, error: "Devise incorrecte." },
      { status: 200 },
    );
  }

  // 9. Activation : payment → paid
  await admin
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: verification.paymentMethod ?? null,
    })
    .eq("id", payment.id);

  // 10. Activation de l'abonnement avec gestion du renouvellement.
  //     Si un abonnement actif existe déjà, on ajoute la durée à son
  //     expiration actuelle (les jours restants ne sont pas perdus).
  //     Sinon, on part de maintenant.
  const now = new Date();

  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id, expires_at")
    .eq("organization_id", payment.organization_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; expires_at: string | null }>();

  // Récupération de la durée du plan
  const { data: plan } = await admin
    .from("plans")
    .select("duration_days")
    .eq("id", payment.plan_id)
    .maybeSingle<{ duration_days: number }>();

  const durationDays = plan?.duration_days ?? 30;

  let expiresAt: string;
  let startedAt: string;

  if (existingSub && existingSub.expires_at) {
    const currentExpiry = new Date(existingSub.expires_at);
    if (currentExpiry > now) {
      // Renouvellement avant expiration : on ajoute la durée.
      // setUTCDate évite les décalages d'heure d'été/hiver.
      currentExpiry.setUTCDate(currentExpiry.getUTCDate() + durationDays);
      expiresAt = currentExpiry.toISOString();
      startedAt = now.toISOString();
    } else {
      // Abonnement expiré : on repart de maintenant.
      const expiry = new Date(now);
      expiry.setUTCDate(expiry.getUTCDate() + durationDays);
      expiresAt = expiry.toISOString();
      startedAt = now.toISOString();
    }
  } else {
    // Nouvel abonnement.
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + durationDays);
    expiresAt = expiry.toISOString();
    startedAt = now.toISOString();
  }

  // Marquer l'abonnement pending comme actif
  if (payment.subscription_id) {
    await admin
      .from("subscriptions")
      .update({
        status: "active",
        started_at: startedAt,
        expires_at: expiresAt,
      })
      .eq("id", payment.subscription_id);
  }

  return NextResponse.json({
    received: true,
    verified: true,
    activated: true,
    expires_at: expiresAt,
  });
}
