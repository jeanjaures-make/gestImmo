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
  name: "ImmoOps",
  url: resolveSiteUrl(),
  tagline: "Gérez votre patrimoine immobilier avec simplicité",
  description:
    "Immeubles, locataires, loyers, interventions et documents dans un seul espace sécurisé. Portail locataire inclus, pensé d'abord pour le téléphone.",
  locale: "fr_FR",
  contact: "contact@immoops.fr",
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
    // Deux offres publiques ; « Enterprise » est sur devis, donc absente :
    // annoncer un prix qu'on ne pratique pas serait trompeur.
    offers: [
      {
        "@type": "Offer",
        name: "Starter",
        price: "19",
        priceCurrency: "EUR",
        url: `${SITE.url}/#tarifs`,
      },
      {
        "@type": "Offer",
        name: "Business",
        price: "59",
        priceCurrency: "EUR",
        url: `${SITE.url}/#tarifs`,
      },
    ],
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
