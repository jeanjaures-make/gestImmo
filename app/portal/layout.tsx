import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { NotificationBell } from "@/components/notification-bell";
import { PortalNav } from "@/components/portal-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const { organization, profile } = await requireTenantSession();
  const unread = await getUnreadCount();
  const firstName = profile.firstname || "Bonjour";

  return (
    // Mobile d'abord : une colonne unique, centrée et bornée sur grand
    // écran plutôt qu'étirée — le portail reste une interface de téléphone.
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{firstName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {organization.name}
          </p>
        </div>
        <NotificationBell href="/portal/notifications" count={unread} />
        <ThemeToggle />
        <form action="/auth/signout" method="post">
          <Button
            variant="ghost"
            size="icon"
            type="submit"
            aria-label="Se déconnecter"
          >
            <LogOut className="size-4" />
          </Button>
        </form>
      </header>

      {/* pb-20 : réserve la hauteur de la barre basse fixée. */}
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>

      <PortalNav />
    </div>
  );
}
