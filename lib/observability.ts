import "server-only";

import {
  buildEnvelope,
  eventId,
  parseDsn,
  type Dsn,
} from "@/lib/sentry-envelope";

/**
 * Signalement des erreurs.
 *
 * Quand un client rencontre un défaut, personne ne l'apprend sauf s'il le
 * raconte — et sans contexte. Ce module pose le point de passage unique par
 * lequel toute erreur est transmise. Il journalise toujours sur la sortie
 * serveur, que Vercel conserve, et transmet en plus à Sentry dès que
 * `SENTRY_DSN` est renseignée.
 *
 * Tant que la variable est absente, rien ne change : aucune dépendance
 * chargée, aucun appel réseau, aucun échec possible. Une observabilité qui
 * casse la production qu'elle observe serait un mauvais marché — c'est
 * aussi pourquoi l'envoi ne bloque jamais et n'est jamais attendu.
 */

export type ErrorContext = {
  /** Où l'erreur s'est produite : « invite-member », « export-csv ». */
  scope: string;
  /** Identifiant d'organisation ou d'utilisateur — jamais de donnée nominative. */
  organizationId?: string;
  userId?: string;
  /** Compléments non sensibles utiles au diagnostic. */
  extra?: Record<string, string | number | boolean | null>;
};

/** Décodé une seule fois : le DSN ne change pas en cours d'exécution. */
let dsnCache: Dsn | null | undefined;

function dsn(): Dsn | null {
  if (dsnCache === undefined) dsnCache = parseDsn(process.env.SENTRY_DSN);
  return dsnCache;
}

export function isErrorReportingConfigured() {
  return dsn() !== null;
}

/**
 * Transmet l'événement, sans jamais faire attendre l'appelant.
 *
 * Aucun `await` en amont : une Server Action ne doit pas rendre sa réponse
 * plus tard parce qu'un collecteur est lent. Le délai de garde évite qu'une
 * requête pendante retienne la fonction serverless au-delà du raisonnable.
 */
function send(payload: string, target: Dsn) {
  const abort = AbortSignal.timeout(2000);

  void fetch(target.envelopeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body: payload,
    signal: abort,
    // L'envoi est accessoire : il ne doit rien retenir du cache Next.
    cache: "no-store",
  }).catch(() => {
    // Collecteur injoignable. Le journal serveur, lui, a déjà tout reçu :
    // il n'y a donc rien de perdu et rien à retenter.
  });
}

/**
 * Identifiant court remis à l'utilisateur et écrit dans le journal.
 *
 * Sans lui, « une erreur est survenue » ne relie rien : le client ne peut
 * pas désigner son incident, et le support ne peut pas le retrouver.
 */
function reference() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/**
 * Signale une erreur et renvoie sa référence.
 *
 * Ne lève jamais : un défaut du signalement ne doit pas se substituer au
 * défaut signalé, ni l'aggraver.
 */
export function reportError(error: unknown, context: ErrorContext): string {
  const ref = reference();

  try {
    const message =
      error instanceof Error ? error.message : String(error ?? "inconnue");
    const stack = error instanceof Error ? error.stack : undefined;

    // Journal structuré : lisible tel quel, et exploitable par un
    // collecteur si l'on en branche un.
    console.error(
      JSON.stringify({
        level: "error",
        reference: ref,
        scope: context.scope,
        message,
        organizationId: context.organizationId,
        userId: context.userId,
        ...context.extra,
        stack,
      }),
    );

    const target = dsn();
    if (target) {
      send(
        buildEnvelope({
          eventId: eventId(),
          reference: ref,
          scope: context.scope,
          message,
          stack,
          organizationId: context.organizationId,
          userId: context.userId,
          extra: context.extra,
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
          release: process.env.VERCEL_GIT_COMMIT_SHA,
        }),
        target,
      );
    }
  } catch {
    // Le signalement a échoué. Il n'y a rien de plus à tenter ici, et
    // certainement pas à lever.
  }

  return ref;
}
