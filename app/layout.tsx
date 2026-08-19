import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";

import { AuthBounce } from "@/components/auth-bounce";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { organizationJsonLd, SITE, softwareJsonLd } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Police des titres.
 *
 * `font-heading` était employée sur une trentaine de titres sans que
 * `--font-heading` existe : Tailwind ne générait donc pas la classe et
 * toute la hiérarchie typographique restait sans effet.
 *
 * Deux graisses seulement, et non la fonte variable complète : les titres
 * n'utilisent que le semi-gras et le gras, et chaque kilo-octet compte sur
 * un réseau mobile.
 */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    // Les écrans de l'application posent leur propre titre ; ce gabarit
    // leur évite de répéter la marque à chaque fois.
    template: `%s`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  keywords: [
    "reçu à en-tête",
    "bon de caisse",
    "bon de sortie",
    "impression de reçus",
    "numérotation des pièces",
    "livre de caisse",
    "francs CFA",
  ],
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${SITE.name} — ${SITE.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  // Le fond suit le thème : sur mobile, la barre d'adresse s'y accorde au
  // lieu de trancher avec la page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#14181d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      // next-themes écrit la classe de thème sur <html> avant l'hydratation.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* JSON-LD : décrit l'éditeur et le logiciel aux moteurs. Placé
            dans le corps plutôt que dans <head>, ce que la spécification
            autorise et que Next rend plus simple à composer. */}
        <script
          type="application/ld+json"
          // Contenu constant, produit par nous : aucune donnée utilisateur
          // n'y transite, donc aucune injection possible.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationJsonLd(), softwareJsonLd()]),
          }}
        />
        <Providers>
          {/* Dans la racine et non sur le seul accueil : c'est le « Site
              URL » du projet Supabase qui décide où retombe un lien mort,
              et ce réglage vit dans un tableau de bord, hors du dépôt.
              Le composant ne rend rien et ne s'active que sur les
              paramètres propres à Supabase. */}
          <AuthBounce />
          {children}
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
