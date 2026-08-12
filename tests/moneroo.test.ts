import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MonerooPaymentProvider } from "@/lib/payments/moneroo";
import { generatePaymentReference } from "@/lib/payments";

/**
 * Ce que ces tests prouvent, et ce qu'ils ne prouvent pas.
 *
 * Ils couvrent tout ce qui se décide chez nous : l'authentification d'une
 * notification, la lecture d'un événement, la forme de la requête envoyée
 * et la lecture de la réponse. Le serveur distant est remplacé par un
 * `fetch` contrôlé — ce qui permet de vérifier que l'on envoie EXACTEMENT
 * ce que documente Moneroo, sans dépendre du réseau ni d'une clé réelle.
 *
 * Ils ne prouvent pas que Moneroo accepte cette requête : cela ne se
 * vérifie qu'en effectuant une vraie transaction de test, procédure
 * décrite dans `docs/moneroo.md`.
 */
const SECRET = "sk_test_exemple_de_cle_pour_les_tests";
const WEBHOOK_SECRET = "whsec_exemple_pour_les_tests";

const provider = new MonerooPaymentProvider();

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.MONEROO_SECRET_KEY = SECRET;
  process.env.MONEROO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  delete process.env.MONEROO_API_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.MONEROO_SECRET_KEY;
  delete process.env.MONEROO_WEBHOOK_SECRET;
});

