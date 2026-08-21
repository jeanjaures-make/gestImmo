import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ChariowPaymentProvider } from "@/lib/payments/chariow";
import { PaymentProviderError } from "@/lib/payments/provider";

describe("ChariowPaymentProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CHARIOW_API_KEY = "sk_test_123456";
    process.env.CHARIOW_WEBHOOK_SECRET = "whsec_test_secret_789";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("isConfigured retourne true quand CHARIOW_API_KEY est présente", () => {
    const provider = new ChariowPaymentProvider();
    expect(provider.isConfigured()).toBe(true);
  });

  it("isConfigured retourne false quand CHARIOW_API_KEY est absente", () => {
    delete process.env.CHARIOW_API_KEY;
    const provider = new ChariowPaymentProvider();
    expect(provider.isConfigured()).toBe(false);
  });

  it("createPayment envoie une requête POST vers /v1/checkout avec les bons paramètres", async () => {
    const provider = new ChariowPaymentProvider();

    const mockResponse = {
      data: {
        step: "payment",
        payment: {
          checkout_url: "https://checkout.chariow.com/pay/sal_123",
          transaction_id: "trx_456",
        },
        purchase: {
          id: "sal_123",
        },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    global.fetch = fetchMock;

    const result = await provider.createPayment({
      amount: 6000,
      currency: "XOF",
      description: "Abonnement Business — CaisseOps",
      customer: {
        email: "awa@example.com",
        firstName: "Awa",
        lastName: "Diallo",
      },
      returnUrl: "https://caisseops.com/payment/success?ref=REF123",
      metadata: {
        payment_ref: "REF123",
        plan_slug: "business",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.chariow.com/v1/checkout");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer sk_test_123456",
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    const body = JSON.parse(options.body);
    expect(body.email).toBe("awa@example.com");
    expect(body.first_name).toBe("Awa");
    expect(body.last_name).toBe("Diallo");
    expect(body.redirect_url).toBe("https://caisseops.com/payment/success?ref=REF123");
    expect(body.payment_currency).toBe("XOF");
    expect(body.custom_metadata).toEqual({
      payment_ref: "REF123",
      plan_slug: "business",
    });

    expect(result.transactionId).toBe("sal_123");
    expect(result.checkoutUrl).toBe("https://checkout.chariow.com/pay/sal_123");
  });

  it("createPayment lève PaymentProviderError si l'API retourne une erreur", async () => {
    const provider = new ChariowPaymentProvider();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Product not found" }),
    });

    await expect(
      provider.createPayment({
        amount: 3000,
        currency: "XOF",
        description: "Test",
        customer: { email: "test@example.com", firstName: "Test", lastName: "User" },
        returnUrl: "https://example.com",
        metadata: {},
      }),
    ).rejects.toThrow(PaymentProviderError);
  });

  it("verifyPayment appelle GET /v1/sales/{saleId} et parse le statut correctement", async () => {
    const provider = new ChariowPaymentProvider();

    const mockSale = {
      data: {
        id: "sal_123",
        status: "completed",
        amount: {
          value: 6000,
          currency: "XOF",
        },
        payment: {
          status: "success",
          transaction_id: "trx_999",
        },
        custom_metadata: {
          payment_ref: "REF123",
        },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSale,
    });
    global.fetch = fetchMock;

    const result = await provider.verifyPayment("sal_123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.chariow.com/v1/sales/sal_123",
      expect.objectContaining({ method: "GET" }),
    );

    expect(result.paid).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.amount).toBe(6000);
    expect(result.currency).toBe("XOF");
    expect(result.metadata).toEqual({ payment_ref: "REF123" });
  });

  it("verifyWebhookSignature valide une signature HMAC-SHA256 Chariow correcte", () => {
    const provider = new ChariowPaymentProvider();
    const rawBody = JSON.stringify({ event: "successful.sale", sale: { id: "sal_123" } });

    // Calcul de la signature avec whsec_test_secret_789
    const crypto = require("node:crypto");
    const hmac = crypto
      .createHmac("sha256", "whsec_test_secret_789")
      .update(rawBody)
      .digest("hex");

    // Format avec sha256=
    const validSignature = `sha256=${hmac}`;
    expect(provider.verifyWebhookSignature(rawBody, validSignature)).toBe(true);

    // Signature incorrecte
    expect(provider.verifyWebhookSignature(rawBody, "sha256=invalid_hex_string")).toBe(false);

    // Signature nulle
    expect(provider.verifyWebhookSignature(rawBody, null)).toBe(false);
  });

  it("extractTransactionId extrait l'identifiant sale.id ou purchase.id", () => {
    const provider = new ChariowPaymentProvider();

    expect(
      provider.extractTransactionId({
        event: "successful.sale",
        sale: { id: "sal_xyz789abc" },
      }),
    ).toBe("sal_xyz789abc");

    expect(
      provider.extractTransactionId({
        data: { purchase: { id: "sal_from_purchase" } },
      }),
    ).toBe("sal_from_purchase");

    expect(provider.extractTransactionId({})).toBe(null);
    expect(provider.extractTransactionId(null)).toBe(null);
  });

  it("extractEventType extrait le type d'événement", () => {
    const provider = new ChariowPaymentProvider();

    expect(provider.extractEventType({ event: "successful.sale" })).toBe("successful.sale");
    expect(provider.extractEventType({ type: "failed.sale" })).toBe("failed.sale");
    expect(provider.extractEventType({})).toBe("unknown");
  });
});
