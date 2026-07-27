"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BellOff,
  CheckCheck,
  FileText,
  Wallet,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardContent } from "@/components/ui/kit";
import { markNotificationsRead } from "@/app/notification-actions";
import { cn } from "@/lib/utils";
import type { NotificationKind } from "@/lib/types";

/** L'horodatage arrive déjà formaté par le serveur : voir `formatRelative`. */
export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  when: string;
};

const ICONS: Record<NotificationKind, LucideIcon> = {
  incident_declared: Wrench,
  incident_updated: Wrench,
  payment_recorded: Wallet,
  payment_declared: Wallet,
  payment_declaration_reviewed: Wallet,
  lease_created: FileText,
};

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = items.filter((item) => !item.read).length;

  function open(item: NotificationItem) {
    // Navigation d'abord : l'utilisateur a demandé un écran, il ne doit pas
    // attendre l'écriture du « lu » pour l'obtenir.
    if (item.href) router.push(item.href);
    if (item.read) return;

    const formData = new FormData();
    formData.set("id", item.id);
    startTransition(async () => {
      await markNotificationsRead({}, formData);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsRead({}, new FormData());
      if (result.ok) {
        toast.success("Tout est marqué comme lu.");
        router.refresh();
      } else {
        toast.error(result.error ?? "L'opération a échoué.");
      }
    });
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <BellOff className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Aucune notification pour l&apos;instant.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={pending} onClick={markAll}>
            <CheckCheck className="size-3.5" />
            Tout marquer comme lu ({unread})
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = ICONS[item.kind];

          return (
            <Card
              key={item.id}
              className={cn(
                "gap-0 py-0",
                !item.read && "border-primary/40 bg-primary/[0.04]",
              )}
            >
              {/* Toute la carte est cliquable : sur téléphone, viser un lien
                  de deux mots au pouce est une épreuve. */}
              <button
                type="button"
                onClick={() => open(item)}
                className="w-full cursor-pointer text-left active:bg-muted"
              >
                <CardContent className="flex min-h-16 items-start gap-3 p-4">
                  <span
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                      item.read
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/12 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        item.read ? "font-medium" : "font-semibold",
                      )}
                    >
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.when}
                    </p>
                  </div>

                  {!item.read && (
                    <span
                      aria-label="Non lue"
                      className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </CardContent>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
