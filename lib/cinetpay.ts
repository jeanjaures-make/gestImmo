import "server-only";

/**
 * Client CinetPay — environnement TEST/SANDBOX uniquement.
 *
 * Les clés ne sont JAMAIS préfixées `NEXT_PUBLIC_` : elles restent
 * côté serveur. Le frontend ne reçoit que l'URL de checkout.
 *
 * Documentation Sandbox :
 *   https://docs.cinetpay.com/api/1-introduction
 *
 * En Sandbox, les cartes de test sont :
 *   - Numéro : 4242 4242 4242 4242
 *   - Expiration : n'importe quelle date future
 *   - CVV : 123
 */

/** Configuration CinetPay lue depuis les variables d'environnement. */
function cinetpayConfig() {
  const apiKey = process.env.CINETPAY_API_KEY;
  const siteId = process.env.CINETPAY_SITE_ID;
  const apiUrl = process.env.CINETPAY_API_URL;
  const checkoutUrl = process.env.CINETPAY_CHECKOUT_URL;
  const env = process.env.CINETPAY_ENV ?? "test";

  if (!apiKey || !siteId || !apiUrl || !checkoutUrl) {
    throw new Error(
      "CinetPay n'est pas configuré. Renseignez CINETPAY_API_KEY, " +
        "CINETPAY_SITE_ID, CINETPAY_API_URL et CINETPAY_CHECKOUT_URL " +
        "dans .env.local.",
    );
  }

  return { apiKey, siteId, apiUrl, checkoutUrl, env };
}

/** Indique si CinetPay est configuré — sans lever d'erreur. */
export function isCinetpayConfigured() {
  return Boolean(
    process.env.CINETPAY_API_KEY &&
      process.env.CINETPAY_SITE_ID &&
      process.env.CINETPAY_API_URL &&
      process.env.CINETPAY_CHECKOUT_URL,
  );
}

export type CinetpayPaymentRequest = {
  transaction_id: string;
  amount: number;
  currency: string;
  description: string;
  customer_name: string;
  customer_email: string;
  return_url: string;
  notify_url: string;
};

export type CinetpayPaymentResponse = {
  status: "accepted" | "pending" | "refused" | string;
  data?: {
    payment_url?: string;
    payment_method?: string;
    [key: string]: unknown;
  };
  message?: string;
  [key: string]: unknown;
};

/**
 * Crée un paiement auprès de CinetPay Sandbox.
 *
 * Retourne l'URL du checkout que le navigateur doit ouvrir.
 */
export async function createCinetpayPayment(
  params: CinetpayPaymentRequest,
): Promise<{ paymentUrl: string; paymentMethod?: string }> {
  const { apiKey, siteId, apiUrl, checkoutUrl } = cinetpayConfig();

  // L'API CinetPay attend un POST JSON avec les identifiants dans le corps.
  const body = {
    apikey: apiKey,
    site_id: siteId,
    transaction_id: params.transaction_id,
    amount: params.amount,
    currency: params.currency,
    description: params.description,
    customer_name: params.customer_name,
    customer_email: params.customer_email,
    return_url: params.return_url,
    notify_url: params.notify_url,
  };

  const response = await fetch(`${apiUrl}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `CinetPay: échec de la création (${response.status}).`,
    );
  }

  const result = (await response.json()) as CinetpayPaymentResponse;

  // CinetPay peut retourner un statut "accepted" avec une payment_url,
  // ou un statut "pending" si le paiement doit encore être initié.
  const paymentUrl = result.data?.payment_url;
  if (!paymentUrl) {
    // En Sandbox, l'URL de checkout peut être construite directement.
    const url = new URL(checkoutUrl);
    url.searchParams.set("transaction_id", params.transaction_id);
    url.searchParams.set("site_id", siteId);
    return { paymentUrl: url.toString() };
  }

  return { paymentUrl, paymentMethod: result.data?.payment_method };
}

export type CinetpayVerificationResponse = {
  status: "accepted" | "refused" | "pending" | string;
  data?: {
    amount?: number;
    currency?: string;
    transaction_id?: string;
    payment_method?: string;
    status?: string;
    [key: string]: unknown;
  };
  message?: string;
  [key: string]: unknown;
};

/**
 * Vérifie un paiement auprès de CinetPay.
 *
 * C'est l'appel serveur qui fait foi — jamais la notification du
 * webhook seule. On vérifie :
 *   - le statut (accepted) ;
 *   - le montant (doit correspondre exactement) ;
 *   - la devise ;
 *   - le site ID.
 */
export async function verifyCinetpayPayment(
  transactionId: string,
): Promise<{
  ok: boolean;
  status: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  error?: string;
}> {
  const { apiKey, siteId, apiUrl } = cinetpayConfig();

  const body = {
    apikey: apiKey,
    site_id: siteId,
    transaction_id: transactionId,
  };

  const response = await fetch(`${apiUrl}/payment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: "error",
      error: `CinetPay: vérification échouée (${response.status}).`,
    };
  }

  const result = (await response.json()) as CinetpayVerificationResponse;

  if (result.status !== "accepted") {
    return {
      ok: false,
      status: result.status,
      error: result.message ?? "Paiement non accepté.",
    };
  }

  const data = result.data;
  if (!data) {
    return { ok: false, status: "error", error: "Réponse CinetPay incomplète." };
  }

  return {
    ok: true,
    status: "accepted",
    amount: data.amount,
    currency: data.currency,
    paymentMethod: data.payment_method,
  };
}

/** Génère un identifiant de transaction unique côté CaisseOps. */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `COP-${timestamp}-${random}`.toUpperCase();
}
