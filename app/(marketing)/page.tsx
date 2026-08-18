import type { Metadata } from "next";
import {
  Banknote,
  ChevronDown,
  FileLock2,
  FileSpreadsheet,
  FileText,
  Gauge,
  Hash,
  KeyRound,
  PackageMinus,
  Printer,
  ReceiptText,
  ScrollText,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { Hero } from "@/components/marketing/hero";
import {
  DashboardMockup,
  OwnerPhoneScreen,
  PhoneFrame,
  ReceiptPhoneScreen,
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
import { SITE, faqJsonLd } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: ReceiptText,
    title: "Reçus à votre en-tête",
    body: "« Reçu de M./Mme », cadre bon pour francs, montant en toutes lettres, articles, avance et reste. Le reçu est établi au nom de qui l'émet.",
  },
  {
    icon: Banknote,
    title: "Bons de caisse",
    body: "Entrée ou sortie, bénéficiaire, motif, avance et reste. Règlement cash ou dépôt avec référence de bordereau, imputation sur compte personnel ou compte entreprise.",
  },
  {
    icon: PackageMinus,
    title: "Bons de sortie",
    body: "Tableau d'articles — désignation, quantité, destination, observations — émetteur, service et visa du chef de service. Exemplaire chauffeur par défaut.",
  },
  {
    icon: Search,
    title: "Recherche globale",
    body: "Ctrl K, puis un numéro, un nom ou un motif. Les trois carnets répondent d'un coup, sans ouvrir de menu.",
  },
  {
    icon: FileSpreadsheet,
    title: "Exports Excel",
    body: "CSV avec BOM, séparateur point-virgule, décimales à virgule : ils s'ouvrent directement dans Excel francophone, sans retouche.",
  },
  {
    icon: Printer,
    title: "Impression fidèle",
    body: "Les feuilles reproduisent le papier à en-tête — cadre BPF du reçu, tableau encadré du bon de sortie. L'aperçu est identique à l'imprimé.",
  },
];

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "Multi-entreprise cloisonné",
    body: "Chaque organisation est isolée par les politiques de PostgreSQL, pas par une condition dans le code. Cloisonnement vérifié par un script exécutable.",
  },
  {
    icon: ScrollText,
    title: "Audit complet",
    body: "Qui a fait quoi, quand, depuis quelle adresse. Écrit par la base : l'application ne peut pas l'éviter.",
  },
  {
    icon: Hash,
    title: "Numérotation sans trou",
    body: "REC-2026-0001, BC-2026-0001, BS-2026-0001 : continue, par nature et par année, gelée après émission. Une suppression reste visible en cas de contrôle.",
  },
  {
    icon: Smartphone,
    title: "Mobile first",
    body: "Barre de navigation basse, cartes plutôt que tableaux, cibles tactiles généreuses. Pensé pour le comptoir et le téléphone.",
  },
  {
    icon: Gauge,
    title: "Performance",
    body: "Rendu serveur, pagination en base, aucune liste tronquée en silence.",
  },
  {
    icon: Sparkles,
    title: "Simplicité",
    body: "Un formulaire par pièce. Rien à paramétrer avant d'émettre le premier reçu.",
  },
];

const SECURITY = [
  {
    icon: ShieldCheck,
    title: "Données cloisonnées",
    body: "Chaque entreprise ne voit que ses données grâce aux politiques de sécurité au niveau ligne de PostgreSQL. Le cloisonnement est prouvé par un script exécutable qui monte deux organisations et vérifie qu'aucune n'atteint l'autre.",
  },
  {
    icon: FileLock2,
    title: "Comptes protégés",
    body: "Mots de passe de douze caractères minimum, limitation des tentatives, événements de connexion journalisés. Hébergement dans l'Union européenne.",
  },
  {
    icon: KeyRound,
    title: "Rôles et permissions",
    body: "Propriétaire, gestionnaire, caissier, lecture seule. Le caissier émet et corrige mais ne supprime pas ; la suppression d'une pièce est réservée aux propriétaires et gestionnaires.",
  },
  {
    icon: ScrollText,
    title: "Journal d'audit",
    body: "Chaque création, modification et suppression est journalisée par un déclencheur en base, avec l'acteur, l'avant, l'après et l'adresse IP. Consultation réservée aux propriétaires et gestionnaires.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "3 000 F CFA",
    unit: "/ mois",
    pitch: "Pour un comptoir qui veut des pièces propres.",
    features: [
      "Jusqu'à 100 pièces par mois",
      "Reçus, bons de caisse et bons de sortie",
      "Impression à votre en-tête",
      "Un utilisateur",
    ],
    cta: "Choisir Starter",
    href: "/signup?plan=starter",
  },
  {
    name: "Business",
    price: "6 000 F CFA",
    unit: "/ mois",
    pitch: "Pour les magasins et les chantiers qui grandissent.",
    features: [
      "Jusqu'à 1 000 pièces par mois",
      "Rôles et permissions",
      "Journal d'audit complet",
      "Cinq utilisateurs",
    ],
    cta: "Choisir Business",
    href: "/signup?plan=business",
  },
  {
    name: "Illimité",
    price: "10 000 F CFA",
    unit: "/ mois",
    // Annoncé comme offre de lancement, sans prix de référence barré :
    // afficher une remise par rapport à un tarif jamais pratiqué est une
    // annonce trompeuse, et sanctionnée comme telle.
    badge: "Offre de lancement",
    pitch: "Volume et équipe sans limite, pour les groupes et les réseaux de magasins.",
    features: [
      "Pièces illimitées",
      "Utilisateurs illimités",
      "Journal d'audit complet",
      "Accompagnement à la reprise de données",
    ],
    cta: "Profiter de l'offre",
    href: "/signup?plan=unlimited",
    featured: true,
  },
];

