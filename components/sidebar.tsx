"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  DoorOpen,
  FileText,
  FolderClosed,
  LayoutDashboard,
  Receipt,
  ScrollText,
  UserCog,
  Users,
  Wallet,
  Wrench,
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
  { href: "/buildings", label: "Immeubles", icon: Building2 },
  { href: "/apartments", label: "Logements", icon: DoorOpen },
  { href: "/tenants", label: "Locataires", icon: Users },
  { href: "/leases", label: "Baux", icon: FileText },
  { href: "/payments", label: "Paiements", icon: Wallet },
  { href: "/expenses", label: "Dépenses", icon: Receipt },
  { href: "/maintenance", label: "Interventions", icon: Wrench },
  { href: "/documents", label: "Documents", icon: FolderClosed },
  { href: "/notifications", label: "Notifications", icon: Bell },
  {
    href: "/audit",
    label: "Journal d'audit",
    icon: ScrollText,
    roles: ["owner", "manager"],
  },
  { href: "/team", label: "Équipe", icon: UserCog, roles: ["owner"] },
];

export function Sidebar({
  organizationName,
  role,
}: {
  organizationName: string;
  role: UserRole;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.roles || item.roles.includes(role));

  return (
    // Masquée sur mobile : la navigation y passe par la barre basse.
    <nav className="hidden bg-sidebar md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:overflow-y-auto md:border-r md:p-4">
      <div className="mb-4 flex items-center gap-2.5 px-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="font-heading block truncate text-sm font-semibold">
            {organizationName}
          </span>
          <span className="block text-xs text-muted-foreground">ImmoOps</span>
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
