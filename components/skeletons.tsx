import { Card, CardContent, Skeleton } from "@/components/ui/kit";

/**
 * Squelettes de chargement.
 *
 * Sans eux, Next.js garde l'écran précédent à l'affichage pendant que la
 * page suivante interroge Supabase : sur un réseau mobile, l'utilisateur
 * appuie, rien ne bouge, et il appuie de nouveau. Le squelette rend la
 * navigation immédiate même quand la donnée ne l'est pas.
 *
 * Les dimensions imitent la vraie mise en page — un squelette qui ne
 * ressemble pas au contenu final produit un saut visuel à l'arrivée des
 * données, ce qui est pire que pas de squelette du tout.
 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="gap-0 py-0">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div aria-hidden className="mb-6">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="gap-0 py-0">
          <CardContent className="p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-7 w-24" />
            <Skeleton className="mt-1.5 h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Squelette de page de liste, annoncé aux lecteurs d'écran.
 *
 * `aria-busy` sur le conteneur et `sr-only` sur le texte : l'utilisateur
 * non-voyant apprend que la page charge, au lieu de rencontrer une région
 * vide dont rien n'explique le silence.
 */
export function ListPageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Chargement en cours…
      </span>
      <PageHeaderSkeleton />
      <ListSkeleton rows={rows} />
    </div>
  );
}
