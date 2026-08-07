import { CURRENCY } from "@/lib/money";

/**
 * Identité publique du site.
 *
 * L'URL canonique vient de l'environnement : en préproduction, une URL
 * codée en dur ferait pointer les balises `canonical` et Open Graph vers
 * la production, et un moteur indexerait la mauvaise adresse.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` est fournie automatiquement par Vercel ;
 * `NEXT_PUBLIC_SITE_URL` la remplace si l'on sert un domaine personnalisé.
 */
function resolveSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE = {
  name: "CaisseOps",
  url: resolveSiteUrl(),
  tagline: "Vos reçus, bons de caisse et bons de sortie, à votre en-tête",
  description:
    "Émettez vos reçus, bons de caisse et bons de sortie depuis un seul espace sécurisé. Chaque entreprise imprime les siens, sous son logo et ses coordonnées, avec une numérotation continue.",
  locale: "fr_FR",
  contact: "contact@caisseops.com",
} as const;

/**
 * Données structurées.
 *
 * Deux entités distinctes : l'éditeur et le logiciel. Les fondre en une
 * seule laisse un moteur choisir à notre place ce que le site décrit.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    email: SITE.contact,
    areaServed: "FR",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SITE.contact,
      availableLanguage: ["fr"],
    },
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE.url,
    description: SITE.description,
    inLanguage: "fr",
    // Les trois offres publiques, aux prix exactement affichés sur la page.
    offers: [
      { name: "Starter", price: "3000" },
      { name: "Business", price: "6000" },
      { name: "Illimité", price: "10000" },
    ].map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: offer.price,
      priceCurrency: CURRENCY,
      url: `${SITE.url}/#tarifs`,
    })),
  };
}

/**
 * Questions fréquentes, au format structuré.
 *
 * Le contenu doit rester identique à celui de la page : une donnée
 * structurée qui promet une réponse absente de l'écran est une pratique
 * sanctionnée, et surtout une promesse non tenue au visiteur.
 */
export function faqJsonLd(entries: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
