import { ListSkeleton } from "@/components/skeletons";
import { Card, CardContent, Skeleton } from "@/components/ui/kit";

/** Squelette de l'accueil locataire : la carte du loyer, puis le reste. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        Chargement en cours…
      </span>

      <Card className="gap-0 py-0">
        <CardContent className="p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-10 w-44" />
          <Skeleton className="mt-3 h-4 w-28" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <ListSkeleton rows={3} />
    </div>
  );
}
