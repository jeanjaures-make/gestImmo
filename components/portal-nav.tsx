"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, FolderClosed, Home, Wallet, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/portal", label: "Accueil", icon: Home },
  { href: "/portal/lease", label: "Bail", icon: FileText },
  { href: "/portal/payments", label: "Loyers", icon: Wallet },
  { href: "/portal/incidents", label: "Incidents", icon: Wrench },
  { href: "/portal/documents", label: "Docs", icon: FolderClosed },
];

/**
 * Barre de navigation basse.
 *
 * Placée en bas parce que c'est la zone atteignable au pouce sur un
 * téléphone tenu d'une main. `env(safe-area-inset-bottom)` évite que le
 * dernier onglet passe sous la barre d'accueil des iPhone récents.
 */
export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/portal" ? pathname === href : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // min-h-14 : au-delà des 44px recommandés, pouce compris.
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
