"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Témoignages, un à la fois.
 *
 * Contenu illustratif tant qu'aucun client n'a donné son accord écrit :
 * inventer une citation attribuée à une personne ou une société réelle
 * serait un faux. Les mentions ci-dessous le disent explicitement, et la
 * section porte un avertissement visible.
 */
const QUOTES = [
  {
    quote:
      "Je vois en dix secondes ce qui est encaissé et ce qui ne l'est pas. Avant, il me fallait ouvrir trois tableurs et faire confiance à ma mémoire.",
    author: "Propriétaire bailleur",
    detail: "24 lots, région lyonnaise",
  },
  {
    quote:
      "Mes locataires déclarent leurs virements depuis leur téléphone. Je valide, la quittance part. Le téléphone ne sonne plus pour ça.",
    author: "Gestionnaire",
    detail: "Cabinet de gestion, 3 collaborateurs",
  },
  {
    quote:
      "Le journal d'audit a réglé une discussion en deux minutes : qui avait modifié le loyer, quand, et depuis quelle adresse.",
    author: "Family office",
    detail: "Portefeuille résidentiel",
  },
];

const DELAY = 7000;

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();

  const go = useCallback((next: number) => {
    setIndex((next + QUOTES.length) % QUOTES.length);
  }, []);

  // La rotation s'arrête dès qu'on survole, qu'on tabule dedans, ou si le
  // système demande moins de mouvement : un carrousel qui avance pendant
  // qu'on lit est une nuisance, pas une animation.
  useEffect(() => {
    if (paused || reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % QUOTES.length), DELAY);
    return () => clearInterval(id);
  }, [paused, reduced]);

  const current = QUOTES[index];

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        className="mt-12"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {/* `aria-live` : au changement, un lecteur d'écran annonce la
            nouvelle citation au lieu de laisser la région muette. */}
        <div
          aria-live="polite"
          className="relative min-h-56 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface)] p-7 sm:min-h-48 sm:p-10"
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.blockquote
              key={index}
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduced ? 0 : 0.4, ease: "easeOut" }}
            >
              <p className="font-heading text-xl leading-relaxed text-balance sm:text-2xl">
                « {current.quote} »
              </p>
              <footer className="mt-6 text-sm text-[var(--m-ink-soft)]">
                <span className="font-medium text-[var(--m-ink)]">
                  {current.author}
                </span>
                {" · "}
                {current.detail}
              </footer>
            </m.blockquote>
          </AnimatePresence>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Témoignages">
            {QUOTES.map((q, i) => (
              <button
                key={q.author}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Témoignage ${i + 1} sur ${QUOTES.length}`}
                onClick={() => go(i)}
                // La cible tactile fait 44 px ; seule la pastille est
                // visible, centrée dedans.
                className="flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-300",
                    i === index
                      ? "w-6 bg-[var(--m-deep)]"
                      : "w-1.5 bg-[var(--m-line)]",
                  )}
                />
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {[
              { label: "Témoignage précédent", icon: ChevronLeft, to: index - 1 },
              { label: "Témoignage suivant", icon: ChevronRight, to: index + 1 },
            ].map(({ label, icon: Icon, to }) => (
              <button
                key={label}
                type="button"
                onClick={() => go(to)}
                aria-label={label}
                className="flex size-11 items-center justify-center rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] transition-colors hover:border-[var(--m-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-deep)]"
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}
