"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  PackageOpen,
  Receipt,
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
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/receipts", label: "Reçus", icon: Receipt },
  { href: "/cash-vouchers", label: "Bons de caisse", icon: Wallet },
  { href: "/delivery-notes", label: "Bons de sortie", icon: PackageOpen },
  {
    href: "/audit",
    label: "Journal d'audit",
    icon: ScrollText,
    roles: ["owner", "manager"],
  },
  { href: "/team", label: "Équipe", icon: UserCog, roles: ["owner"] },
  { href: "/settings", label: "Réglages", icon: Settings },
];

export function Sidebar({
  organizationName,
  logoUrl,
  role,
}: {
  organizationName: string;
  logoUrl: string | null;
  role: UserRole;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.roles || item.roles.includes(role));

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
