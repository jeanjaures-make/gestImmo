"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Users, Wallet, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/buildings", label: "Immeubles", icon: Building2 },
  { href: "/tenants", label: "Locataires", icon: Users },
  { href: "/payments", label: "Loyers", icon: Wallet },
  { href: "/maintenance", label: "Travaux", icon: Wrench },
];

/**
 * Navigation basse du back-office, mobile uniquement.
 *
 * Le propriétaire consulte son parc depuis son téléphone : la barre
 * latérale, pertinente sur desktop, y devient inatteignable au pouce. Les
 * écrans plus rares (Dépenses, Documents, Audit, Équipe) restent
 * accessibles depuis la barre latérale à partir de `md`.
 */
export function StaffNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard" ? pathname === href : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.5]")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
