"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PackageOpen, ReceiptText, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/receipts", label: "Reçus", icon: ReceiptText },
  { href: "/cash-vouchers", label: "Caisse", icon: Wallet },
  { href: "/delivery-notes", label: "Sorties", icon: PackageOpen },
];

/**
 * Navigation basse du back-office, mobile uniquement.
 *
 * Le caissier émet ses pièces depuis son téléphone, au comptoir : la barre
 * latérale, pertinente sur desktop, y devient inatteignable au pouce. Les
 * écrans plus rares (Journal d'audit, Équipe, Réglages) restent accessibles
 * depuis la barre latérale à partir de `md`.
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
