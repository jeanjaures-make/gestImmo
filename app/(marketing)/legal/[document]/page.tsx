import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { Panel, Section, SecondaryLink } from "@/components/marketing/ui";
import { SITE } from "@/lib/site";

/**
 * Pages légales.
 *
 * Volontairement à l'état de squelette, et le disant. Le pied de page les
 * référence : les laisser en 404 donnerait l'impression d'un site
 * négligé, mais publier des mentions légales inventées serait pire — ces
 * textes engagent juridiquement l'éditeur et doivent être rédigés par
 * lui, avec ses coordonnées réelles et son conseil.
 *
 * Le squelette liste ce que chaque document doit contenir, pour que la
 * rédaction n'ait plus qu'à remplir.
 */
const DOCUMENTS = {
  "mentions-legales": {
    title: "Mentions légales",
    intro:
      "Informations sur l'éditeur du site, son hébergeur et les conditions d'utilisation.",
    todo: [
      "Dénomination sociale, forme juridique et capital",
      "Adresse du siège, numéro RCS et TVA intracommunautaire",
      "Nom du directeur de la publication",
      "Coordonnées de l'hébergeur",
      "Contact et médiation de la consommation",
    ],
  },
  confidentialite: {
    title: "Politique de confidentialité",
    intro:
      "Traitement des données personnelles des utilisateurs et de leurs locataires.",
    todo: [
      "Responsable de traitement et finalités",
      "Catégories de données et bases légales",
      "Sous-traitants et localisation de l'hébergement",
      "Durées de conservation",
      "Droits des personnes et modalités d'exercice",
      "Coordonnées du délégué à la protection des données",
    ],
  },
  cgu: {
    title: "Conditions générales d'utilisation",
    intro: "Règles d'accès et d'usage de la plateforme.",
    todo: [
      "Objet et champ d'application",
      "Comptes, rôles et responsabilités",
      "Disponibilité du service et maintenance",
      "Propriété intellectuelle",
      "Limitation de responsabilité",
      "Résiliation, réversibilité et sort des données",
      "Droit applicable et juridiction compétente",
    ],
  },
} as const;

type Slug = keyof typeof DOCUMENTS;

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const entry = DOCUMENTS[document as Slug];
  if (!entry) return {};

  return {
    title: `${entry.title} — ${SITE.name}`,
    description: entry.intro,
    // Un document non rédigé n'a rien à faire dans un index de recherche.
    robots: { index: false, follow: true },
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  const entry = DOCUMENTS[document as Slug];
  if (!entry) notFound();

  return (
    <Section className="py-16 sm:py-24">
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {entry.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--m-ink-soft)]">
          {entry.intro}
        </p>

        <Panel className="mt-10 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--m-sage)]/12 text-[var(--m-sage-text)]">
              <FileText className="size-4" />
            </span>
            <h2 className="font-heading font-semibold">
              Document en cours de rédaction
            </h2>
          </div>
          <p className="mt-3 leading-relaxed text-[var(--m-ink-soft)]">
            Ce texte engage juridiquement l&apos;éditeur : il est rédigé avec
            son conseil plutôt que généré. En attendant sa publication, voici
            les points qu&apos;il couvrira.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {entry.todo.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--m-sage)]"
                />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-[var(--m-ink-soft)]">
            Une question d&apos;ici là ?{" "}
            <a
              href={`mailto:${SITE.contact}`}
              className="font-medium text-[var(--m-deep)] underline underline-offset-4"
            >
              {SITE.contact}
            </a>
          </p>
        </Panel>

        <div className="mt-8">
          <SecondaryLink href="/">Retour à l&apos;accueil</SecondaryLink>
        </div>
      </div>
    </Section>
  );
}
