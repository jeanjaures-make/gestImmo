/**
 * Construction d'un événement Sentry, sans le SDK.
 *
 * ─── Pourquoi pas `@sentry/nextjs` ──────────────────────────────────────
 * Le SDK officiel instrumente automatiquement le runtime, ce qui est
 * précieux sur une grosse application. Ici, toutes les erreurs qu'on veut
 * voir passent déjà par un point unique — `reportError` — et le SDK pèse
 * plusieurs centaines de kilo-octets qu'il faudrait installer, construire
 * et maintenir sur chaque déploiement, y compris ceux qui n'ont pas de DSN.
 *
 * L'API d'ingestion de Sentry accepte un POST HTTP ordinaire. On l'écrit
 * donc à la main : aucune dépendance, aucun coût quand la variable est
 * absente, et rien qui puisse casser un build.
 *
 * Ce module est volontairement pur — il ne fait aucun appel réseau — pour
 * être vérifiable par des tests.
 */

export type Dsn = {
  publicKey: string;
  host: string;
  projectId: string;
  /** URL complète du point d'ingestion. */
  envelopeUrl: string;
};

/**
 * Décompose un DSN `https://<clé>@<hôte>/<projet>`.
 *
 * Rend `null` plutôt que de lever : un DSN mal recopié ne doit pas empêcher
 * l'application de démarrer. Le silence est ici préférable au fracas —
 * l'observabilité est un confort, pas une fonction du produit.
 */
export function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");

    if (!publicKey || !projectId || !url.hostname) return null;

    return {
      publicKey,
      host: url.host,
      projectId,
      envelopeUrl:
        `${url.protocol}//${url.host}/api/${projectId}/envelope/` +
        `?sentry_key=${publicKey}&sentry_version=7`,
    };
  } catch {
    return null;
  }
}

export type SentryEvent = {
  eventId: string;
  reference: string;
  scope: string;
  message: string;
  stack?: string;
  organizationId?: string;
  userId?: string;
  extra?: Record<string, string | number | boolean | null>;
  environment: string;
  release?: string;
};

/**
 * Sérialise l'enveloppe attendue par Sentry : trois lignes JSON séparées
 * par des sauts de ligne — en-tête, type d'élément, charge utile.
 */
export function buildEnvelope(event: SentryEvent): string {
  const sentAt = new Date().toISOString();

  const header = { event_id: event.eventId, sent_at: sentAt };
  const itemHeader = { type: "event" };

  const payload = {
    event_id: event.eventId,
    timestamp: sentAt,
    platform: "node",
    level: "error",
    logger: event.scope,
    environment: event.environment,
    ...(event.release ? { release: event.release } : {}),
    // `exception` plutôt que `message` : Sentry groupe alors les
    // occurrences par pile d'appels plutôt que par texte, ce qui évite
    // autant d'incidents distincts que de variantes de formulation.
    exception: {
      values: [
        {
          type: event.scope,
          value: event.message,
          ...(event.stack
            ? { stacktrace: { frames: parseStack(event.stack) } }
            : {}),
        },
      ],
    },
    tags: {
      reference: event.reference,
      scope: event.scope,
      ...(event.organizationId ? { organization: event.organizationId } : {}),
    },
    // L'utilisateur n'est désigné que par son identifiant : ni nom, ni
    // adresse. Un outil de diagnostic n'a pas à devenir un second fichier
    // de données personnelles.
    ...(event.userId ? { user: { id: event.userId } } : {}),
    extra: event.extra ?? {},
  };

  return [header, itemHeader, payload]
    .map((part) => JSON.stringify(part))
    .join("\n");
}

/**
 * Convertit une pile Node en trames Sentry.
 *
 * Sentry attend les trames de la plus ancienne à la plus récente, soit
 * l'inverse de l'ordre où Node les écrit.
 */
function parseStack(stack: string) {
  const frames = stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .map((line) => {
      const match = line.match(/^at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?$/);
      if (!match) return { function: line.slice(3) };
      return {
        function: match[1] ?? "?",
        filename: match[2],
        lineno: Number(match[3]),
        colno: Number(match[4]),
      };
    });

  return frames.reverse();
}

/** Identifiant d'événement : 32 caractères hexadécimaux, sans tiret. */
export function eventId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
