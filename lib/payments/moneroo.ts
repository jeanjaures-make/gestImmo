import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentProviderError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type VerifiedPayment,
} from "./provider";

/**
 * Fournisseur Moneroo.
 *
 * Tout ce qui suit vient de la documentation officielle, relevée avant
 * d'écrire une ligne :
 *
 *   Ouvrir un paiement  POST https://api.moneroo.io/v1/payments/initialize
 *   Vérifier            GET  https://api.moneroo.io/v1/payments/{id}/verify
 *   Authentification    Authorization: Bearer <clé secrète>
 *   Notification        en-tête X-Moneroo-Signature, HMAC-SHA256 du corps
 *   Événements          payment.initiated | success | failed | cancelled
 *
 * ─── Bac à sable ────────────────────────────────────────────────────────
 * L'URL de base est la MÊME en test et en production : c'est la clé qui
 * choisit l'environnement. Il n'y a donc pas de variable `MONEROO_ENV` —
 * elle ne commanderait rien, et une variable qui ne commande rien finit
 * par mentir. L'environnement réel se lit dans la réponse de vérification,
 * champ `environment`, ce qui vaut mieux qu'une déclaration de notre part.
 */
const DEFAULT_API_URL = "https://api.moneroo.io/v1";

function apiUrl() {
  return (process.env.MONEROO_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");
}

export class MonerooPaymentProvider implements PaymentProvider {
  readonly name = "moneroo";

  isConfigured(): boolean {
    return Boolean(process.env.MONEROO_SECRET_KEY);
  }

  private secretKey(): string {
    const key = process.env.MONEROO_SECRET_KEY;
    if (!key) {
      throw new PaymentProviderError(
        "Moneroo n'est pas configuré : MONEROO_SECRET_KEY est absente.",
      );
    }
    return key;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secretKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createPayment(
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    const response = await fetch(`${apiUrl()}/payments/initialize`, {
      method: "POST",
      headers: this.headers(),
      cache: "no-store",
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        customer: {
          email: input.customer.email,
          first_name: input.customer.firstName,
          last_name: input.customer.lastName,
        },
        return_url: input.returnUrl,
        metadata: input.metadata,
        // `methods` est volontairement omis : sans liste, Moneroo propose
        // les méthodes activées sur le compte. Les énumérer ici
        // reviendrait à figer dans le code une disponibilité qui se règle
        // au tableau de bord — et à casser le jour où elle change.
      }),
    });

    const body = await readJson(response);

    if (!response.ok) {
      throw new PaymentProviderError(
        describeError(body) ?? `Moneroo a refusé la création (${response.status}).`,
        response.status,
      );
    }

    const data = (body as { data?: { id?: string; checkout_url?: string } })
      ?.data;

    if (!data?.id || !data?.checkout_url) {
      // On ne fabrique pas d'URL de repli : une adresse de paiement
      // devinée mène le client vers une page qui n'encaisse rien.
      throw new PaymentProviderError(
        "Réponse Moneroo incomplète : identifiant ou URL de paiement absent.",
      );
    }

    return { transactionId: data.id, checkoutUrl: data.checkout_url };
  }

  async verifyPayment(transactionId: string): Promise<VerifiedPayment> {
    const response = await fetch(
      `${apiUrl()}/payments/${encodeURIComponent(transactionId)}/verify`,
      { method: "GET", headers: this.headers(), cache: "no-store" },
    );

    const body = await readJson(response);

    if (!response.ok) {
      throw new PaymentProviderError(
        describeError(body) ?? `Vérification Moneroo échouée (${response.status}).`,
        response.status,
      );
    }

    const data = (body as { data?: Record<string, unknown> })?.data;
    if (!data) {
      throw new PaymentProviderError("Réponse de vérification Moneroo vide.");
    }

    const status = String(data.status ?? "unknown");

    // La devise arrive en objet — { name, symbol, code } — et c'est `code`
    // qui se compare à ce que nous avons enregistré.
    const currency =
      typeof data.currency === "object" && data.currency !== null
        ? String((data.currency as { code?: unknown }).code ?? "")
        : String(data.currency ?? "");

    return {
      paid: status === "success",
      status,
      amount: Number(data.amount ?? 0),
      currency,
      metadata:
        typeof data.metadata === "object" && data.metadata !== null
          ? (data.metadata as Record<string, unknown>)
          : {},
      environment:
        typeof data.environment === "string" ? data.environment : undefined,
    };
  }

  /**
   * Compare la signature reçue à celle qu'on recalcule.
   *
   * `timingSafeEqual` plutôt que `===` : une comparaison qui s'arrête au
   * premier octet différent laisse mesurer, requête après requête,
   * combien de caractères sont justes. C'est une attaque connue et le
   * correctif tient en une ligne.
   *
   * Sans secret configuré, on REFUSE. Le contraire — accepter faute de
   * pouvoir vérifier — transformerait l'oubli d'une variable en porte
   * ouverte sur l'activation gratuite des abonnements.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    const secret = process.env.MONEROO_WEBHOOK_SECRET;
    if (!secret || !signature) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

    const received = Buffer.from(signature.trim(), "utf8");
    const computed = Buffer.from(expected, "utf8");

    // `timingSafeEqual` lève si les longueurs diffèrent : on l'écarte
    // d'abord, ce qui ne révèle rien qu'un attaquant ne sache déjà.
    if (received.length !== computed.length) return false;
    return timingSafeEqual(received, computed);
  }

  extractTransactionId(payload: unknown): string | null {
    const data = (payload as { data?: { id?: unknown } })?.data;
    const id = data?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  extractEventType(payload: unknown): string {
    const event = (payload as { event?: unknown })?.event;
    return typeof event === "string" ? event : "unknown";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Remonte le message d'erreur de Moneroo quand il en donne un. */
function describeError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : null;
}
