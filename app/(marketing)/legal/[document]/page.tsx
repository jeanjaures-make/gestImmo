import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";

import { Panel, Section, SecondaryLink } from "@/components/marketing/ui";
import {
  countTodos,
  DOCUMENTS,
  isDraft,
  type Block,
  type Slug,
} from "@/lib/legal";
import { SITE } from "@/lib/site";

/**
 * Pages légales.
 *
 * Le fond est rédigé — il décrit ce que le logiciel fait réellement des
 * données, ce que personne d'autre que l'auteur du code ne peut écrire avec
 * exactitude. L'identité de l'éditeur, elle, ne s'invente pas : elle reste
 * signalée en clair, et tant qu'il en subsiste, la page se déclare comme un
 * projet et refuse l'indexation. Un texte juridique incomplet qui se
 * présenterait comme définitif serait pire qu'une page absente.
 */
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
    // Un texte encore incomplet n'a rien à faire dans un index de recherche.
    robots: isDraft(entry) ? { index: false, follow: true } : undefined,
  };
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "paragraph") {
          return (
            <p
              key={index}
              className="mt-4 leading-relaxed text-[var(--m-ink-soft)]"
            >
              {block.text}
            </p>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={index} className="mt-4 space-y-2">
              {block.items.map((item) => (
                <li key={item} className="flex gap-2.5 leading-relaxed">
                  <span
                    aria-hidden
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[var(--m-sage)]"
                  />
                  <span className="text-[var(--m-ink-soft)]">{item}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={index}
            className="mt-4 flex gap-3 rounded-lg border border-dashed border-[var(--m-line)] bg-[var(--m-subtle)] p-4 leading-relaxed"
          >
            <PenLine
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-[var(--m-sage-text)]"
            />
            <span>
              <strong className="font-medium">À compléter — </strong>
              <span className="text-[var(--m-ink-soft)]">{block.text}</span>
            </span>
          </p>
        );
      })}
    </>
  );
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  const entry = DOCUMENTS[document as Slug];
  if (!entry) notFound();

  const todos = countTodos(entry);

  return (
    <Section className="py-16 sm:py-24">
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {entry.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--m-ink-soft)]">
          {entry.intro}
        </p>

        {todos > 0 && (
          <Panel className="mt-8 p-5">
            <h2 className="font-heading font-semibold">
              Projet — non opposable en l&apos;état
            </h2>
            <p className="mt-2 leading-relaxed text-[var(--m-ink-soft)]">
              Ce texte décrit fidèlement le fonctionnement de la plateforme,
              mais {todos === 1 ? "un point reste" : `${todos} points restent`}{" "}
              à compléter par l&apos;éditeur, et l&apos;ensemble doit être relu
              par un conseil avant toute commercialisation. Les passages
              concernés sont signalés ci-dessous.
            </p>
          </Panel>
        )}

        <div className="mt-10 space-y-10">
          {entry.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-heading text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              <Blocks blocks={section.blocks} />
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-[var(--m-ink-soft)]">
          Une question ?{" "}
          <a
            href={`mailto:${SITE.contact}`}
            className="font-medium text-[var(--m-deep)] underline underline-offset-4"
          >
            {SITE.contact}
          </a>
        </p>

        <div className="mt-8">
          <SecondaryLink href="/">Retour à l&apos;accueil</SecondaryLink>
        </div>
      </div>
    </Section>
  );
}
