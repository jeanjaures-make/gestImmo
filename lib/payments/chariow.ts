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
 * Fournisseur de paiement Chariow.
 *
 * Documentation officielle :
 *   Ouvrir un checkout  POST https://api.chariow.com/v1/checkout
 *   Vérifier une vente  GET  https://api.chariow.com/v1/sales/{saleId}
 *   Authentification    Authorization: Bearer <clé secrète sk_live_... / sk_test_...>
 *   Notification/Pulse  En-tête x-chariow-signature (format "sha256=<hex>")
 *                       En-tête x-pulse-delivery-id (clé d'idempotence)
 *                       En-tête x-pulse-event (successful.sale | failed.sale | abandoned.sale)
 *   Secret Pulse        CHARIOW_WEBHOOK_SECRET (préfixe whsec_...)
 */
const DEFAULT_API_URL = "https://api.chariow.com/v1";

function apiUrl() {
  return (process.env.CHARIOW_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");
}

export class ChariowPaymentProvider implements PaymentProvider {
  readonly name = "chariow";

  isConfigured(): boolean {
    return Boolean(process.env.CHARIOW_API_KEY?.trim());
  }

  private apiKey(): string {
    const key = process.env.CHARIOW_API_KEY?.trim();
    if (!key) {
      throw new PaymentProviderError(
        "Chariow n'est pas configuré : CHARIOW_API_KEY est absente.",
      );
    }
    return key;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createPayment(
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    // Dans Chariow, l'API exige un `product_id` réel publié sur votre store Chariow
    // (ex: "prd_abc123xyz" ou le slug du produit créé dans votre dashboard Chariow).
    //
    // Ordre de priorité pour trouver le product_id :
    // 1. input.metadata.product_id (si passé explicitement)
    // 2. Variable d'environnement spécifique au plan (ex: CHARIOW_PRODUCT_STARTER, CHARIOW_PRODUCT_BUSINESS, CHARIOW_PRODUCT_UNLIMITED)
    // 3. input.metadata.plan_slug (si le slug sur Chariow correspond exactement au slug du plan)
    // 4. CHARIOW_DEFAULT_PRODUCT_ID (si un seul produit est configuré sur Chariow)
    const planSlug = (input.metadata.plan_slug || "").toLowerCase();
    const envPlanProductId =
      planSlug === "starter"
        ? process.env.CHARIOW_PRODUCT_STARTER
        : planSlug === "business"
          ? process.env.CHARIOW_PRODUCT_BUSINESS
          : planSlug === "unlimited"
            ? process.env.CHARIOW_PRODUCT_UNLIMITED
            : undefined;

    let productId =
      input.metadata.product_id ||
      envPlanProductId ||
      input.metadata.plan_slug ||
      process.env.CHARIOW_DEFAULT_PRODUCT_ID;

    if (!productId) {
      throw new PaymentProviderError(
        "Identifiant de produit Chariow introuvable. Veuillez configurer le produit dans votre tableau de bord Chariow.",
      );
    }

    // Si une URL complète a été renseignée (ex: https://xxx.mychariow.shop/prd_abc ou .../slug),
    // on extrait uniquement le slug ou l'identifiant final.
    if (productId.startsWith("http://") || productId.startsWith("https://")) {
      try {
        const parsedUrl = new URL(productId);
        const segments = parsedUrl.pathname.split("/").filter(Boolean);
        if (segments.length > 0) {
          productId = segments[segments.length - 1];
        }
      } catch {
        // Garder productId tel quel
      }
    }

    // Formatage du téléphone si disponible, sinon valeur par défaut pour la Côte d'Ivoire (+225)
    const phoneInput = input.metadata.phone || "0000000000";
    const countryCode = input.metadata.country_code || "CI";

    const payload: Record<string, unknown> = {
      product_id: productId,
      email: input.customer.email,
      first_name: input.customer.firstName || "Client",
      last_name: input.customer.lastName || "CaisseOps",
      phone: {
        number: phoneInput.replace(/\D/g, "") || "0102030405",
        country_code: countryCode,
      },
      redirect_url: input.returnUrl,
      payment_currency: input.currency || "XOF",
      custom_metadata: input.metadata,
    };

    if (input.metadata.customer_ip) {
      payload.customer_ip = input.metadata.customer_ip;
    }

    const response = await fetch(`${apiUrl()}/checkout`, {
      method: "POST",
      headers: this.headers(),
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    const body = await readJson(response);

    if (!response.ok) {
      throw new PaymentProviderError(
        describeError(body) ?? `Chariow a refusé la création (${response.status}).`,
        response.status,
      );
    }

    const data = (body as {
      data?: {
        step?: string;
        payment?: { checkout_url?: string; transaction_id?: string };
        purchase?: { id?: string };
      };
    })?.data;

    const checkoutUrl = data?.payment?.checkout_url;
    // Chariow retourne à la fois transaction_id et purchase.id (saleId).
    // purchase.id est l'identifiant principal utilisé pour GET /v1/sales/{id}
    // et transmis dans les webhooks pulses (`sale.id`).
    const saleId = data?.purchase?.id;
    const transactionId = saleId || data?.payment?.transaction_id;

    if (!checkoutUrl || !transactionId) {
      throw new PaymentProviderError(
        "Réponse Chariow incomplète : identifiant de transaction ou URL de paiement absent.",
      );
    }

    return { transactionId, checkoutUrl };
  }

  async verifyPayment(transactionId: string): Promise<VerifiedPayment> {
    const response = await fetch(
      `${apiUrl()}/sales/${encodeURIComponent(transactionId)}`,
      { method: "GET", headers: this.headers(), cache: "no-store" },
    );

    const body = await readJson(response);

    if (!response.ok) {
      throw new PaymentProviderError(
        describeError(body) ?? `Vérification Chariow échouée (${response.status}).`,
        response.status,
      );
    }

    const data = (body as {
      data?: {
        id?: string;
        status?: string;
        amount?: { value?: number; currency?: string };
        payment?: { status?: string; transaction_id?: string };
        custom_metadata?: Record<string, unknown>;
        custom_fields_values?: Record<string, unknown>;
      };
    })?.data;

    if (!data) {
      throw new PaymentProviderError("Réponse de vérification Chariow vide.");
    }

    const saleStatus = String(data.status ?? "unknown");
    const paymentStatus = String(data.payment?.status ?? "");

    // Une vente est payée si le statut de la vente est 'completed' ou le paiement est 'success'
    const isPaid = saleStatus === "completed" || paymentStatus === "success";

    const amount = Number(data.amount?.value ?? 0);
    const currency = String(data.amount?.currency ?? "XOF");
    const metadata = data.custom_metadata ?? data.custom_fields_values ?? {};

    return {
      paid: isPaid,
      status: saleStatus,
      amount,
      currency,
      metadata,
    };
  }

  /**
   * Compare la signature reçue (en-tête x-chariow-signature) à celle calculée via HMAC-SHA256.
   * Format Chariow : "sha256=<hex_digest>"
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    const secret = process.env.CHARIOW_WEBHOOK_SECRET?.trim();
    if (!secret || !signature) return false;

    // Normalisation : Chariow envoie "sha256=<hex>"
    const cleanSignature = signature.trim();
    const signatureHex = cleanSignature.startsWith("sha256=")
      ? cleanSignature.slice(7)
      : cleanSignature;

    const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");

    const received = Buffer.from(signatureHex, "utf8");
    const computed = Buffer.from(expectedHex, "utf8");

    if (received.length !== computed.length) return false;
    return timingSafeEqual(received, computed);
  }

  extractTransactionId(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const body = payload as {
      sale?: { id?: unknown };
      data?: { id?: unknown; purchase?: { id?: unknown } };
    };

    const saleId = body.sale?.id || body.data?.purchase?.id || body.data?.id;
    return typeof saleId === "string" && saleId.length > 0 ? saleId : null;
  }

  extractEventType(payload: unknown): string {
    if (typeof payload !== "object" || payload === null) return "unknown";
    const body = payload as { event?: unknown; type?: unknown };
    const event = body.event || body.type;
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

function describeError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { message?: unknown; errors?: unknown[] };
  if (typeof b.message === "string" && b.message.length > 0) return b.message;
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    return b.errors.map(String).join(", ");
  }
  return null;
}
