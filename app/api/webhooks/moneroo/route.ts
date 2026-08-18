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
 * ─── Deux natures de transaction, un seul webhook ───────────────────────
 * `payments.intent_id` distingue les deux : NULL pour un propriétaire déjà
 * connu qui renouvelle ou change de plan (chemin `confirm_payment`,
 * inchangé) ; renseigné pour une inscription qui n'a encore ni compte ni
 * organisation (chemin `confirm_signup_payment` + provisionnement). Cette
 * route est la SEULE autorité qui fait naître un compte : rien côté
 * navigateur — ni `/payment/success`, ni un paramètre d'URL — n'a ce
 * pouvoir.
 *
 * ─── Toujours répondre 200 ──────────────────────────────────────────────
 * Moneroo rejoue jusqu'à trois fois, à dix minutes d'intervalle, si la
 * réponse n'est pas 200 ou tarde plus de trois secondes. Répondre 500 sur
 * une transaction inconnue déclencherait donc trois rejeux inutiles. On
 * réserve le refus au seul cas qui le mérite : une signature invalide, ou
 * un provisionnement qui mérite une seconde tentative.
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

  // Une seule lecture, tôt : elle sert à choisir la bonne paire de
  // fonctions (paiement seul, ou paiement + inscription) pour tout le
  // reste de la requête.
  const { data: payment } = await admin
    .from("payments")
    .select("id, amount, currency, status, intent_id")
    .eq("transaction_id", transactionId)
    .maybeSingle<PaymentRow>();

  if (!payment) {
    // Transaction inconnue chez nous : journalisée, sans effet. On répond
    // 200 pour ne pas provoquer trois rejeux qui n'y changeront rien.
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

  // ─── Les événements qui ne sont pas un encaissement ────────────────
  if (eventType === "payment.failed" || eventType === "payment.cancelled") {
    await markFailed(eventType === "payment.cancelled" ? "cancelled" : "failed");
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
    await markFailed("failed");
    return NextResponse.json({ received: true, verified: false, status: verified.status });
  }

  // ─── Le montant doit être celui que nous avons demandé ─────────────
  // `payment.amount` vient de la ligne écrite au moment de la création du
  // paiement, elle-même toujours copiée de `plans.price` — jamais du
  // navigateur, que ce soit pour un renouvellement ou une inscription.
  if (Number(verified.amount) !== Number(payment.amount)) {
    await markFailed("failed");
    reportError(
      new Error(
        `Montant divergent : ${verified.amount} reçu, ${payment.amount} attendu.`,
      ),
      { scope: "moneroo-webhook-amount", extra: { transactionId } },
    );
    return NextResponse.json({ received: true, verified: false, error: "amount_mismatch" });
  }

  if (verified.currency && verified.currency !== payment.currency) {
    await markFailed("failed");
    return NextResponse.json({ received: true, verified: false, error: "currency_mismatch" });
  }

  // ─── Renouvellement d'un propriétaire déjà connu — inchangé ─────────
  if (!isSignup) {
    // Tout se joue dans `confirm_payment` : verrou sur la ligne de
    // paiement, report des jours restants, clôture de l'abonnement
    // précédent. Trois notifications identiques n'y produisent qu'une
    // activation.
    const { data: result, error } = await admin
      .rpc("confirm_payment", { p_transaction_id: transactionId, p_method: verified.status })
      .maybeSingle<{ outcome: string; subscription_id: string | null; expires_at: string | null }>();

    if (error) {
      reportError(error, { scope: "moneroo-webhook-confirm", extra: { transactionId } });
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
      organization_id: string | null;
    }>();

  if (confirmError || !confirmed) {
    reportError(confirmError ?? new Error("confirm_signup_payment vide"), {
      scope: "moneroo-webhook-confirm-signup",
      extra: { transactionId },
    });
    return NextResponse.json({ error: "Activation impossible." }, { status: 503 });
  }

  if (confirmed.outcome === "already_active") {
    // Déjà provisionné par une livraison précédente : rien à refaire.
    return NextResponse.json({ received: true, outcome: "already_active" });
  }

  if (confirmed.outcome !== "confirmed" && confirmed.outcome !== "already_paid") {
    // 'unknown' — ne devrait pas arriver, `payment.intent_id` était non
    // nul. Journalisé pour investigation, répondu sans rejeu inutile.
    reportError(new Error(`confirm_signup_payment : outcome inattendu « ${confirmed.outcome} »`), {
      scope: "moneroo-webhook-confirm-signup",
      extra: { transactionId },
    });
    return NextResponse.json({ received: true, outcome: confirmed.outcome });
  }

  // Le paiement est acquis à cet instant, quel que soit ce qui suit : le
  // provisionnement peut échouer et se retenter, mais jamais faire
  // regarder le paiement comme non payé — l'argent, lui, a bien été pris.
  const email = confirmed.email!;
  const intentId = confirmed.intent_id!;

  // Repli : une livraison précédente a peut-être déjà créé le compte et
  // crashé juste avant de le rattacher. Évite un appel `generateLink`
  // inutile — et son erreur « already exists » — dans le cas courant.
  const { data: freshStatus } = await admin.rpc("signup_intent_status", {
    p_intent_id: intentId,
  });
  if (freshStatus === "active") {
    return NextResponse.json({ received: true, outcome: "already_active" });
  }

  // `generateLink` est le SEUL geste qui crée le compte Supabase Auth —
  // sans mot de passe, sans e-mail envoyé, exactement comme l'invitation
  // d'un collaborateur. `provision_signup_intent` fait le reste
  // (organisation, profil propriétaire, abonnement actif) dans une seule
  // transaction SQL, pour qu'il n'existe jamais d'état où l'un existe
  // sans l'autre.
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });

  if (inviteError || !invited?.user) {
    if (inviteError && /already been registered|already exists/i.test(inviteError.message)) {
      // Fenêtre de course très étroite : une autre livraison a créé le
      // compte entre notre lecture de statut et cet appel. Elle finira
      // (ou a fini) le provisionnement ; Moneroo retente dans les minutes
      // qui suivent, largement assez pour que ce soit réglé.
      reportError(inviteError, {
        scope: "moneroo-webhook-provision-race",
        extra: { transactionId, intentId },
      });
      return NextResponse.json({ received: true, outcome: "retry" }, { status: 503 });
    }

    reportError(inviteError ?? new Error("generateLink invite vide"), {
      scope: "moneroo-webhook-provision",
      extra: { transactionId, intentId },
    });
    return NextResponse.json({ error: "Provisionnement impossible." }, { status: 503 });
  }

  const { data: provisioned, error: provisionError } = await admin
    .rpc("provision_signup_intent", { p_intent_id: intentId, p_user_id: invited.user.id })
    .maybeSingle<{ outcome: string; organization_id: string | null; expires_at: string | null }>();

  if (provisionError) {
    reportError(provisionError, {
      scope: "moneroo-webhook-provision",
      extra: { transactionId, intentId, userId: invited.user.id },
    });
    return NextResponse.json({ error: "Provisionnement impossible." }, { status: 503 });
  }

  return NextResponse.json({
    received: true,
    outcome: provisioned?.outcome ?? "unknown",
    expires_at: provisioned?.expires_at ?? null,
  });
}
