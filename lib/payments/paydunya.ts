import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  PaymentProviderError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type VerifiedPayment,
} from "./provider";

const SANDBOX_API_URL = "https://app.paydunya.com/sandbox-api/v1";
const LIVE_API_URL = "https://app.paydunya.com/api/v1";

/** URL publique à déclarer chez PayDunya pour les notifications IPN. */
export function payDunyaIpnUrl(origin: string): string {
  return process.env.PAYDUNYA_IPN_URL?.trim() || `${origin}/api/webhooks/paydunya`;
}

type PayDunyaResponse = {
  response_code?: unknown;
  response_text?: unknown;
  token?: unknown;
  hash?: unknown;
  status?: unknown;
  mode?: unknown;
  invoice?: { total_amount?: unknown };
  custom_data?: Record<string, unknown>;
};

/** Intégration PayDunya PAR (paiement avec redirection). */
export class PayDunyaPaymentProvider implements PaymentProvider {
  readonly name = "paydunya";

  isConfigured(): boolean {
    return Boolean(
      process.env.PAYDUNYA_MASTER_KEY?.trim() &&
        process.env.PAYDUNYA_PRIVATE_KEY?.trim() &&
        process.env.PAYDUNYA_TOKEN?.trim(),
    );
  }

  private config() {
    const masterKey = process.env.PAYDUNYA_MASTER_KEY?.trim();
    const privateKey = process.env.PAYDUNYA_PRIVATE_KEY?.trim();
    const token = process.env.PAYDUNYA_TOKEN?.trim();
    if (!masterKey || !privateKey || !token) {
      throw new PaymentProviderError(
        "PayDunya n'est pas configuré : renseignez ses trois clés API.",
      );
    }
    return { masterKey, privateKey, token };
  }

  private apiUrl() {
    return (process.env.PAYDUNYA_MODE?.trim().toLowerCase() === "live"
      ? LIVE_API_URL
      : SANDBOX_API_URL);
  }

  private headers(): HeadersInit {
    const { masterKey, privateKey, token } = this.config();
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "PAYDUNYA-MASTER-KEY": masterKey,
      "PAYDUNYA-PRIVATE-KEY": privateKey,
      "PAYDUNYA-TOKEN": token,
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const customerName = `${input.customer.firstName} ${input.customer.lastName}`.trim();
    const response = await fetch(`${this.apiUrl()}/checkout-invoice/create`, {
      method: "POST",
      headers: this.headers(),
      cache: "no-store",
      body: JSON.stringify({
        invoice: {
          items: {
            subscription: {
              name: input.description,
              quantity: 1,
              unit_price: input.amount,
              total_price: input.amount,
              description: input.description,
            },
          },
          customer: { name: customerName || "Client", email: input.customer.email },
          total_amount: input.amount,
          description: input.description,
        },
        store: {
          name: process.env.PAYDUNYA_STORE_NAME?.trim() || "CaisseOps",
          website_url: process.env.PAYDUNYA_STORE_WEBSITE_URL?.trim() || undefined,
        },
        custom_data: input.metadata,
        actions: {
          return_url: input.returnUrl,
          cancel_url: input.returnUrl.replace(/\/success(?:\?.*)?$/, "/cancel"),
          callback_url: payDunyaIpnUrl(new URL(input.returnUrl).origin),
        },
      }),
    });
    const data = await readJson(response);
    if (!response.ok || data?.response_code !== "00") {
      throw new PaymentProviderError(
        responseText(data) || `PayDunya a refusé la création (${response.status}).`,
        response.status,
      );
    }
    if (typeof data.token !== "string" || typeof data.response_text !== "string") {
      throw new PaymentProviderError("Réponse PayDunya incomplète : token ou URL de paiement absent.");
    }
    return { transactionId: data.token, checkoutUrl: data.response_text };
  }

  async verifyPayment(transactionId: string): Promise<VerifiedPayment> {
    const response = await fetch(
      `${this.apiUrl()}/checkout-invoice/confirm/${encodeURIComponent(transactionId)}`,
      { headers: this.headers(), cache: "no-store" },
    );
    const data = await readJson(response);
    if (!response.ok || data?.response_code !== "00") {
      throw new PaymentProviderError(
        responseText(data) || `Vérification PayDunya échouée (${response.status}).`,
        response.status,
      );
    }
    return {
      paid: String(data.status).toLowerCase() === "completed",
      status: String(data.status ?? "unknown").toLowerCase(),
      amount: Number(data.invoice?.total_amount ?? 0),
      currency: "XOF",
      metadata: data.custom_data ?? {},
      environment: typeof data.mode === "string" ? data.mode : undefined,
    };
  }

  verifyWebhookSignature(_rawBody: string, signature: string | null): boolean {
    const masterKey = process.env.PAYDUNYA_MASTER_KEY?.trim();
    if (!masterKey || !signature) return false;
    const expected = createHash("sha512").update(masterKey).digest("hex");
    const received = Buffer.from(signature.trim(), "utf8");
    const computed = Buffer.from(expected, "utf8");
    return received.length === computed.length && timingSafeEqual(received, computed);
  }

  extractTransactionId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const data = (payload as { data?: { token?: unknown } }).data;
    return typeof data?.token === "string" ? data.token : null;
  }

  extractEventType(payload: unknown): string {
    if (!payload || typeof payload !== "object") return "unknown";
    const status = (payload as { data?: { status?: unknown } }).data?.status;
    return typeof status === "string" ? status.toLowerCase() : "unknown";
  }
}

async function readJson(response: Response): Promise<PayDunyaResponse> {
  try { return await response.json() as PayDunyaResponse; } catch { return {}; }
}

function responseText(data: PayDunyaResponse): string | null {
  return typeof data.response_text === "string" ? data.response_text : null;
}