const FAQ = [
  {
    q: "Mes données sont-elles isolées de celles des autres entreprises ?",
    a: "Oui, et pas seulement par convention. L'isolation repose sur les politiques de sécurité au niveau ligne de PostgreSQL : atteindre la donnée d'une autre organisation est rejeté par la base, pas par une vérification applicative qu'un défaut pourrait contourner. Ce cloisonnement est prouvé par un script exécutable, qui monte deux organisations et vérifie l'étanchéité.",
  },
  {
    q: "La numérotation peut-elle avoir des trous ?",
    a: "Non par usage normal : la numérotation est continue, par nature de pièce et par année — REC-2026-0001, BC-2026-0001, BS-2026-0001 — attribuée par la base et gelée après émission. Supprimer une pièce est réservé aux propriétaires et gestionnaires, et le trou est assumé : il reste visible en cas de contrôle.",
  },
  {
    q: "Le montant en toutes lettres est-il fiable ?",
    a: "Il est proposé automatiquement à la frappe, en français correct — « deux cent soixante-quinze mille francs CFA ». Vous pouvez le modifier avant d'émettre, puis il est stocké tel quel : c'est cette mention qui fait foi sur la pièce.",
  },
  {
    q: "Mes clients ou mes chauffeurs ont-ils un compte ?",
    a: "Non. CaisseOps est l'outil de votre entreprise, pas un portail pour des tiers : les pièces s'impriment et se remettent en main propre. Il n'y a pas de paiement en ligne ni d'espace client.",
  },
  {
    q: "Puis-je exporter mes données ?",
    a: "Vos données restent les vôtres. Reçus, bons de caisse et bons de sortie s'exportent en CSV avec BOM, séparateur point-virgule et décimales à virgule : les fichiers s'ouvrent directement dans Excel francophone. Une organisation peut être entièrement supprimée sur demande.",
  },
  {
    q: "L'application fonctionne-t-elle bien sur téléphone ?",
    a: "C'est l'écran de référence, pas une adaptation. L'interface est conçue pour le comptoir et une utilisation à une main : navigation en bas d'écran, cartes plutôt que tableaux à défilement horizontal, et cibles tactiles d'au moins 44 pixels. Thème clair et sombre.",
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
            "Négoce Lagune",
            "BTP Konan & Fils",
            "Magasin Le Comptoir",
            "Transports Adjamé",
            "Ets Awa Diallo",
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
          title="Trois pièces, un seul comptoir"
          lead="Reçus, bons de caisse, bons de sortie : un espace unique, à l'en-tête de votre entreprise. Pas de module à activer, pas de paramétrage préalable."
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
          title="Trois carnets, quatre rôles"
          lead="Le propriétaire pilote, le gestionnaire administre, le caissier émet, la lecture seule consulte. Chacun voit ce qui le concerne, et rien de plus."
        />

        <Reveal className="mt-12">
          <DashboardMockup />
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Propriétaire",
              body: "En-tête de l'entreprise, membres, journal d'audit. Tous les droits, y compris la suppression.",
            },
            {
              title: "Gestionnaire",
              body: "Émet, corrige et supprime les pièces. Les écrans du quotidien et le journal d'audit.",
            },
            {
              title: "Caissier",
              body: "Émet et corrige, ne supprime pas. Le comptoir, rien d'autre.",
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

      {/* ------------------------------------------- Pourquoi CaisseOps */}
      <Section>
        <SectionHeading
          eyebrow={`Pourquoi ${SITE.name}`}
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
              title="Conçu pour des pièces qui font foi"
              lead="Vos reçus et vos bons engagent votre entreprise en cas de contrôle. Le niveau d'exigence n'est pas négociable."
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
          lead="Au comptoir, on émet entre deux clients, souvent à une main. L'interface n'est pas un bureau réduit : elle est pensée pour ce rythme."
        />

        <Reveal className="mt-14 flex flex-wrap items-start justify-center gap-10 sm:gap-16">
          <PhoneFrame label="Vue d'ensemble">
            <OwnerPhoneScreen />
          </PhoneFrame>
          <PhoneFrame label="Feuille de reçu">
            <ReceiptPhoneScreen />
          </PhoneFrame>
        </Reveal>

        <ul className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { icon: Smartphone, label: "Navigation en bas d'écran" },
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
          title="Ce que change une caisse tenue"
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
          lead="Tous les plans incluent les trois pièces, l'impression à votre en-tête et l'hébergement sécurisé. Sans engagement, résiliable à tout moment."
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
              Tenez votre caisse au propre, dès aujourd&apos;hui
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--m-ink-soft)] text-pretty">
              Créez votre organisation en deux minutes. Aucune carte bancaire
              n&apos;est demandée, et vos données restent exportables à tout
              moment.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryLink href="/signup">Créer un compte</PrimaryLink>
              <SecondaryLink
                href={`mailto:${SITE.contact}?subject=Démonstration%20${SITE.name}`}
              >
                Réserver une démonstration
              </SecondaryLink>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
