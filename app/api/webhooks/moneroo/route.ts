import { NextResponse, type NextRequest } from "next/server";

import { reportError } from "@/lib/observability";
import { paymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notifications Moneroo.
 *
 * Cette route est publique — Moneroo n'a pas de session Supabase. Sa
 * sécurité tient à trois choses, dans cet ordre :
 *
 *   1. La SIGNATURE. `X-Moneroo-Signature` porte un HMAC-SHA256 du corps,
 *      calculé avec le secret de notification. Sans elle, quiconque
 *      devinant un identifiant de transaction activerait un abonnement
 *      gratuitement. L'ancienne intégration ne vérifiait rien.
 *   2. La RE-VÉRIFICATION. Le corps reçu n'est qu'un signal : on
 *      redemande à Moneroo l'état réel de la transaction. Une
 *      notification dit « regarde », pas « c'est payé ».
 *   3. Le MONTANT et la DEVISE, comparés à ce que nous avions enregistré.
 *
 * ─── Toujours répondre 200 ──────────────────────────────────────────────
 * Moneroo rejoue jusqu'à trois fois, à dix minutes d'intervalle, si la
 * réponse n'est pas 200 ou tarde plus de trois secondes. Répondre 500 sur
 * une transaction inconnue déclencherait donc trois rejeux inutiles. On
 * réserve le refus au seul cas qui le mérite : une signature invalide.
 */
export async function POST(request: NextRequest) {
  const provider = paymentProvider();

  // Le corps BRUT, avant toute analyse : la signature porte sur ces
  // octets-là. Re-sérialiser l'objet en changerait l'ordre et les espaces,
  // et aucune signature ne correspondrait plus jamais.
  const rawBody = await request.text();
  const signature = request.headers.get("x-moneroo-signature");

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    // 401 volontairement : c'est le seul cas où l'on veut que Moneroo
    // rejoue — un secret mal configuré se corrige, et les tentatives
    // suivantes aboutiront.
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }

  const transactionId = provider.extractTransactionId(payload);
  const eventType = provider.extractEventType(payload);

  if (!transactionId) {
    return NextResponse.json({ received: true, matched: false });
  }

  const admin = createAdminClient();
  if (!admin) {
    reportError(new Error("SUPABASE_SERVICE_ROLE_KEY absente"), {
      scope: "moneroo-webhook",
      extra: { transactionId, eventType },
    });
    // 503 : la notification est valable, c'est nous qui ne pouvons pas la
    // traiter. Un rejeu a toutes ses chances une fois la clé posée.
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }

  // Le journal brut, avant tout traitement : même une notification qu'on
  // finira par écarter doit laisser une trace consultable.
  await admin.from("payment_events").insert({
    transaction_id: transactionId,
    event_type: eventType,
    payload: payload as Record<string, unknown>,
  });

  // ─── Les événements qui ne sont pas un encaissement ────────────────
  if (eventType === "payment.failed" || eventType === "payment.cancelled") {
    await admin.rpc("fail_payment", {
      p_transaction_id: transactionId,
      p_status: eventType === "payment.cancelled" ? "cancelled" : "failed",
    });
    return NextResponse.json({ received: true, status: eventType });
  }

  if (eventType !== "payment.success") {
    // `payment.initiated` et tout événement futur : journalisé, sans effet.
    return NextResponse.json({ received: true, ignored: eventType });
  }

  // ─── L'état réel, demandé au fournisseur ───────────────────────────
  let verified;
  try {
    verified = await provider.verifyPayment(transactionId);
  } catch (error) {
    reportError(error, {
      scope: "moneroo-webhook-verify",
      extra: { transactionId },
    });
    return NextResponse.json({ error: "Vérification impossible." }, { status: 503 });
  }

  if (!verified.paid) {
    await admin.rpc("fail_payment", {
      p_transaction_id: transactionId,
      p_status: "failed",
    });
    return NextResponse.json({ received: true, verified: false, status: verified.status });
  }

  // ─── Le montant doit être celui que nous avons demandé ─────────────
  const { data: payment } = await admin
    .from("payments")
    .select("id, amount, currency, status")
    .eq("transaction_id", transactionId)
    .maybeSingle<{
      id: string;
      amount: number;
      currency: string;
      status: string;
    }>();

  if (!payment) {
    // Transaction inconnue chez nous : journalisée, sans effet. On répond
    // 200 pour ne pas provoquer trois rejeux qui n'y changeront rien.
    return NextResponse.json({ received: true, matched: false });
  }

  if (Number(verified.amount) !== Number(payment.amount)) {
    await admin.rpc("fail_payment", {
      p_transaction_id: transactionId,
      p_status: "failed",
    });
    reportError(
      new Error(
        `Montant divergent : ${verified.amount} reçu, ${payment.amount} attendu.`,
      ),
      { scope: "moneroo-webhook-amount", extra: { transactionId } },
    );
    return NextResponse.json({ received: true, verified: false, error: "amount_mismatch" });
  }

  if (verified.currency && verified.currency !== payment.currency) {
    await admin.rpc("fail_payment", {
      p_transaction_id: transactionId,
      p_status: "failed",
    });
    return NextResponse.json({ received: true, verified: false, error: "currency_mismatch" });
  }

  // ─── L'activation, atomique et idempotente ─────────────────────────
  // Tout se joue dans `confirm_payment` : verrou sur la ligne de
  // paiement, report des jours restants, clôture de l'abonnement
  // précédent. Trois notifications identiques n'y produisent qu'une
  // activation.
  const { data: result, error } = await admin
    .rpc("confirm_payment", {
      p_transaction_id: transactionId,
      p_method: verified.status,
    })
    .maybeSingle<{
      outcome: string;
      subscription_id: string | null;
      expires_at: string | null;
    }>();

  if (error) {
    reportError(error, {
      scope: "moneroo-webhook-confirm",
      extra: { transactionId },
    });
    return NextResponse.json({ error: "Activation impossible." }, { status: 503 });
  }

  return NextResponse.json({
    received: true,
    outcome: result?.outcome ?? "unknown",
    expires_at: result?.expires_at ?? null,
  });
}
