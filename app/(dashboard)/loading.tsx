import {
  ListSkeleton,
  PageHeaderSkeleton,
  StatsSkeleton,
} from "@/components/skeletons";

/**
 * Squelette de la vue d'ensemble.
 *
 * Placé à la racine du groupe, il sert aussi de repli à tout segment qui
 * n'aurait pas le sien : mieux vaut un squelette approximatif qu'un écran
 * figé sur la page précédente.
 */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Chargement en cours…
      </span>
      <PageHeaderSkeleton />
      <StatsSkeleton />
      <div className="mt-5">
        <ListSkeleton rows={3} />
      </div>
    </div>
  );
}
