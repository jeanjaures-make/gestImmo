"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Building2,
  CreditCard,
  Home,
  KeyRound,
  LayoutDashboard,
  PackageOpen,
  ReceiptText,
  Users,
  ScrollText,
  Settings,
  UserCog,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Rôles autorisés ; absent = tous les membres. */
  roles?: UserRole[];
  /** Visible uniquement si l'abonnement actif ouvre cette capacité. */
  requiresAuditLog?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/receipts", label: "Reçus", icon: ReceiptText },
  { href: "/cash-vouchers", label: "Bons de caisse", icon: Wallet },
  { href: "/delivery-notes", label: "Bons de sortie", icon: PackageOpen },
  // Gestion immobilière. Trois entrées plates plutôt qu'un groupe
  // repliable : la barre n'en connaît pas, et lui en ajouter un
  // toucherait un composant que tous les écrans partagent.
  { href: "/properties", label: "Biens", icon: Home },
  { href: "/tenants", label: "Locataires", icon: Users },
  { href: "/rent-receipts", label: "Quittances", icon: KeyRound },
  {
    href: "/audit",
    label: "Journal d'audit",
    icon: ScrollText,
    roles: ["owner", "manager"],
    // Le journal complet n'est inclus qu'à partir de Business.
    // Starter ne dispose que des documents de base.
    requiresAuditLog: true,
  },
  { href: "/team", label: "Équipe", icon: UserCog, roles: ["owner"] },
  // Le propriétaire seul : c'est lui qui engage la dépense, et lui seul
  // que la base autorise à écrire dans `subscriptions`.
  { href: "/subscribe", label: "Abonnement", icon: CreditCard, roles: ["owner"] },
  { href: "/license", label: "Activer une licence", icon: KeyRound },
  { href: "/settings", label: "Réglages", icon: Settings },
];

export function Sidebar({
  organizationName,
  logoUrl,
  role,
  hasAuditLog,
}: {
  organizationName: string;
  logoUrl: string | null;
  role: UserRole;
  hasAuditLog: boolean;
}) {
  const pathname = usePathname();
  const items = NAV.filter(
    (item) =>
      (!item.roles || item.roles.includes(role)) &&
      (!item.requiresAuditLog || hasAuditLog),
  );

  return (
    // Masquée sur mobile : la navigation y passe par la barre basse.
    <nav className="hidden bg-sidebar md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:overflow-y-auto md:border-r md:p-4">
      <div className="mb-4 flex items-center gap-2.5 px-2">
        {/* Le logo de l'organisation, s'il en a un : c'est ce qui fait
            qu'on se sent chez soi plutôt que dans un outil générique. */}
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt=""
              width={32}
              height={32}
              className="size-full object-contain"
            />
          ) : (
            <Building2 className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="font-heading block truncate text-sm font-semibold">
            {organizationName}
          </span>
          <span className="block text-xs text-muted-foreground">CaisseOps</span>
        </span>
      </div>

      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
