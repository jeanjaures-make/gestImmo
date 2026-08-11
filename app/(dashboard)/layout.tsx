import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

import { GlobalSearch } from "@/components/global-search";
import { Sidebar } from "@/components/sidebar";
import { StaffNav } from "@/components/staff-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, StatusBadge } from "@/components/ui/kit";
import { requireSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/subscriptions";
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

  // Le journal d'audit n'entre dans la navigation que si l'offre le
  // comprend. Sans abonnement actif, on s'aligne sur l'entrée de gamme :
  // l'écran resterait de toute façon sans intérêt, plus rien ne pouvant
  // être émis. `getActiveSubscription` est mémoïsée pour le rendu, les
  // pages qui la rappellent ne paient pas une seconde requête.
  //
  // `=== false` (et non `!`) pour compatibilité ascendante : si la colonne
  // `has_audit_log` n'existe pas encore en base, la RPC renvoie `undefined`,
  // et l'ancien comportement (lien visible) est préservé.
  const subscription = await getActiveSubscription(organization.id);
  const hasAuditLog = subscription?.has_audit_log !== false;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="print:hidden">
        <Sidebar
          organizationName={organization.name}
          logoUrl={organization.logo_url}
          role={profile.role}
          hasAuditLog={hasAuditLog}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1.5 border-b px-4 py-2.5 md:gap-3 md:px-6 md:py-3 print:hidden">
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
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 print:p-0 print:pb-0">{children}</main>
      </div>

      <div className="print:hidden">
        <StaffNav />
      </div>
    </div>
  );
}
