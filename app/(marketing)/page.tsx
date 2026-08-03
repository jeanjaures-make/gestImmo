import type { Metadata } from "next";
import {
  Bell,
  Building2,
  ChevronDown,
  DoorOpen,
  FileLock2,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import { Hero } from "@/components/marketing/hero";
import {
  DashboardMockup,
  OwnerPhoneScreen,
  PhoneFrame,
  TenantPhoneScreen,
} from "@/components/marketing/mockups";
import { Testimonials } from "@/components/marketing/testimonials";
import {
  Panel,
  PrimaryLink,
  Reveal,
  SecondaryLink,
  Section,
  SectionHeading,
} from "@/components/marketing/ui";
import { faqJsonLd } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ImmoOps — Gérez votre patrimoine immobilier avec simplicité",
  description:
    "Immeubles, locataires, loyers, interventions et documents dans un seul espace sécurisé. Portail locataire inclus, pensé d'abord pour le téléphone.",
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: Building2,
    title: "Gestion des immeubles",
    body: "Immeubles, logements, surfaces et valeur estimée. Le rendement se calcule tout seul.",
  },
  {
    icon: Wallet,
    title: "Gestion des loyers",
    body: "Échéances générées à la création du bail, encaissements suivis, impayés visibles sans chercher.",
  },
  {
    icon: FileLock2,
    title: "Documents sécurisés",
    body: "Baux et pièces justificatives dans un espace privé. Téléchargement par lien signé, valable une minute.",
  },
  {
    icon: Wrench,
    title: "Interventions",
    body: "Le locataire déclare, vous suivez. Chaque changement de statut le prévient automatiquement.",
  },
  {
    icon: LayoutDashboard,
    title: "Tableau de bord",
    body: "Revenus, encaissé, impayés, occupation. Les quatre chiffres décisifs sans faire défiler.",
  },
  {
    icon: Users,
    title: "Portail locataire",
    body: "Bail, quittances, documents et déclaration de règlement. Son espace, et rien d'autre.",
  },
];

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "Multi-tenant sécurisé",
    body: "Chaque organisation est isolée par les politiques de PostgreSQL, pas par une condition dans le code.",
  },
  {
    icon: ScrollText,
    title: "Audit complet",
    body: "Qui a fait quoi, quand, depuis quelle adresse. Écrit par la base : l'application ne peut pas l'éviter.",
  },
  {
    icon: Bell,
    title: "Notifications",
    body: "Bail disponible, loyer encaissé, incident mis à jour. Émises par la base, jamais oubliées.",
  },
  {
    icon: Smartphone,
    title: "Mobile first",
    body: "Barre de navigation basse, cartes plutôt que tableaux, cibles tactiles généreuses.",
  },
  {
    icon: Gauge,
    title: "Performance",
    body: "Rendu serveur, pagination en base, aucune liste tronquée en silence.",
  },
  {
    icon: Sparkles,
    title: "Simplicité",
    body: "Un parcours par métier. Rien à paramétrer avant de créer son premier immeuble.",
  },
];

