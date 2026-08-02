"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Menu, X } from "lucide-react";

import { PrimaryLink, SecondaryLink } from "@/components/marketing/ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#securite", label: "Sécurité" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "Questions" },
];

/**
 * En-tête collant.
 *
 * Le seul état client est l'ouverture du menu mobile et le passage en mode
 * « défilé » — une bordure qui apparaît une fois la page descendue, pour
 * détacher l'en-tête du contenu sans l'alourdir dès le premier écran.
 */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    // `passive` : le gestionnaire n'annule jamais l'événement, le dire au
    // navigateur lui évite d'attendre avant de défiler.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Le menu ouvert fige la page derrière lui : sans cela, le défilement
  // continue sous le panneau et l'on perd sa position.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-[var(--m-line)] bg-[var(--m-page)]/85 backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--m-deep)]"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--m-deep)] text-white dark:text-[#101419]">
            <Building2 className="size-4" />
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">
            ImmoOps
          </span>
        </Link>

        <nav aria-label="Sections" className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm text-[var(--m-ink-soft)] transition-colors hover:text-[var(--m-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <SecondaryLink href="/login" className="min-h-10 px-4">
            Se connecter
          </SecondaryLink>
          <PrimaryLink href="/signup" className="min-h-10 px-4">
            Commencer
          </PrimaryLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          className="ml-auto flex size-11 items-center justify-center rounded-lg border border-[var(--m-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)] md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div
          id="menu-mobile"
          className="border-t border-[var(--m-line)] bg-[var(--m-page)] md:hidden"
        >
          <nav aria-label="Sections" className="flex flex-col p-4">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-lg px-2 text-base text-[var(--m-ink)]"
              >
                {label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <SecondaryLink href="/login" onClick={() => setOpen(false)}>
                Se connecter
              </SecondaryLink>
              <PrimaryLink href="/signup" onClick={() => setOpen(false)}>
                Commencer gratuitement
              </PrimaryLink>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
