import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { Sidebar } from "@/components/sidebar";
import { StaffNav } from "@/components/staff-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, StatusBadge } from "@/components/ui/kit";
import { requireSession } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ROLE_LABELS } from "@/lib/types";

/**
 * Aucun écran du back-office n'est prérendable : tous dépendent de la
 * session, donc des cookies de la requête. Le déclarer explicitement évite
 * que le build tente un rendu statique — tentative qui, sur un
 * environnement où les variables Supabase manquent, faisait échouer la
 * compilation entière au lieu de dégrader vers `/setup`.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Jamais d'erreur 500 : sans configuration, on oriente vers le diagnostic.
  if (!isSupabaseConfigured()) redirect("/setup");

  // Redirige vers /login ou /onboarding selon l'état du compte.
  const { profile, organization, email } = await requireSession();
  const unread = await getUnreadCount();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        organizationName={organization.name}
        logoUrl={organization.logo_url}
        role={profile.role}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-6 py-3">
          <GlobalSearch />
          <div className="flex-1" />
          {/* Le rôle s'efface sur mobile au profit des réglages : c'est une
              information, l'autre est un geste. Il reste lisible sur /settings. */}
          <span className="hidden sm:inline-flex">
            <StatusBadge tone="info">{ROLE_LABELS[profile.role]}</StatusBadge>
          </span>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            {email}
          </span>
          <NotificationBell href="/notifications" count={unread} />
          <Button variant="ghost" size="icon" render={<Link href="/settings" />}>
            <Settings className="size-4" />
            <span className="sr-only">Réglages</span>
          </Button>
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button variant="outline" type="submit">
              <LogOut className="size-4" />
              <span className="sr-only sm:not-sr-only">Déconnexion</span>
            </Button>
          </form>
        </header>

        {/* pb-24 : dégage la hauteur de la barre basse mobile. */}
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>

      <StaffNav />
    </div>
  );
}