const SECURITY = [
  {
    icon: ShieldCheck,
    title: "Données cloisonnées",
    body: "Deux barrières indépendantes : les politiques de sécurité au niveau ligne, et des clés étrangères composites qui rendent un rattachement entre organisations impossible pour PostgreSQL lui-même.",
  },
  {
    icon: FileLock2,
    title: "Documents privés",
    body: "Aucun fichier n'est servi directement. Chaque téléchargement passe par une URL signée à durée de vie courte, et le locataire n'atteint que les pièces de ses propres baux.",
  },
  {
    icon: KeyRound,
    title: "Rôles et permissions",
    body: "Propriétaire, gestionnaire, comptable, lecture seule. Un compte locataire est structurellement distinct du personnel : les deux périmètres ne se recoupent jamais.",
  },
  {
    icon: ScrollText,
    title: "Journal d'audit",
    body: "Chaque création, modification et suppression est journalisée par un déclencheur en base, avec l'avant, l'après et les colonnes réellement modifiées.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "3 000 F CFA",
    unit: "/ mois",
    pitch: "Pour un premier parc géré sérieusement.",
    features: [
      "Jusqu'à 10 logements",
      "Portail locataire inclus",
      "Quittances et documents",
      "Un utilisateur",
    ],
    cta: "Commencer gratuitement",
    href: "/signup",
  },
  {
    name: "Business",
    price: "6 000 F CFA",
    unit: "/ mois",
    pitch: "Pour les cabinets et les parcs qui grandissent.",
    features: [
      "Jusqu'à 100 logements",
      "Rôles et permissions",
      "Journal d'audit complet",
      "Cinq utilisateurs",
    ],
    cta: "Commencer gratuitement",
    href: "/signup",
  },
  {
    name: "Illimité",
    price: "10 000 F CFA",
    unit: "/ mois",
    // Annoncé comme offre de lancement, sans prix de référence barré :
    // afficher une remise par rapport à un tarif jamais pratiqué est une
    // annonce trompeuse, et sanctionnée comme telle.
    badge: "Offre de lancement",
    pitch: "Parc et équipe sans limite, pour les family offices et sociétés de gestion.",
    features: [
      "Logements illimités",
      "Utilisateurs illimités",
      "Journal d'audit complet",
      "Accompagnement à la reprise de données",
    ],
    cta: "Profiter de l'offre",
    href: "/signup",
    featured: true,
  },
];

