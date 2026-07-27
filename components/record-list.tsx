import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/kit";
import { cn } from "@/lib/utils";

/**
 * Une liste d'enregistrements, déclarée une fois, rendue deux fois.
 *
 * Sur téléphone : une carte par enregistrement. Sur desktop : un tableau.
 * Ce ne sont pas deux mises en page du même composant, ce sont deux formes
 * distinctes — un tableau de sept colonnes sur un écran de 390 px se lit en
 * le balayant latéralement, ce qui n'est pas lire.
 *
 * Les deux rendus dérivent de la MÊME déclaration de champs : rien ne peut
 * diverger entre le mobile et le desktop, et un champ ajouté apparaît des
 * deux côtés sans y penser.
 */
export type RecordField<T> = {
  label: string;
  value: (item: T) => ReactNode;
  /**
   * Place du champ dans la carte mobile :
   * - `title`    — en tête, en gras (un seul par enregistrement) ;
   * - `subtitle` — sous le titre, en gris ;
   * - `badge`    — aligné à droite du titre (statut) ;
   * - `hidden`   — présent dans le tableau, absent de la carte ;
   * - absent     — ligne de la grille de données, sous le titre.
   */
  role?: "title" | "subtitle" | "badge" | "hidden";
  /** Aligne à droite dans le tableau et coupe les retours à la ligne. */
  numeric?: boolean;
  /** Largeur de colonne du tableau (`w-40`, etc.). */
  className?: string;
};

export function RecordList<T>({
  items,
  keyOf,
  fields,
  actions,
  detail,
  empty,
  caption,
}: {
  items: T[];
  keyOf: (item: T) => string;
  fields: RecordField<T>[];
  /** Menu ou boutons de ligne. Rendu en haut à droite de la carte. */
  actions?: (item: T) => ReactNode;
  /**
   * Contenu occupant toute la largeur, sous la grille de données — pour ce
   * qui ne survivrait pas à une demi-colonne tronquée : un diff, un
   * paragraphe, une pièce jointe.
   */
  detail?: { label: string; value: (item: T) => ReactNode; className?: string };
  empty: ReactNode;
  /** Décrit la liste aux lecteurs d'écran. */
  caption: string;
}) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;

  const title = fields.find((f) => f.role === "title");
  const subtitle = fields.find((f) => f.role === "subtitle");
  const badge = fields.find((f) => f.role === "badge");
  const details = fields.filter((f) => !f.role);

  return (
    <>
      {/* ---------------------------------------------------- Téléphone */}
      <ul aria-label={caption} className="flex flex-col gap-2 md:hidden">
        {items.map((item) => (
          <li key={keyOf(item)}>
            <Card className="gap-0 py-0">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {title && (
                      <p className="truncate font-medium">
                        {title.value(item)}
                      </p>
                    )}
                    {subtitle && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {subtitle.value(item)}
                      </p>
                    )}
                  </div>
                  {badge && <div className="shrink-0">{badge.value(item)}</div>}
                </div>

                {details.length > 0 && (
                  // Deux colonnes : les libellés restent lisibles et le bloc
                  // ne pousse pas la carte suivante hors de l'écran.
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {details.map((field) => (
                      <div key={field.label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">
                          {field.label}
                        </dt>
                        <dd className="truncate font-medium">
                          {field.value(item)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {detail && (
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {detail.label}
                    </p>
                    {detail.value(item)}
                  </div>
                )}

                {/* En pied plutôt qu'en tête : le pouce y arrive sans que la
                    main se déplace, et un groupe d'actions large (sélecteur
                    de rôle, bouton « Clôturer ») ne comprime plus le titre
                    jusqu'à le rendre illisible. */}
                {actions && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                    {actions(item)}
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* ------------------------------------------------------ Desktop */}
      <Card className="hidden py-0 md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              {fields.map((field) => (
                <TableHead
                  key={field.label}
                  className={cn(field.numeric && "text-right", field.className)}
                >
                  {field.label}
                </TableHead>
              ))}
              {detail && (
                <TableHead className={detail.className}>
                  {detail.label}
                </TableHead>
              )}
              {actions && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={keyOf(item)}>
                {fields.map((field) => (
                  <TableCell
                    key={field.label}
                    className={cn(
                      field.numeric && "text-right whitespace-nowrap",
                      field.role === "title" && "font-medium",
                      field.role === "subtitle" && "text-muted-foreground",
                    )}
                  >
                    {field.value(item)}
                  </TableCell>
                ))}
                {detail && (
                  <TableCell className={detail.className}>
                    {detail.value(item)}
                  </TableCell>
                )}
                {actions && (
                  <TableCell className="text-right">{actions(item)}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
