import "server-only";

/**
 * Signalement des erreurs.
 *
 * Aujourd'hui, quand un client rencontre un défaut, personne ne l'apprend
 * sauf s'il le raconte — et sans contexte. Ce module pose le point de
 * passage unique par lequel une erreur sera transmise, et fonctionne dès
 * maintenant sans aucun service tiers : il journalise sur la sortie
 * serveur, que Vercel conserve.
 *
 * Le raccordement à Sentry (ou équivalent) se fait en renseignant
 * `SENTRY_DSN` et en installant `@sentry/nextjs` — voir LIVRAISON.md.
 * Tant que la variable est absente, l'application se comporte normalement :
 * aucune dépendance à charger, aucun appel réseau, aucun échec possible.
 * Une observabilité qui casse la production qu'elle observe serait un
 * mauvais marché.
 */

export type ErrorContext = {
  /** Où l'erreur s'est produite : « portal-access », « review-declaration ». */
  scope: string;
  /** Identifiant d'organisation ou d'utilisateur — jamais de donnée nominative. */
  organizationId?: string;
  userId?: string;
  /** Compléments non sensibles utiles au diagnostic. */
  extra?: Record<string, string | number | boolean | null>;
};

export function isErrorReportingConfigured() {
  return Boolean(process.env.SENTRY_DSN);
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

    // Point d'insertion du service tiers. Volontairement laissé en
    // commentaire plutôt qu'en import conditionnel : un `import()`
    // dynamique vers un paquet absent échouerait au build.
    //
    //   if (isErrorReportingConfigured()) {
    //     Sentry.captureException(error, { tags: { reference: ref, ...context } });
    //   }
  } catch {
    // Le signalement a échoué. Il n'y a rien de plus à tenter ici, et
    // certainement pas à lever.
  }

  return ref;
}