/** Remplace `fetch` et retient l'appel, pour l'inspecter ensuite. */
function captureFetch(response: { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

describe("isConfigured", () => {
  it("est faux sans clé secrète", () => {
    delete process.env.MONEROO_SECRET_KEY;
    expect(provider.isConfigured()).toBe(false);
  });

  it("est vrai dès que la clé est posée", () => {
    expect(provider.isConfigured()).toBe(true);
  });
});

describe("createPayment", () => {
  const input = {
    amount: 6000,
    currency: "XOF",
    description: "Abonnement Business — CaisseOps",
    customer: { email: "awa@example.com", firstName: "Awa", lastName: "Diallo" },
    returnUrl: "https://caisseops.test/payment/success?ref=COP-1",
    metadata: { payment_ref: "COP-1", organization_id: "org-1", plan_id: "plan-1" },
  };

  it("appelle l'endpoint documenté, en POST", async () => {
    const calls = captureFetch({
      body: { data: { id: "abc123", checkout_url: "https://checkout.moneroo.io/abc123" } },
    });

    await provider.createPayment(input);

    expect(calls[0].url).toBe("https://api.moneroo.io/v1/payments/initialize");
    expect(calls[0].init.method).toBe("POST");
  });

  it("authentifie par jeton porteur, jamais par le corps", async () => {
    const calls = captureFetch({
      body: { data: { id: "abc123", checkout_url: "https://x" } },
    });

    await provider.createPayment(input);

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(headers.Accept).toBe("application/json");
    // La clé ne doit pas se retrouver dans le corps : elle finirait dans
    // les journaux du fournisseur comme dans les nôtres.
    expect(String(calls[0].init.body)).not.toContain(SECRET);
  });

  it("envoie le client sous la forme attendue, en snake_case", async () => {
    const calls = captureFetch({
      body: { data: { id: "abc123", checkout_url: "https://x" } },
    });

    await provider.createPayment(input);
    const body = JSON.parse(String(calls[0].init.body));

    expect(body.customer).toEqual({
      email: "awa@example.com",
      first_name: "Awa",
      last_name: "Diallo",
    });
    expect(body.amount).toBe(6000);
    expect(body.currency).toBe("XOF");
    expect(body.return_url).toBe(input.returnUrl);
    expect(body.metadata.payment_ref).toBe("COP-1");
  });

  /**
   * Les méthodes de paiement se règlent au tableau de bord Moneroo. Les
   * énumérer dans le code figerait une disponibilité qui change sans nous,
   * et casserait le jour où le compte en active une de plus.
   */
  it("n'impose aucune liste de méthodes de paiement", async () => {
    const calls = captureFetch({
      body: { data: { id: "abc123", checkout_url: "https://x" } },
    });

    await provider.createPayment(input);
    const body = JSON.parse(String(calls[0].init.body));

    expect(body.methods).toBeUndefined();
  });

  it("rend l'identifiant et l'URL de paiement", async () => {
    captureFetch({
      body: {
        message: "Transaction initialized successfully",
        data: { id: "5f7b1b2c", checkout_url: "https://checkout.moneroo.io/5f7b1b2c" },
      },
    });

    const result = await provider.createPayment(input);

    expect(result.transactionId).toBe("5f7b1b2c");
    expect(result.checkoutUrl).toBe("https://checkout.moneroo.io/5f7b1b2c");
  });

  /**
   * Le défaut le plus coûteux de l'intégration précédente : faute d'URL,
   * elle en fabriquait une. Le client atterrissait alors sur une page qui
   * n'encaissait rien, et se croyait pourtant en train de payer.
   */
  it("échoue plutôt que de deviner une URL de paiement absente", async () => {
    captureFetch({ body: { data: { id: "abc123" } } });

    await expect(provider.createPayment(input)).rejects.toThrow(/incomplète/i);
  });

  it("remonte le message d'erreur du fournisseur", async () => {
    captureFetch({ status: 422, body: { message: "The amount must be at least 100." } });

    await expect(provider.createPayment(input)).rejects.toThrow(
      "The amount must be at least 100.",
    );
  });
});

describe("verifyPayment", () => {
  const réponse = (status: string) => ({
    body: {
      data: {
        id: "k4su1ii7abdz",
        status,
        amount: 6000,
        currency: { name: "CFA Franc BCEAO", symbol: "XOF", code: "XOF" },
        metadata: { payment_ref: "COP-1" },
        environment: "sandbox",
      },
    },
  });

  it("interroge l'endpoint de vérification, en GET", async () => {
    const calls = captureFetch(réponse("success"));

    await provider.verifyPayment("k4su1ii7abdz");

    expect(calls[0].url).toBe(
      "https://api.moneroo.io/v1/payments/k4su1ii7abdz/verify",
    );
    expect(calls[0].init.method).toBe("GET");
  });

  it("échappe l'identifiant dans l'URL", async () => {
    const calls = captureFetch(réponse("success"));

    await provider.verifyPayment("a/b?c=d");

    expect(calls[0].url).toContain("/payments/a%2Fb%3Fc%3Dd/verify");
  });

  /** La devise arrive en objet : c'est `code` qui se compare au nôtre. */
  it("extrait le code de devise de l'objet renvoyé", async () => {
    captureFetch(réponse("success"));

    const result = await provider.verifyPayment("k4su1ii7abdz");

    expect(result.currency).toBe("XOF");
    expect(result.amount).toBe(6000);
    expect(result.environment).toBe("sandbox");
    expect(result.metadata.payment_ref).toBe("COP-1");
  });

  it("ne tient pour payé que le statut « success »", async () => {
    for (const [status, attendu] of [
      ["success", true],
      ["pending", false],
      ["failed", false],
      ["unknown", false],
    ] as const) {
      captureFetch(réponse(status));
      const result = await provider.verifyPayment("x");
      expect(result.paid, `statut ${status}`).toBe(attendu);
      expect(result.status).toBe(status);
    }
  });
});

describe("verifyWebhookSignature", () => {
  const corps = JSON.stringify({ event: "payment.success", data: { id: "abc" } });
  const signe = (body: string, secret = WEBHOOK_SECRET) =>
    createHmac("sha256", secret).update(body).digest("hex");

  it("accepte une signature calculée avec le bon secret", () => {
    expect(provider.verifyWebhookSignature(corps, signe(corps))).toBe(true);
  });

  it("refuse une signature calculée avec un autre secret", () => {
    expect(provider.verifyWebhookSignature(corps, signe(corps, "autre"))).toBe(false);
  });

  it("refuse si le corps a été modifié après signature", () => {
    const signature = signe(corps);
    const altéré = JSON.stringify({ event: "payment.success", data: { id: "xyz" } });
    expect(provider.verifyWebhookSignature(altéré, signature)).toBe(false);
  });

  it("refuse une signature absente", () => {
    expect(provider.verifyWebhookSignature(corps, null)).toBe(false);
  });

  it("refuse une signature de longueur différente sans lever", () => {
    expect(provider.verifyWebhookSignature(corps, "trop-court")).toBe(false);
  });

  /**
   * Le point qui compte : sans secret, on REFUSE. Accepter faute de
   * pouvoir vérifier transformerait l'oubli d'une variable en activation
   * gratuite des abonnements pour quiconque connaît l'URL.
   */
  it("refuse tout quand le secret n'est pas configuré", () => {
    delete process.env.MONEROO_WEBHOOK_SECRET;
    expect(provider.verifyWebhookSignature(corps, signe(corps))).toBe(false);
  });
});

describe("lecture d'une notification", () => {
  it("extrait l'identifiant de transaction", () => {
    const payload = { event: "payment.success", data: { id: "123456" } };
    expect(provider.extractTransactionId(payload)).toBe("123456");
  });

  it("rend null quand l'identifiant manque ou n'est pas une chaîne", () => {
    expect(provider.extractTransactionId({ data: {} })).toBeNull();
    expect(provider.extractTransactionId({ data: { id: 42 } })).toBeNull();
    expect(provider.extractTransactionId({})).toBeNull();
    expect(provider.extractTransactionId(null)).toBeNull();
  });

  it("extrait les quatre événements de paiement documentés", () => {
    for (const event of [
      "payment.initiated",
      "payment.success",
      "payment.failed",
      "payment.cancelled",
    ]) {
      expect(provider.extractEventType({ event })).toBe(event);
    }
  });

  it("nomme « unknown » un événement inattendu, sans échouer", () => {
    expect(provider.extractEventType({})).toBe("unknown");
    expect(provider.extractEventType(null)).toBe("unknown");
  });
});

describe("generatePaymentReference", () => {
  it("ne se répète pas", () => {
    const refs = new Set(
      Array.from({ length: 500 }, () => generatePaymentReference()),
    );
    expect(refs.size).toBe(500);
  });

  it("reste lisible dans un journal", () => {
    expect(generatePaymentReference()).toMatch(/^COP-[A-Z0-9]+-[A-Z0-9]+$/);
  });
});
