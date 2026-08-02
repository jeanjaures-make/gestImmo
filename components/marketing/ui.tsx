import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Primitives de la page de présentation.
 *
 * Elles n'utilisent pas le `kit` de l'application : celui-ci est réglé pour
 * la densité d'un back-office, là où une vitrine vit d'espace. Deux
 * grammaires distinctes valent mieux qu'une seule étirée aux deux usages.
 */

export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

export function Section({
  id,
  tone = "page",
  className,
  children,
}: {
  id?: string;
  /** `subtle` sert à séparer deux blocs sans tracer de trait. */
  tone?: "page" | "subtle";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt : sans cela, l'en-tête collant recouvre le titre visé
      // quand on arrive par une ancre.
      className={cn(
        "scroll-mt-20 py-20 sm:py-28",
        tone === "subtle" && "bg-[var(--m-subtle)]",
        className,
      )}
      style={tone === "subtle" ? undefined : { backgroundColor: "var(--m-page)" }}
    >
      <Container>{children}</Container>
    </section>
  );
}

/** Surtitre discret : situe la section sans hurler. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-sm font-medium tracking-wide text-[var(--m-sage-text)]">
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <header
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-lg leading-relaxed text-[var(--m-ink-soft)] text-pretty">
          {lead}
        </p>
      )}
    </header>
  );
}

const BUTTON_BASE =
  // min-h-12 : au-delà des 44 px recommandés, la cible reste confortable
  // au pouce. Le focus est visible et décalé, jamais supprimé.
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium " +
  "transition-[background-color,border-color,box-shadow,transform] duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)] " +
  "motion-safe:active:scale-[0.985]";

export function PrimaryLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        BUTTON_BASE,
        "bg-[var(--m-deep)] text-white shadow-sm hover:bg-[var(--m-petrol)]",
        "dark:text-[#101419]",
        className,
      )}
    />
  );
}

export function SecondaryLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        BUTTON_BASE,
        "border border-[var(--m-line)] bg-[var(--m-surface)] text-[var(--m-ink)]",
        "hover:border-[var(--m-deep)]",
        className,
      )}
    />
  );
}

/**
 * Bloc de contenu sur fond de surface.
 *
 * L'élévation au survol est volontairement infime : un déplacement d'un
 * pixel suffit à signaler l'interactivité, au-delà cela devient un effet.
 */
export function Panel({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface)]",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-300 hover:border-[var(--m-sage)] hover:shadow-[0_1px_2px_rgba(31,41,55,0.04),0_8px_24px_-12px_rgba(31,41,55,0.15)] motion-safe:hover:-translate-y-px",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Enveloppe de révélation au défilement — pur CSS, voir `globals.css`. */
export function Reveal({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "li" | "section";
}) {
  return <Tag className={cn("reveal", className)}>{children}</Tag>;
}
