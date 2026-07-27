import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * Cloche avec pastille de non-lus.
 *
 * Composant serveur : le compte arrive déjà calculé, aucun JavaScript
 * n'est expédié pour afficher un chiffre. La zone tactile fait 44 px de
 * côté, seuil en deçà duquel une cible devient difficile à viser au pouce.
 */
export function NotificationBell({
  href,
  count,
}: {
  href: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-label={
        count > 0
          ? `Notifications, ${count} non lue(s)`
          : "Notifications"
      }
      className="relative flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground active:bg-muted"
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
