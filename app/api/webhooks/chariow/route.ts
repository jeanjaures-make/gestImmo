import { NextResponse, type NextRequest } from "next/server";

import { reportError } from "@/lib/observability";
import { paymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhooks / Pulses Chariow.
 *
 * Documentation Chariow :
 *   - En-tête `x-chariow-signature` (HMAC-SHA256 au format "sha256=<hex>")
 *   - En-tête `x-pulse-delivery-id` (clé unique de livraison / idempotence)
 *   - En-tête `x-pulse-event` ("successful.sale", "failed.sale", "abandoned.sale", etc.)
 *
 * Cette route est publique et authentifiée par la signature HMAC-SHA256.
 */
type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  intent_id: string | null;
};

export async function POST(request: NextRequest) {
  const provider = paymentProvider();

  const rawBody = await request.text();
  const signature = request.headers.get("x-chariow-signature");
  const deliveryId = request.headers.get("x-pulse-delivery-id");

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }

  const transactionId = provider.extractTransactionId(payload);
  const eventType =
    request.headers.get("x-pulse-event") || provider.extractEventType(payload);

  if (!transactionId) {
    return NextResponse.json({ received: true, matched: false });
  }

  const admin = createAdminClient();
  if (!admin) {
    reportError(new Error("SUPABASE_SERVICE_ROLE_KEY absente"), {
      scope: "chariow-webhook",
      extra: { transactionId, eventType, deliveryId },
    });
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }

  // Idempotence au niveau de payment_events si delivery_id est fourni
  if (deliveryId) {
    const { data: existingEvent } = await admin
      .from("payment_events")
      .select("id")
      .eq("event_id", deliveryId)
      .maybeSingle<{ id: string }>();

    if (existingEvent) {
      // Déjà traité, réponse 200 immédiate sans retraiter
      return NextResponse.json({ received: true, deduplicated: true });
    }
  }

  // Journalisation de l'événement dans payment_events
  await admin.from("payment_events").insert({
    transaction_id: transactionId,
    event_id: deliveryId || null,
    event_type: eventType,
    payload: payload as Record<string, unknown>,
  });

  const { data: payment } = await admin
    .from("payments")
    .select("id, amount, currency, status, intent_id")
    .eq("transaction_id", transactionId)
    .maybeSingle<PaymentRow>();

  if (!payment) {
    // Transaction inconnue dans notre table : on répond 200 pour clore le webhook
    return NextResponse.json({ received: true, matched: false });
  }

  const isSignup = payment.intent_id !== null;

  async function markFailed(status: "failed" | "cancelled" | "expired") {
    if (isSignup) {
      await admin!.rpc("fail_signup_intent", {
        p_transaction_id: transactionId,
        p_status: status,
      });
    } else {
      await admin!.rpc("fail_payment", {
        p_transaction_id: transactionId,
        p_status: status,
      });
    }
  }

  // ─── Événements d'abandon ou d'échec ────────────────────────────────
  if (eventType === "failed.sale" || eventType === "abandoned.sale") {
    await markFailed(eventType === "abandoned.sale" ? "cancelled" : "failed");
    return NextResponse.json({ received: true, status: eventType });
  }

  if (eventType !== "successful.sale") {
    return NextResponse.json({ received: true, ignored: eventType });
  }

  // ─── Re-vérification auprès de l'API Chariow ────────────────────────
  let verified;
  try {
    verified = await provider.verifyPayment(transactionId);
  } catch (error) {
    reportError(error, {
      scope: "chariow-webhook-verify",
      extra: { transactionId },
    });
    return NextResponse.json({ error: "Vérification impossible." }, { status: 503 });
  }

  if (!verified.paid) {
    await markFailed("failed");
    return NextResponse.json({ received: true, verified: false, status: verified.status });
  }

  // ─── Vérification du montant et de la devise ────────────────────────
  if (Number(verified.amount) !== Number(payment.amount)) {
    await markFailed("failed");
    reportError(
      new Error(
        `Montant divergent : ${verified.amount} reçu, ${payment.amount} attendu.`,
      ),
      { scope: "chariow-webhook-amount", extra: { transactionId } },
    );
    return NextResponse.json({ received: true, verified: false, error: "amount_mismatch" });
  }

  if (verified.currency && verified.currency !== payment.currency) {
    await markFailed("failed");
    return NextResponse.json({ received: true, verified: false, error: "currency_mismatch" });
  }

  // ─── Renouvellement d'abonnement pour une organisation existante ────
  if (!isSignup) {
    const { data: result, error } = await admin
      .rpc("confirm_payment", { p_transaction_id: transactionId, p_method: verified.status })
      .maybeSingle<{ outcome: string; subscription_id: string | null; expires_at: string | null }>();

    if (error) {
      reportError(error, { scope: "chariow-webhook-confirm", extra: { transactionId } });
      return NextResponse.json({ error: "Activation impossible." }, { status: 503 });
    }

    return NextResponse.json({
      received: true,
      outcome: result?.outcome ?? "unknown",
      expires_at: result?.expires_at ?? null,
    });
  }

  // ─── Inscription — paiement confirmé, provisionnement du compte ─────
  const { data: confirmed, error: confirmError } = await admin
    .rpc("confirm_signup_payment", { p_transaction_id: transactionId, p_method: verified.status })
    .maybeSingle<{
      outcome: string;
      intent_id: string | null;
      email: string | null;
      org_name: string | null;
      plan_id: string | null;
    }>();

  if (confirmError || !confirmed?.intent_id || !confirmed.email || !confirmed.org_name || !confirmed.plan_id) {
    reportError(confirmError ?? new Error("Intention introuvable ou déjà traitée"), {
      scope: "chariow-webhook-confirm-signup",
      extra: { transactionId },
    });
    return NextResponse.json({ error: "Confirmation d'inscription impossible." }, { status: 503 });
  }

  if (confirmed.outcome === "already_processed") {
    return NextResponse.json({ received: true, outcome: "already_processed" });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: confirmed.email,
  });

  if (linkError || !link.user?.id) {
    reportError(linkError ?? new Error("Génération du lien échouée"), {
      scope: "chariow-webhook-generate-link",
      extra: { transactionId, email: confirmed.email },
    });
    return NextResponse.json({ error: "Création du compte impossible." }, { status: 503 });
  }

  const { data: provisioned, error: provError } = await admin
    .rpc("provision_signup_intent", {
      p_intent_id: confirmed.intent_id,
      p_user_id: link.user.id,
    })
    .maybeSingle<{
      outcome: string;
      organization_id: string | null;
      subscription_id: string | null;
      expires_at: string | null;
    }>();

  if (provError) {
    reportError(provError, {
      scope: "chariow-webhook-provision",
      extra: { transactionId, intentId: confirmed.intent_id, userId: link.user.id },
    });
    return NextResponse.json({ error: "Provisionnement impossible." }, { status: 503 });
  }

  return NextResponse.json({
    received: true,
    outcome: provisioned?.outcome ?? "provisioned",
    organization_id: provisioned?.organization_id,
    subscription_id: provisioned?.subscription_id,
    expires_at: provisioned?.expires_at,
  });
}