const FAQ = [
  {
    q: "Mes données sont-elles isolées de celles des autres clients ?",
    a: "Oui, et pas seulement par convention. L'isolation repose sur les politiques de sécurité au niveau ligne de PostgreSQL et sur des clés étrangères composites : rattacher une donnée d'une organisation à une autre est rejeté par la base, pas par une vérification applicative qu'un défaut pourrait contourner. Cette étanchéité est éprouvée automatiquement à chaque déploiement.",
  },
  {
    q: "Le locataire peut-il voir les données des autres locataires ?",
    a: "Non. Un compte locataire est structurellement distinct d'un compte du personnel : il n'atteint que ses baux, ses échéances, ses documents et ses incidents. Il ne peut pas non plus modifier ses propres échéances — déclarer un règlement et l'encaisser sont deux actes séparés.",
  },
  {
    q: "Peut-on payer son loyer en ligne ?",
    a: "Pas encore. Le locataire déclare un règlement effectué par ailleurs — virement, chèque, espèces — avec le montant, la date et la référence. Le gestionnaire le valide, et c'est cette validation seule qui enregistre l'encaissement. Le raccordement d'un prestataire de paiement s'insérera au même endroit.",
  },
  {
    q: "Que se passe-t-il si je dépasse mon offre ?",
    a: "Rien de brutal : aucune donnée n'est supprimée ni masquée. Nous vous prévenons et vous laissons choisir votre offre suivante.",
  },
  {
    q: "Puis-je exporter mes données ?",
    a: "Vos données restent les vôtres. Elles sont stockées dans une base PostgreSQL standard, exportables sans format propriétaire. Une organisation peut être entièrement supprimée sur demande.",
  },
  {
    q: "L'application fonctionne-t-elle bien sur téléphone ?",
    a: "C'est l'écran de référence, pas une adaptation. Les espaces propriétaire et locataire sont conçus pour une utilisation à une main : navigation en bas d'écran, cartes plutôt que tableaux à défilement horizontal, et cibles tactiles d'au moins 44 pixels.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Les questions structurées sont exactement celles affichées plus
          bas : annoncer aux moteurs une réponse absente de l'écran est
          sanctionné, et surtout malhonnête envers le visiteur. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />

      <Hero />

      {/* ------------------------------------------------- Confiance */}
      <Section tone="subtle" className="py-14 sm:py-16">
        <p className="text-center text-sm font-medium text-[var(--m-ink-soft)]">
          Ils nous font confiance
        </p>
        <ul className="mt-8 grid grid-cols-2 items-center gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {[
            "Vallier Patrimoine",
            "Groupe Tilleuls",
            "Résidences Nord",
            "Cabinet Rivage",
            "Foncière Lumen",
          ].map((name) => (
            <li
              key={name}
              className="flex h-14 items-center justify-center rounded-xl border border-dashed border-[var(--m-line)] px-3 text-center text-xs font-medium text-[var(--m-ink-soft)]"
            >
              {name}
            </li>
          ))}
        </ul>
        {/* Dire que ces noms sont fictifs plutôt que de laisser croire à
            des références acquises. */}
        <p className="mt-6 text-center text-xs text-[var(--m-ink-soft)]">
          Emplacements réservés — noms fictifs en attente des premières
          références publiables.
        </p>
      </Section>

      {/* ------------------------------------------- Fonctionnalités */}
      <Section id="fonctionnalites">
        <SectionHeading
          eyebrow="Fonctionnalités"
          title="Tout ce qu'un parc réclame, au même endroit"
          lead="Six domaines, un seul espace. Pas de module à activer, pas de paramétrage préalable."
        />

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Reveal as="li" key={title}>
              <Panel interactive className="h-full p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--m-sage)]/12 text-[var(--m-sage-text)]">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-heading mt-5 text-lg font-semibold">
                  {title}
                </h3>
                <p className="mt-2 leading-relaxed text-[var(--m-ink-soft)]">
                  {body}
                </p>
              </Panel>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------- Démonstration */}
      <Section id="demonstration" tone="subtle">
        <SectionHeading
          eyebrow="Démonstration"
          title="Trois espaces, trois métiers"
          lead="Le propriétaire pilote, le gestionnaire exécute, le locataire se sert. Chacun voit ce qui le concerne, et rien de plus."
        />

        <Reveal className="mt-12">
          <DashboardMockup />
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Propriétaire",
              body: "Revenus, occupation, rendement, alertes. La vue d'ensemble sans le détail.",
            },
            {
              title: "Gestionnaire",
              body: "Baux, échéances, interventions, documents. Les écrans du quotidien.",
            },
            {
              title: "Locataire",
              body: "Bail, prochain loyer, quittances, incidents. Un espace, pas un back-office.",
            },
          ].map(({ title, body }) => (
            <Reveal key={title}>
              <Panel className="h-full p-5">
                <h3 className="font-heading font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--m-ink-soft)]">
                  {body}
                </p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------- Pourquoi ImmoOps */}
      <Section>
        <SectionHeading
          eyebrow="Pourquoi ImmoOps"
          title="Des garanties, pas des promesses"
          lead="Les règles qui comptent sont appliquées par la base de données. Aucun chemin applicatif ne peut les contourner — pas même une erreur de notre part."
        />

        <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <Reveal as="li" key={title}>
              <div className="flex gap-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--m-line)] text-[var(--m-deep)]">
                  <Icon className="size-4" />
                </span>
                <div>
                  <h3 className="font-heading font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--m-ink-soft)]">
                    {body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* ------------------------------------------------- Sécurité */}
      <Section id="securite" tone="subtle">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* Collant à partir de `lg` : la colonne de gauche est bien plus
              courte que la liste de droite et laissait, sans cela, un vide
              de plusieurs centaines de pixels au défilement. */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading
              eyebrow="Sécurité"
              title="Conçu pour des données que l'on ne perd pas"
              lead="Vos locataires vous confient des pièces d'identité, des relevés, des contrats. Le niveau d'exigence n'est pas négociable."
            />
            <div className="mt-8">
              <SecondaryLink href="/setup">
                Voir le diagnostic technique
              </SecondaryLink>
            </div>
          </div>

          <ul className="space-y-4">
            {SECURITY.map(({ icon: Icon, title, body }) => (
              <Reveal as="li" key={title}>
                <Panel className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--m-deep)]/10 text-[var(--m-deep)]">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="font-heading font-semibold">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--m-ink-soft)]">
                    {body}
                  </p>
                </Panel>
              </Reveal>
            ))}
          </ul>
        </div>
      </Section>

      {/* --------------------------------------------------- Mobile */}
      <Section>
        <SectionHeading
          align="center"
          eyebrow="Mobile"
          title="Le téléphone est l'écran de référence"
          lead="Propriétaires et locataires se connectent depuis leur poche. L'interface n'est pas un bureau réduit : elle est pensée pour une main."
        />

        <Reveal className="mt-14 flex flex-wrap items-start justify-center gap-10 sm:gap-16">
          <PhoneFrame label="Espace propriétaire">
            <OwnerPhoneScreen />
          </PhoneFrame>
          <PhoneFrame label="Portail locataire">
            <TenantPhoneScreen />
          </PhoneFrame>
        </Reveal>

        <ul className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { icon: DoorOpen, label: "Navigation en bas d'écran" },
            { icon: FileText, label: "Cartes plutôt que tableaux" },
            { icon: Gauge, label: "Cibles tactiles de 44 px" },
          ].map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl border border-[var(--m-line)] bg-[var(--m-surface)] p-4 text-sm"
            >
              <Icon className="size-4 shrink-0 text-[var(--m-sage-text)]" />
              {label}
            </li>
          ))}
        </ul>
      </Section>

      {/* ----------------------------------------------- Témoignages */}
      <Section tone="subtle">
        <SectionHeading
          eyebrow="Témoignages"
          title="Ce que change un espace unique"
        />
        <Testimonials />
        <p className="mt-6 text-xs text-[var(--m-ink-soft)]">
          Témoignages illustratifs, en attente des premiers retours clients
          publiables. Aucune citation n&apos;est attribuée à une personne ou
          une société réelle.
        </p>
      </Section>

      {/* ---------------------------------------------------- Tarifs */}
      <Section id="tarifs">
        <SectionHeading
          align="center"
          eyebrow="Tarifs"
          title="Une offre lisible, sans engagement"
          lead="Tous les plans incluent le portail locataire, les quittances et l'hébergement sécurisé. Sans engagement, résiliable à tout moment."
        />

        <ul className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <Reveal as="li" key={plan.name} className="h-full">
              <Panel
                className={cn(
                  "flex h-full flex-col p-7",
                  plan.featured &&
                    "border-[var(--m-deep)] shadow-[0_1px_2px_rgba(31,41,55,0.04),0_18px_40px_-24px_rgba(53,92,125,0.45)]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg font-semibold">
                    {plan.name}
                  </h3>
                  {"badge" in plan && plan.badge && (
                    <span className="rounded-full bg-[var(--m-sage)]/15 px-2.5 py-1 text-xs font-medium text-[var(--m-sage-text)]">
                      {plan.badge}
                    </span>
                  )}
                </div>

                <p className="mt-4">
                  <span className="font-heading text-3xl font-semibold">
                    {plan.price}
                  </span>
                  {plan.unit && (
                    <span className="text-sm text-[var(--m-ink-soft)]">
                      {" "}
                      {plan.unit}
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm text-[var(--m-ink-soft)]">
                  {plan.pitch}
                </p>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--m-sage)]"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-7">
                  {plan.featured ? (
                    <PrimaryLink href={plan.href} className="w-full">
                      {plan.cta}
                    </PrimaryLink>
                  ) : (
                    <SecondaryLink href={plan.href} className="w-full">
                      {plan.cta}
                    </SecondaryLink>
                  )}
                </div>
              </Panel>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* ------------------------------------------------------- FAQ */}
      <Section id="faq" tone="subtle">
        <SectionHeading
          eyebrow="Questions fréquentes"
          title="Ce qu'on nous demande avant de signer"
        />

        {/* `<details>` natif : l'accordéon fonctionne au clavier, à la
            souris et sans JavaScript, et reste ouvrable par la recherche
            du navigateur. */}
        <div className="mt-10 divide-y divide-[var(--m-line)] border-y border-[var(--m-line)]">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]">
                <span className="text-pretty">{q}</span>
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-[var(--m-ink-soft)] transition-transform duration-300 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="pb-6 leading-relaxed text-[var(--m-ink-soft)] text-pretty">
                {a}
              </p>
            </details>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------- Appel à l'action */}
      <Section>
        <Reveal>
          <div className="rounded-3xl border border-[var(--m-line)] bg-[var(--m-surface)] px-6 py-14 text-center sm:px-14">
            <h2 className="font-heading mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Reprenez la main sur votre parc, dès aujourd&apos;hui
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--m-ink-soft)] text-pretty">
              Créez votre organisation en deux minutes. Aucune carte bancaire
              n&apos;est demandée, et vos données restent exportables à tout
              moment.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryLink href="/signup">Créer un compte</PrimaryLink>
              <SecondaryLink href="mailto:contact@immoops.fr?subject=Démonstration%20ImmoOps">
                Réserver une démonstration
              </SecondaryLink>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
