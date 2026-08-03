import { describe, expect, it } from "vitest";

import { buildEnvelope, eventId, parseDsn } from "@/lib/sentry-envelope";

describe("parseDsn", () => {
  it("décompose un DSN Sentry", () => {
    const dsn = parseDsn("https://abc123@o42.ingest.sentry.io/7654321");

    expect(dsn).not.toBeNull();
    expect(dsn!.publicKey).toBe("abc123");
    expect(dsn!.host).toBe("o42.ingest.sentry.io");
    expect(dsn!.projectId).toBe("7654321");
    expect(dsn!.envelopeUrl).toBe(
      "https://o42.ingest.sentry.io/api/7654321/envelope/?sentry_key=abc123&sentry_version=7",
    );
  });

  // Une variable absente est le cas NORMAL, pas une anomalie : c'est l'état
  // de tout déploiement qui n'a pas encore raccordé de collecteur.
  it.each([
    ["absente", undefined],
    ["vide", ""],
    ["illisible", "pas-une-url"],
    ["sans clé publique", "https://o42.ingest.sentry.io/7654321"],
    ["sans projet", "https://abc123@o42.ingest.sentry.io"],
  ])("rend null si la valeur est %s", (_cas, valeur) => {
    expect(parseDsn(valeur as string | undefined)).toBeNull();
  });
});

describe("buildEnvelope", () => {
  const base = {
    eventId: "0123456789abcdef0123456789abcdef",
    reference: "AB12CD34",
    scope: "portal-access",
    message: "Boom",
    environment: "production",
  };

  function lignes(envelope: string) {
    const [header, itemHeader, payload] = envelope.split("\n");
    return {
      header: JSON.parse(header),
      itemHeader: JSON.parse(itemHeader),
      payload: JSON.parse(payload),
    };
  }

  it("produit les trois lignes attendues par Sentry", () => {
    const { header, itemHeader, payload } = lignes(buildEnvelope(base));

    expect(header.event_id).toBe(base.eventId);
    expect(itemHeader).toEqual({ type: "event" });
    expect(payload.event_id).toBe(base.eventId);
    expect(payload.level).toBe("error");
    expect(payload.environment).toBe("production");
  });

  it("porte la référence remise à l'utilisateur, pour relier les deux", () => {
    const { payload } = lignes(buildEnvelope(base));
    expect(payload.tags.reference).toBe("AB12CD34");
  });

  it("décrit l'erreur comme une exception, pour le regroupement", () => {
    const { payload } = lignes(buildEnvelope(base));
    expect(payload.exception.values[0].value).toBe("Boom");
    expect(payload.exception.values[0].type).toBe("portal-access");
  });

  /**
   * Le point qui compte : un outil de diagnostic ne doit pas devenir un
   * second fichier de données personnelles. Seuls des identifiants
   * circulent, jamais un nom ni une adresse.
   */
  it("ne transmet que des identifiants, jamais de donnée nominative", () => {
    const { payload } = lignes(
      buildEnvelope({
        ...base,
        organizationId: "org-1",
        userId: "user-1",
      }),
    );

    expect(payload.user).toEqual({ id: "user-1" });
    expect(payload.tags.organization).toBe("org-1");
    expect(JSON.stringify(payload)).not.toMatch(/@|firstname|lastname|email/i);
  });

  it("omet l'utilisateur quand il n'est pas connu", () => {
    const { payload } = lignes(buildEnvelope(base));
    expect(payload.user).toBeUndefined();
  });

  it("convertit la pile, de la trame la plus ancienne à la plus récente", () => {
    const stack = [
      "Error: Boom",
      "    at grantAccess (/app/lib/portal.ts:42:11)",
      "    at handler (/app/route.ts:7:3)",
    ].join("\n");

    const { payload } = lignes(buildEnvelope({ ...base, stack }));
    const frames = payload.exception.values[0].stacktrace.frames;

    expect(frames).toHaveLength(2);
    // Sentry attend l'appelant en premier.
    expect(frames[0].function).toBe("handler");
    expect(frames[1]).toMatchObject({
      function: "grantAccess",
      filename: "/app/lib/portal.ts",
      lineno: 42,
      colno: 11,
    });
  });

  it("ajoute la version déployée quand elle est connue", () => {
    const { payload } = lignes(buildEnvelope({ ...base, release: "abc1234" }));
    expect(payload.release).toBe("abc1234");
  });
});

describe("eventId", () => {
  it("rend 32 caractères hexadécimaux, sans tiret", () => {
    expect(eventId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("ne se répète pas", () => {
    expect(eventId()).not.toBe(eventId());
  });
});
