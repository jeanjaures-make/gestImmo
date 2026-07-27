import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
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
  title: "ImmoOps — Pilotage immobilier",
  description:
    "Plateforme privée de pilotage immobilier : immeubles, baux, loyers, dépenses et interventions.",
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
        <Providers>
          {children}
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
