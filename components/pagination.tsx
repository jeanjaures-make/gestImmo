"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { pageCount } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * Navigation entre pages, et surtout : compte total explicite.
 *
 * Le libellé « 26–50 sur 134 » est le point important. Une liste qui
 * s'arrête sans rien dire laisse croire qu'il n'y a rien de plus ; c'est
 * exactement ce que faisaient les anciens `.limit(200)`.
 *
 * Composant client parce qu'il doit reconstruire l'URL en préservant les
 * filtres déjà présents (période, entité, recherche). Le faire côté
 * serveur obligerait chaque écran à lui repasser ses propres paramètres,
 * et le premier oubli casserait le filtre silencieusement.
 */
export function Pagination({
  page,
  size,
  total,
  /** Nom de ce qu'on compte, au pluriel : « reçus », « bons de caisse ». */
  unit,
}: {
  page: number;
  size: number;
  total: number;
  unit: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pages = pageCount(total, size);
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(page * size, total);

  function href(target: number) {
    const params = new URLSearchParams(searchParams);
    if (target <= 1) params.delete("page");
    else params.set("page", String(target));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const summary =
    total === 0
      ? `Aucun élément`
      : pages === 1
        ? `${total} ${unit}`
        : `${first}–${last} sur ${total} ${unit}`;

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      {/* `aria-live` : après un changement de page, un lecteur d'écran
          annonce la nouvelle tranche sans qu'il faille la chercher. */}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {summary}
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <PageLink
            href={href(page - 1)}
            disabled={page <= 1}
            label="Page précédente"
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only sm:not-sr-only">Précédent</span>
          </PageLink>

          <span className="px-1 text-sm text-muted-foreground tabular-nums">
            {page} / {pages}
          </span>

          <PageLink
            href={href(page + 1)}
            disabled={page >= pages}
            label="Page suivante"
          >
            <span className="sr-only sm:not-sr-only">Suivant</span>
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      )}
    </nav>
  );
}

/**
 * Un `<span>` remplace le lien aux extrémités : un lien désactivé reste
 * focusable et cliquable, ce qui promet une navigation qui n'arrivera pas.
 */
function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(
    // min-h-11 : au seuil des 44 px, la cible reste atteignable au pouce.
    "inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm font-medium",
    disabled
      ? "cursor-not-allowed opacity-40"
      : "active:bg-muted hover:bg-muted",
  );

  if (disabled) {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
