import { NextResponse, type NextRequest } from "next/server";

import { reportError } from "@/lib/observability";
import { paymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

type PaymentRow = { amount: number; currency: string; intent_id: string | null };

/** IPN PayDunya : le hash est contrôlé, puis le token est confirmé via l'API. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const payload = parsePayDunyaCallback(rawBody);
  const provider = paymentProvider();
  if (!provider.verifyWebhookSignature(rawBody, stringValue(payload.data.hash))) {
    return NextResponse.json({ error: "Signature PayDunya invalide." }, { status: 401 });
  }
  const transactionId = provider.extractTransactionId(payload);
  if (!transactionId) return NextResponse.json({ error: "Token PayDunya absent." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service indisponible." }, { status: 503 });

  let verified;
  try { verified = await provider.verifyPayment(transactionId); } catch (error) {
    reportError(error, { scope: "paydunya-ipn-verify", extra: { transactionId } });
    return NextResponse.json({ error: "Vérification impossible." }, { status: 503 });
  }
  const eventId = `paydunya:${transactionId}:${verified.status}`;
  const { data: alreadySeen } = await admin.from("payment_events").select("id").eq("event_id", eventId).maybeSingle<{ id: string }>();
  if (alreadySeen) return NextResponse.json({ received: true, deduplicated: true });
  await admin.from("payment_events").insert({ transaction_id: transactionId, event_id: eventId, event_type: verified.status, payload: payload as Record<string, unknown> });

  const { data: payment } = await admin.from("payments").select("amount, currency, intent_id").eq("transaction_id", transactionId).maybeSingle<PaymentRow>();
  if (!payment) return NextResponse.json({ received: true, matched: false });
  const failedStatus = verified.status === "cancelled" ? "cancelled" : "failed";
  if (!verified.paid) {
    if (payment.intent_id) await admin.rpc("fail_signup_intent", { p_transaction_id: transactionId, p_status: failedStatus });
    else if (verified.status === "cancelled" || verified.status === "failed") await admin.rpc("fail_payment", { p_transaction_id: transactionId, p_status: failedStatus });
    return NextResponse.json({ received: true, status: verified.status });
  }
  if (Number(verified.amount) !== Number(payment.amount) || verified.currency !== payment.currency) {
    reportError(new Error("Montant ou devise PayDunya divergents."), { scope: "paydunya-ipn-validation", extra: { transactionId, verifiedAmount: verified.amount, expectedAmount: payment.amount } });
    return NextResponse.json({ received: true, verified: false }, { status: 422 });
  }
  if (!payment.intent_id) {
    const { data: result, error } = await admin.rpc("confirm_payment", { p_transaction_id: transactionId, p_method: "paydunya" }).maybeSingle<{ outcome: string; expires_at: string | null }>();
    if (error) return NextResponse.json({ error: "Activation impossible." }, { status: 503 });
    return NextResponse.json({ received: true, outcome: result?.outcome, expires_at: result?.expires_at });
  }
  const { data: confirmed, error: confirmError } = await admin.rpc("confirm_signup_payment", { p_transaction_id: transactionId, p_method: "paydunya" }).maybeSingle<{ outcome: string; intent_id: string | null; email: string | null; org_name: string | null; plan_id: string | null }>();
  if (confirmError || !confirmed?.intent_id || !confirmed.email || !confirmed.org_name || !confirmed.plan_id) return NextResponse.json({ error: "Confirmation d'inscription impossible." }, { status: 503 });
  if (confirmed.outcome === "already_processed") return NextResponse.json({ received: true, outcome: confirmed.outcome });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "invite", email: confirmed.email });
  if (linkError || !link.user?.id) {
    reportError(linkError ?? new Error("Lien d'activation PayDunya absent"), { scope: "paydunya-ipn-generate-link", extra: { transactionId } });
    return NextResponse.json({ error: "Création du compte impossible." }, { status: 503 });
  }
  const { data: provisioned, error: provisionError } = await admin.rpc("provision_signup_intent", { p_intent_id: confirmed.intent_id, p_user_id: link.user.id }).maybeSingle<{ outcome: string; expires_at: string | null }>();
  if (provisionError) return NextResponse.json({ error: "Provisionnement impossible." }, { status: 503 });
  return NextResponse.json({ received: true, outcome: provisioned?.outcome, expires_at: provisioned?.expires_at });
}

function parsePayDunyaCallback(rawBody: string): { data: Record<string, unknown> } {
  const params = new URLSearchParams(rawBody);
  const directData = params.get("data");
  if (directData) try {
    const parsed: unknown = JSON.parse(directData);
    if (parsed && typeof parsed === "object") return { data: parsed as Record<string, unknown> };
  } catch { /* PayDunya peut poster des clés data[...]. */ }
  const data: Record<string, unknown> = {};
  for (const [key, value] of params) {
    const match = key.match(/^data\[([^\]]+)\]$/);
    if (match) data[match[1]] = value;
  }
  return { data };
}

function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
