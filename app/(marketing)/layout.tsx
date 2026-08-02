import Link from "next/link";
import { Building2, Mail } from "lucide-react";

import { MarketingHeader } from "@/components/marketing/header";
import { Container } from "@/components/marketing/ui";

const FOOTER = [
  {
    title: "Produit",
    links: [
      { href: "#fonctionnalites", label: "Fonctionnalités" },
      { href: "#demonstration", label: "Démonstration" },
      { href: "#securite", label: "Sécurité" },
      { href: "#tarifs", label: "Tarifs" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { href: "#faq", label: "Questions fréquentes" },
      { href: "/setup", label: "Diagnostic technique" },
      { href: "mailto:contact@immoops.fr", label: "Nous contacter" },
    ],
  },
  {
    title: "Légal",
    links: [
      { href: "/mentions-legales", label: "Mentions légales" },
      { href: "/confidentialite", label: "Confidentialité" },
      { href: "/cgu", label: "CGU" },
    ],
  },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `marketing` porte la palette de la vitrine, distincte de celle de
    // l'application (voir globals.css).
    <div className="marketing flex min-h-screen flex-col">
      {/* Premier élément focusable : la navigation au clavier ne doit pas
          imposer de traverser tout l'en-tête pour atteindre le contenu. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-[var(--m-deep)] focus:px-4 focus:py-3 focus:text-white"
      >
        Aller au contenu
      </a>

      <MarketingHeader />

      <main id="contenu" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-[var(--m-line)] bg-[var(--m-subtle)] py-14">
        <Container>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--m-deep)] text-white dark:text-[#101419]">
                  <Building2 className="size-4" />
                </span>
                <span className="font-heading text-base font-semibold">
                  ImmoOps
                </span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--m-ink-soft)]">
                La plateforme de pilotage immobilier des propriétaires,
                gestionnaires et family offices.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href="mailto:contact@immoops.fr"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] px-3 text-sm text-[var(--m-ink-soft)] transition-colors hover:text-[var(--m-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]"
                >
                  <Mail className="size-4" />
                  contact@immoops.fr
                </a>
                {[
                  { href: "https://www.linkedin.com", label: "LinkedIn" },
                  { href: "https://github.com", label: "GitHub" },
                ].map(({ href, label }) => (
                  <a
                    key={label}
                    href={href}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex min-h-11 items-center rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] px-3 text-sm text-[var(--m-ink-soft)] transition-colors hover:text-[var(--m-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {FOOTER.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-sm font-semibold">{column.title}</h2>
                <ul className="mt-4 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="flex min-h-10 items-center text-sm text-[var(--m-ink-soft)] transition-colors hover:text-[var(--m-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-[var(--m-line)] pt-6 text-sm text-[var(--m-ink-soft)] sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} ImmoOps. Tous droits réservés.</p>
            <p>Hébergement et données en Europe.</p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
